const secret = require("../secret");
const RequestService = require("./request.service");

const requestService = new RequestService();

const IngredientService = function () {
  this.addIngredient = addIngredient;
  this.addManyIngredients = addManyIngredients;
  this.clearIngredientList = clearIngredientList;
  this.clearMarkedIngredients = clearMarkedIngredients;
  this.getIngredientListForUser = getIngredientListForUser;
  this.groupIngredientList = groupIngredientList;
  this.removeIngredient = removeIngredient;
  this.updateIngredient = updateIngredient;

  const ungroupedName = "ungrouped";

  const geminiUrl =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const geminiAPIKey = secret.geminiApiKey;

  // Updates the list for the user with the passed id with the request body
  function addIngredient(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const ingredient = req.body.ingredient;

    if (requestService.checkUser(req, userId)) {
      collection.findOne({ userId }, {}, function (_e, docs) {
        if (docs.ingredientList) {
          // exists
          const ungrouped = docs.ingredientList.groups.find(
            (group) => group.name === ungroupedName
          );

          if (ungrouped) {
            ungrouped.items.push({ ingredient: ingredient, completed: false });
          } else {
            docs.ingredientList.groups.push({
              name: ungroupedName,
              items: [{ ingredient: ingredient, completed: false }],
            });
          }
        } else {
          docs.ingredientList = {
            groups: [
              {
                name: ungroupedName,
                items: [{ ingredient: ingredient, completed: false }],
              },
            ],
            lastModified: new Date().toString(),
          };
        }

        collection.update({ userId }, { ...docs }, function (err, result) {
          if (!err) {
            response.json({ success: true, data: docs });
          } else {
            requestService.printMsg(result, err, "error");
          }
        });
      });
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  function addManyIngredients(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const ingredients = req.body.ingredients;

    if (requestService.checkUser(req, userId)) {
      collection.findOne({ userId }, {}, function (_e, docs) {
        if (docs.ingredientList) {
          // exists
          const ungrouped = docs.ingredientList.groups.find(
            (group) => group.name === ungroupedName
          );

          if (ungrouped) {
            ungrouped.items = ungrouped.items.concat(
              ingredients.map((ingredient) => ({
                ingredient: ingredient,
                completed: false,
              }))
            );
          } else {
            docs.ingredientList.groups.push({
              name: ungroupedName,
              items: ingredients.map((ingredient) => ({
                ingredient: ingredient,
                completed: false,
              })),
            });
          }
        } else {
          docs.ingredientList = {
            groups: [
              {
                name: ungroupedName,
                items: ingredients.map((ingredient) => ({
                  ingredient: ingredient,
                  completed: false,
                })),
              },
            ],
            lastModified: new Date().toString(),
          };
        }

        collection.update({ userId }, { ...docs }, function (err, result) {
          if (!err) {
            response.json({ success: true, data: docs });
          } else {
            requestService.printMsg(result, err, "error");
          }
        });
      });
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  function clearIngredientList(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, userId)) {
      collection.findOne({ userId }, {}, function (_e, docs) {
        docs.ingredientList = {
          groups: [],
          lastModified: new Date().toString(),
        };

        collection.update({ userId }, { ...docs }, function (err, result) {
          if (!err) {
            response.json({ success: true, data: docs });
          } else {
            requestService.printMsg(result, err, "error");
          }
        });
      });
    }
  }

  function clearMarkedIngredients(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, userId)) {
      collection.findOne({ userId }, {}, function (_e, docs) {
        docs.ingredientList.groups.forEach((group) => {
          group.items = group.items.filter((item) => !item.completed);
        });

        collection.update({ userId }, { ...docs }, function (err, result) {
          if (!err) {
            response.json({ success: true, data: docs });
          } else {
            requestService.printMsg(result, err, "error");
          }
        });
      });
    }
  }

  // Returns the ingredient list for a specific user
  function getIngredientListForUser(req, res) {
    const id = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, id)) {
      collection.find({ userId: id }, {}, function (_e, docs) {
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
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, userId)) {
      collection.findOne({ userId }, {}, async function (_e, docs) {
        if (docs?.ingredientList?.groups?.length) {
          const groups = docs.ingredientList.groups;
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
              const groupedListJSON =
                responseBody.candidates[0].content.parts[0].text;

              const strippedResponse = groupedListJSON.replace("```json", "");
              strippedResponse.replace("```", "");
              const groupedItems = JSON.parse(strippedResponse);

              const newDocs = { ...docs };
              newDocs.ingredientList.groups = groupedItems;

              collection.update({ userId }, newDocs, function (err, result) {
                if (!err) {
                  res.json({ success: true, data: newDocs });
                } else {
                  requestService.printMsg(result, err, "error");
                }
              });
            } else {
              if (response.status === 429) {
                res.json({ success: true, data: "Rate limited" });
              }
            }
          } catch (err) {
            res.json({ success: true, data: err });
          }
        } else {
          requestService.printMsg(
            res,
            err,
            "could not find item group to update"
          );
        }
      });
    }
  }

  function removeIngredient(req, res) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const ingredientId = parseInt(req.params.itemId);
    const groupName = req.params.groupName;

    if (requestService.checkUser(req, userId)) {
      collection.findOne({ userId }, {}, function (err1, docs) {
        const itemGroup = docs.ingredientList.groups.find(
          (group) => group.name === groupName
        );

        if (itemGroup) {
          const itemIndex = itemGroup.items.findIndex((groupItem) => {
            return groupItem.ingredient.id === ingredientId;
          });

          if (itemIndex !== -1) {
            itemGroup.items.splice(itemIndex, 1);
            collection.update({ userId }, { ...docs }, function (err2) {
              if (!err2) {
                res.json({ success: true, data: docs });
              } else {
                requestService.printMsg(res, err2, "error");
              }
            });
          } else {
            requestService.printMsg(res, err1, "could not find item to update");
          }
        } else {
          requestService.printMsg(
            res,
            err1,
            "could not find item group to update"
          );
        }
      });
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  function updateIngredient(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const payload = req.body.payload;
    const ingredientItem = payload.ingredientListItem;
    const groupName = payload.groupName;

    if (requestService.checkUser(req, userId)) {
      collection.findOne({ userId }, {}, function (_e, docs) {
        const itemGroup = docs.ingredientList.groups.find(
          (group) => group.name === groupName
        );

        if (itemGroup) {
          const itemIndex = itemGroup.items.findIndex(
            (groupItem) =>
              groupItem.ingredient.id === ingredientItem.ingredient.id
          );

          if (itemIndex !== -1) {
            itemGroup.items[itemIndex] = ingredientItem;
            collection.update({ userId }, { ...docs }, function (err, result) {
              if (!err) {
                response.json({ success: true, data: docs });
              } else {
                requestService.printMsg(result, err, "error");
              }
            });
          } else {
            requestService.printMsg(
              result,
              err,
              "could not find item to update"
            );
          }
        } else {
          requestService.printMsg(
            result,
            err,
            "could not find item group to update"
          );
        }
      });
    } else {
      requestService.returnUnauthorized(res);
    }
  }
};

module.exports = IngredientService;
