var RequestService = require("./request.service");
const secret = require("../secret");

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
  function addRecipeForUser(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);

    if (req.body.userId === req.decoded.username) {
      recipeCollection.insert(req.body, function (err, result) {
        userCollection.update(
          { username: req.decoded.username },
          { $push: { recipeList: result._id } }
        );
        requestService.printMsg(res, err, "recipe added");
      });
    }
  }

  // Deletes the recipe with the requested recipeID
  function deleteRecipe(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);
    var recipeID = req.params.id;

    recipeCollection.find({ _id: recipeID }, {}, function (e, docs) {
      // Remove from recipeList
      userCollection.update(
        { username: req.decoded.username },
        { $pull: { recipeList: recipeID } },
        function (e, result) {
          userCollection.find(
            { recipeList: recipeID },
            { _id: 1 },
            function (e, usersWithRecipe) {
              // If the recipe is no longer in anyone's list, delete it
              if (!usersWithRecipe.length) {
                recipeCollection.remove({ _id: recipeID }, function (err) {});
              }
            }
          );
        }
      );

      requestService.printMsg(res, e, "recipe deleted");
    });
  }

  // Returns all the recipes that are owned by the user with userID id
  function getRecipesForUser(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);
    var username = req.params.userId;

    if (requestService.checkUser(req, username)) {
      userCollection.find(
        { username: username },
        { recipeList: 1 },
        function (e, recipeIDs) {
          recipeCollection.find(
            { _id: { $in: recipeIDs[0].recipeList } },
            { name: 1, prepDuration: 1, cookDuration: 1 },
            function (e, recipes) {
              res.json({ success: true, data: recipes });
            }
          );
        }
      );
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  function getSingleRecipe(req, res) {
    var collection = getRecipeListCollection(req);

    collection.find({ _id: req.params.id }, {}, function (e, docs) {
      res.json({ success: true, data: docs });
    });
  }

  // Updates the recipe with the passed `id` param with the
  // recipe passed in the request body
  function updateRecipe(req, res) {
    var collection = getRecipeListCollection(req);
    var recipeID = req.params.id;
    var updatedRecipe = req.body;

    collection.find({ _id: recipeID }, {}, function (e, docs) {
      if (requestService.checkUser(req, docs[0].userId)) {
        collection.update({ _id: recipeID }, updatedRecipe, function (err) {
          requestService.printMsg(res, err, "recipe updated");
        });
      } else {
        requestService.returnUnauthorized(res);
      }
    });
  }

  async function importRecipeFromUrl(req, res) {
    const url = req.body.url;
    if (!url) {
      return res.json({ success: false, data: "url is required" });
    }

    try {
      const pageResponse = await fetch(url);
      const html = await pageResponse.text();
      const text = html
        .replace(/<(\w+)[^>]*class=["'][^"']*recipeintro[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(script|style|nav|header|footer|aside|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
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
      const stripped = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const recipe = JSON.parse(stripped);

      res.json({ success: true, data: recipe });
    } catch (err) {
      res.json({ success: false, data: err.message || "Failed to import recipe" });
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

module.exports = RecipesService;
