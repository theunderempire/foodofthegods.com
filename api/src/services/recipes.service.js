import RequestService from "./request.service.js";
import secret from "../secret.js";

var requestService = new RequestService();

const geminiUrl =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const geminiAPIKey = secret.geminiApiKey;

// A service for making recipe operations
var RecipesService = function () {
  this.addRecipeForUser = addRecipeForUser;
  this.deleteRecipe = deleteRecipe;
  this.getRecipesForUser = getRecipesForUser;
  this.getSingleRecipe = getSingleRecipe;
  this.importRecipeFromUrl = importRecipeFromUrl;
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
        requestService.printMsg(res, null, "recipe added");
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
      const docs = await recipeCollection.find({ _id: recipeID }, {});
      if (!docs.length) {
        console.warn(`[recipes] deleteRecipe: recipe not found id="${recipeID}"`);
      }

      await userCollection.update(
        { username: req.decoded.username },
        { $pull: { recipeList: recipeID } },
      );

      const usersWithRecipe = await userCollection.find({ recipeList: recipeID }, { _id: 1 });
      if (!usersWithRecipe.length) {
        console.log(`[recipes] deleting recipe from db id="${recipeID}" (no remaining owners)`);
        await recipeCollection.remove({ _id: recipeID });
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
        const users = await userCollection.find({ username: username }, { recipeList: 1 });
        const recipes = await recipeCollection.find(
          { _id: { $in: users[0]?.recipeList ?? [] } },
          { name: 1, prepDuration: 1, cookDuration: 1, imageUrl: 1 },
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

  async function getSingleRecipe(req, res) {
    var collection = getRecipeListCollection(req);
    try {
      const docs = await collection.find({ _id: req.params.id }, {});
      res.json({ success: true, data: docs });
    } catch (err) {
      res.json({ success: false, data: err.message });
    }
  }

  // Updates the recipe with the passed `id` param with the
  // recipe passed in the request body
  async function updateRecipe(req, res) {
    var collection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);
    var recipeID = req.params.id;
    var updatedRecipe = req.body;

    try {
      const users = await userCollection.find(
        { username: req.decoded.username, recipeList: recipeID },
        { _id: 1 },
      );
      if (!users || !users.length) {
        console.warn(
          `[recipes] updateRecipe: recipe id="${recipeID}" not in recipeList for user="${req.decoded.username}"`,
        );
        return requestService.returnUnauthorized(res);
      }
      const { _id, ...fields } = updatedRecipe;
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

  async function importRecipeFromUrl(req, res) {
    const url = req.body.url;
    if (!url) {
      return res.json({ success: false, data: "url is required" });
    }

    console.log(`[recipes] importRecipeFromUrl: fetching "${url}"`);
    try {
      const pageResponse = await fetch(url);
      const html = await pageResponse.text();

      const ogImageMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      const imageUrl = ogImageMatch?.[1] ?? "";

      const text = html
        .replace(/<(\w+)[^>]*class=["'][^"']*recipeintro[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(
          /<(script|style|nav|header|footer|aside|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1>/gi,
          " ",
        )
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Extract the recipe from the following webpage text and return ONLY a JSON object with no markdown fencing, no explanation, just the JSON. Use this exact shape:
{
  "name": "...",
  "prepDuration": "...",
  "cookDuration": "...",
  "servings": "...",
  "ingredients": [{ "id": 1, "name": "...", "amount": 1.5, "unit": "..." }],
  "directions": [{ "id": 1, "text": "...", "duration": "" }]
}

Webpage text:
${text.slice(0, 50000)}`,
                },
              ],
            },
          ],
        }),
        headers: {
          "x-goog-api-key": geminiAPIKey,
          "Content-Type": "application/json",
        },
      });

      const responseBody = await geminiResponse.json();
      const rawText = responseBody.candidates[0].content.parts[0].text;
      const stripped = rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      const recipe = JSON.parse(stripped);
      if (imageUrl) recipe.imageUrl = imageUrl;
      console.log(
        `[recipes] importRecipeFromUrl: successfully parsed recipe "${recipe.name}" from "${url}"`,
      );
      res.json({ success: true, data: recipe });
    } catch (err) {
      console.error(`[recipes] importRecipeFromUrl error for "${url}": ${err.message || err}`);
      res.json({
        success: false,
        data: err.message || "Failed to import recipe",
      });
    }
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
