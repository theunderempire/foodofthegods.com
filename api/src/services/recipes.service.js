import { randomUUID } from "crypto";
import RequestService from "./request.service.js";
import { generateThumbnail, deleteThumbnail } from "./thumbnail.service.js";
import { renderSharePreviewHtml } from "./sharePreview.js";
import { safeFetch } from "./safeFetch.js";
import {
  getGeminiConfig,
  requestGemini,
  extractCandidateText,
  parseJsonLoosely,
} from "./gemini.service.js";

var requestService = new RequestService();

// monk forwards the options object to the driver verbatim, and the driver reads
// only `projection` (or the deprecated `fields`). A bare `{name: 1}` is silently
// ignored, returning whole documents — including password hashes and API keys
// when querying the users collection. Always wrap field lists in this.
function projection(fields) {
  return { projection: fields };
}

// Returned to anyone holding a share link, so this must exclude `userId`, which
// would reveal the owning account.
const PUBLIC_RECIPE_FIELDS = {
  name: 1,
  prepDuration: 1,
  cookDuration: 1,
  servings: 1,
  ingredients: 1,
  directions: 1,
  imageUrl: 1,
};

// A service for making recipe operations
var RecipesService = function () {
  this.addRecipeForUser = addRecipeForUser;
  this.deleteRecipe = deleteRecipe;
  this.getRecipesForUser = getRecipesForUser;
  this.getSingleRecipe = getSingleRecipe;
  this.getRecipeSharePreview = getRecipeSharePreview;
  this.importRecipeFromUrl = importRecipeFromUrl;
  this.importRecipeFromText = importRecipeFromText;
  this.updateRecipe = updateRecipe;

  // Adds a recipe to a user's recipe list
  async function addRecipeForUser(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);

    if (req.body.userId === req.decoded.username) {
      try {
        const result = await recipeCollection.insert(req.body);
        console.log(`[recipes] recipe added id="${result._id}" user="${req.decoded.username}"`);
        await userCollection.update(
          { username: req.decoded.username },
          { $push: { recipeList: result._id } },
        );
        const thumbnailUrl = await generateThumbnail(result._id, req.body.imageUrl);
        if (thumbnailUrl) {
          await recipeCollection.update({ _id: result._id }, { $set: { imageUrl: thumbnailUrl } });
        }
        res.json({ success: true, data: { msg: "recipe added", id: result._id } });
      } catch (err) {
        console.error(
          `[recipes] addRecipeForUser error for user="${req.decoded.username}": ${err}`,
        );
        requestService.printMsg(res, err, "recipe added");
      }
    } else {
      console.warn(
        `[recipes] addRecipeForUser userId mismatch: body.userId="${req.body.userId}" token="${req.decoded.username}"`,
      );
      requestService.returnUnauthorized(res);
    }
  }

  // Deletes the recipe with the requested recipeID
  async function deleteRecipe(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);
    var recipeID = req.params.id;

    try {
      if (!(await ownsRecipe(req, recipeID))) {
        console.warn(
          `[recipes] deleteRecipe: recipe id="${recipeID}" not in recipeList for user="${req.decoded.username}"`,
        );
        return requestService.returnUnauthorized(res);
      }

      await userCollection.update(
        { username: req.decoded.username },
        { $pull: { recipeList: recipeID } },
      );

      const usersWithRecipe = await userCollection.find(
        { recipeList: recipeID },
        projection({ _id: 1 }),
      );
      if (!usersWithRecipe.length) {
        console.log(`[recipes] deleting recipe from db id="${recipeID}" (no remaining owners)`);
        await recipeCollection.remove({ _id: recipeID });
        await deleteThumbnail(recipeID);
      }

      requestService.printMsg(res, null, "recipe deleted");
    } catch (err) {
      console.error(`[recipes] deleteRecipe error id="${recipeID}": ${err}`);
      requestService.printMsg(res, err, "recipe deleted");
    }
  }

  // Returns all the recipes that are owned by the user with userID id
  async function getRecipesForUser(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);
    var username = req.params.userId;

    if (requestService.checkUser(req, username)) {
      try {
        const users = await userCollection.find(
          { username: username },
          projection({ recipeList: 1 }),
        );
        const recipes = await recipeCollection.find(
          { _id: { $in: users[0]?.recipeList ?? [] } },
          projection({ name: 1, prepDuration: 1, cookDuration: 1, imageUrl: 1 }),
        );
        res.json({ success: true, data: recipes });
      } catch (err) {
        console.error(`[recipes] getRecipesForUser error user="${username}": ${err}`);
        res.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  // Intentionally unauthenticated: share links (/recipes/:shareId/share) let
  // people without an account view a recipe. The recipe id doubles as the share
  // capability, so the response is limited to display fields and the route is
  // rate limited to blunt id enumeration.
  async function getSingleRecipe(req, res) {
    var collection = getRecipeListCollection(req);
    try {
      const docs = await collection.find({ _id: req.params.id }, projection(PUBLIC_RECIPE_FIELDS));
      res.json({ success: true, data: docs });
    } catch (err) {
      res.json({ success: false, data: err.message });
    }
  }

  // Server-rendered HTML for social crawlers hitting a share link — same
  // public/unauthenticated posture as getSingleRecipe, and the same
  // PUBLIC_RECIPE_FIELDS cap on what leaks to link previews. Lookup errors
  // (e.g. garbage ids) render as not-found rather than an error payload so
  // crawlers still get a valid page.
  async function getRecipeSharePreview(req, res) {
    var collection = getRecipeListCollection(req);
    let recipe = null;
    try {
      const docs = await collection.find({ _id: req.params.id }, projection(PUBLIC_RECIPE_FIELDS));
      recipe = docs[0] ?? null;
    } catch (err) {
      console.warn(`[recipes] getRecipeSharePreview lookup failed id="${req.params.id}": ${err}`);
    }
    res.set("Content-Type", "text/html; charset=utf-8");
    res.set("Cache-Control", "public, max-age=300");
    res.status(recipe ? 200 : 404).send(renderSharePreviewHtml(recipe, req.params.id));
  }

  // Updates the recipe with the passed `id` param with the
  // recipe passed in the request body
  async function updateRecipe(req, res) {
    var collection = getRecipeListCollection(req);
    var recipeID = req.params.id;
    var updatedRecipe = req.body;

    try {
      if (!(await ownsRecipe(req, recipeID))) {
        console.warn(
          `[recipes] updateRecipe: recipe id="${recipeID}" not in recipeList for user="${req.decoded.username}"`,
        );
        return requestService.returnUnauthorized(res);
      }
      const { _id, ...fields } = updatedRecipe;
      const existing = await collection.findOne({ _id: recipeID }, projection({ imageUrl: 1 }));
      if (fields.imageUrl !== existing?.imageUrl) {
        const thumbnailUrl = await generateThumbnail(recipeID, fields.imageUrl);
        if (thumbnailUrl) fields.imageUrl = thumbnailUrl;
      }
      await collection.update({ _id: recipeID }, { $set: fields });
      console.log(`[recipes] recipe updated id="${recipeID}" user="${req.decoded.username}"`);
      requestService.printMsg(res, null, "recipe updated");
    } catch (err) {
      console.error(
        `[recipes] updateRecipe error id="${recipeID}" user="${req.decoded.username}": ${err}`,
      );
      res.json({ success: false, data: err.message });
    }
  }

  function parseIso8601Duration(str) {
    if (typeof str !== "string") return str;
    const match = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
    if (!match) return str;
    const hours = parseInt(match[1] ?? "0");
    const minutes = parseInt(match[2] ?? "0");
    if (hours && minutes) return `${hours} hr ${minutes} min`;
    if (hours) return `${hours} hr`;
    if (minutes) return `${minutes} min`;
    return str;
  }

  function buildImportPrompt(text) {
    return `Extract the recipe from the following text and return ONLY a JSON object with no markdown fencing, no explanation, just the JSON. Use this exact shape:
{
  "name": "...",
  "prepDuration": "...",
  "cookDuration": "...",
  "servings": "...",
  "ingredients": [{ "id": 1, "name": "...", "amount": 1.5, "unit": "..." }],
  "directions": [{ "id": 1, "text": "...", "duration": "" }]
}

prepDuration and cookDuration must be human-readable strings like "30 min" or "1 hr 30 min", not ISO 8601 format.

Recipe text:
${text.slice(0, 50000)}`;
  }

  async function callGemini(text, apiKey, geminiUrl, attempt = 1) {
    const geminiResponse = await requestGemini({
      url: geminiUrl,
      apiKey,
      prompt: buildImportPrompt(text),
    });
    const responseBody = await geminiResponse.json();
    const candidate = extractCandidateText(responseBody);

    if (!candidate.text) {
      const reason = candidate.reason;
      // Gemini sheds load under pressure; a couple of backed-off retries turn a
      // transient 503 into a successful import rather than a user-visible failure.
      const isTransient =
        responseBody.error?.code === 503 ||
        (typeof reason === "string" && reason.toLowerCase().includes("high demand"));
      if (isTransient && attempt < 3) {
        const delay = attempt * 3000;
        console.log(
          `[recipes] callGemini: retrying in ${delay / 1000}s (attempt ${attempt}/3): ${reason}`,
        );
        await new Promise((r) => setTimeout(r, delay));
        return callGemini(text, apiKey, geminiUrl, attempt + 1);
      }
      throw new Error(`Gemini API error: ${reason}`);
    }

    const parsed = parseJsonLoosely(candidate.text, "object");
    parsed.prepDuration = parseIso8601Duration(parsed.prepDuration);
    parsed.cookDuration = parseIso8601Duration(parsed.cookDuration);
    parsed.ingredients = (parsed.ingredients ?? []).map((i) => ({
      ...i,
      id: randomUUID(),
      amount: typeof i.amount === "number" ? Math.round(i.amount * 100) / 100 : (i.amount ?? ""),
    }));
    parsed.directions = (parsed.directions ?? []).map((d) => ({ ...d, id: randomUUID() }));
    return parsed;
  }

  async function importRecipeFromUrl(req, res) {
    const url = req.body.url;
    if (!url) {
      return res.json({ success: false, data: "url is required" });
    }

    const { apiKey, url: geminiUrl } = await getGeminiConfig(req);
    if (!apiKey) {
      return res.json({ success: false, data: "No Gemini API key set. Add one in Settings." });
    }

    console.log(`[recipes] importRecipeFromUrl: fetching "${url}"`);
    try {
      const pageResponse = await safeFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      const html = await pageResponse.text();

      const ogImageMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const imageUrl = ogImageMatch?.[1] ?? "";

      // Prefer JSON-LD structured data if present (cleaner than stripping HTML)
      const jsonLdMatch = html.match(
        /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      );
      let text;
      if (jsonLdMatch) {
        const schemas = jsonLdMatch
          .map((tag) => {
            try {
              return JSON.parse(tag.replace(/<\/?script[^>]*>/gi, "").trim());
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        const recipe = schemas.find(
          (s) =>
            s["@type"] === "Recipe" || (Array.isArray(s["@type"]) && s["@type"].includes("Recipe")),
        );
        if (recipe) {
          text = JSON.stringify(recipe);
          console.log(`[recipes] importRecipeFromUrl: using JSON-LD schema for "${url}"`);
        }
      }

      if (!text) {
        text = html
          .replace(/<(\w+)[^>]*class=["'][^"']*recipeintro[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, " ")
          .replace(
            /<(script|style|nav|header|footer|aside|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1>/gi,
            " ",
          )
          .replace(/<!--[\s\S]*?-->/g, " ")
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }

      const recipe = await callGemini(text, apiKey, geminiUrl);
      if (imageUrl) recipe.imageUrl = imageUrl;
      console.log(
        `[recipes] importRecipeFromUrl: successfully parsed recipe "${recipe.name}" from "${url}"`,
      );
      res.json({ success: true, data: recipe });
    } catch (err) {
      console.error(`[recipes] importRecipeFromUrl error for "${url}": ${err.message || err}`);
      res.json({ success: false, data: err.message || "Failed to import recipe" });
    }
  }

  async function importRecipeFromText(req, res) {
    const text = req.body.text;
    if (!text) {
      return res.json({ success: false, data: "text is required" });
    }

    const { apiKey, url: geminiUrl } = await getGeminiConfig(req);
    if (!apiKey) {
      return res.json({ success: false, data: "No Gemini API key set. Add one in Settings." });
    }

    console.log(`[recipes] importRecipeFromText: parsing pasted recipe`);
    try {
      const recipe = await callGemini(text, apiKey, geminiUrl);
      console.log(`[recipes] importRecipeFromText: successfully parsed recipe "${recipe.name}"`);
      res.json({ success: true, data: recipe });
    } catch (err) {
      console.error(`[recipes] importRecipeFromText error: ${err.message || err}`);
      res.json({ success: false, data: err.message || "Failed to parse recipe" });
    }
  }

  // Ownership is membership in the caller's own recipeList rather than a field on
  // the recipe, because a recipe can be owned by more than one user.
  async function ownsRecipe(req, recipeID) {
    const users = await getUserCollection(req).find(
      { username: req.decoded.username },
      projection({ recipeList: 1 }),
    );
    return Boolean(users?.[0]?.recipeList?.some((id) => id.toString() === recipeID.toString()));
  }

  // Returns the 'recipelist' collection from the db
  function getRecipeListCollection(req) {
    return requestService.getCollection(req, "recipelist");
  }

  // Returns the user collection
  function getUserCollection(req) {
    return requestService.getCollection(req, "users");
  }
};

export default RecipesService;
