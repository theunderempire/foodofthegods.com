const secret = require("../secret");
var RequestService = require("./request.service");

var requestService = new RequestService();

var IngredientService = function () {
  this.addOrUpdateIngredient = addOrUpdateIngredient;
  this.getIngredientListForUser = getIngredientListForUser;
  this.groupIngredientList = groupIngredientList;

  const geminiUrl =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const geminiAPIKey = secret.geminiApiKey;

  // Updates the list for the user with the passed id with the request body
  function addOrUpdateIngredient(req, res) {
    var id = req.params.userId;
    var collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, id)) {
      collection.update(
        { userId: id },
        {
          userId: id,
          ingredientList: req.body.ingredientList,
          completedList: req.body.completedList,
        },
        { upsert: true },
        function (err, result) {
          requestService.printMsg(res, err, "list updated");
        }
      );
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  // Returns the ingredient list for a specific user
  function getIngredientListForUser(req, res) {
    var id = req.params.userId;
    var collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, id)) {
      collection.find({ userId: id }, {}, function (e, docs) {
        res.json({ success: true, data: docs });
      });
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  // Returns the 'recipeList' collection from the db
  function getIngredientListCollection(req) {
    return requestService.getCollection(req, "ingredientlist");
  }

  async function groupIngredientList(req, res) {
    const groups = req.body.groups;

    const response = await fetch(geminiUrl, {
      method: "POST",
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Group these grocery ingredients by their typical grocery store section. Return ONLY a JSON array of category objects. No explanation, no markdown, no whitespace, no special characters, just the JSON object. Include the entire ingredient JSON object in the response.

                Ingredients: ${JSON.stringify(groups)}

                Example format:
    [
                  {
                    "name": "Dairy",
                    "items": [
                      {
                        "ingredient": {
                          "name": "Milk",
                          "unit": "",
                          "amount": 1,
                          "id": 1757275289835
                        },
                        "completed": false
                      },
                      {
                        "ingredient": {
                          "name": "test3",
                          "unit": "",
                          "amount": 1,
                          "id": 1768070973898
                        },
                        "completed": true
                      }
                    ]
                  },
                  {
                    "name": "Produce",
                    "items": [
                      {
                        "ingredient": {
                          "name": "apples",
                          "unit": "lb",
                          "amount": 1,
                          "id": 1857275289835
                        },
                        "completed": true
                      },
                      {
                        "ingredient": {
                          "name": "Zucchini",
                          "unit": "oz",
                          "amount": 1,
                          "id": 1768070953898
                        },
                        "completed": false
                      }
                    ]
                  ]`,
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

    try {
      if (response.ok) {
        const responseBody = await response.json();

        console.log(responseBody);

        const groupedList = responseBody.candidates[0].content.parts[0].text;

        res.json({ success: true, data: groupedList });
      } else {
        if (response.status === 429) {
          res.json({ success: true, data: "Rate limited" });
        }
      }
    } catch (err) {
      res.json({ success: true, data: err });
    }
  }
};

module.exports = IngredientService;
