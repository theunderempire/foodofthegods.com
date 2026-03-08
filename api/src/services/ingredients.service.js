import secret from "../secret.js";
import RequestService from "./request.service.js";

const requestService = new RequestService();

const IngredientService = function () {
  this.addIngredient = addIngredient;
  this.addManyIngredients = addManyIngredients;
  this.getIngredientListForUser = getIngredientListForUser;
  this.groupIngredientList = groupIngredientList;
  this.removeAllIngredients = removeAllIngredients;
  this.removeIngredient = removeIngredient;
  this.removeMarkedIngredients = removeMarkedIngredients;
  this.updateIngredient = updateIngredient;

  const ungroupedName = "ungrouped";

  const geminiUrl =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  // Updates the list for the user with the passed id with the request body
  async function addIngredient(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const ingredient = req.body.ingredient;

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});

        let ingredientList;
        if (docs?.ingredientList) {
          ingredientList = docs.ingredientList;
          const ungrouped = ingredientList.groups.find((g) => g.name === ungroupedName);
          if (ungrouped) {
            ungrouped.items.push({ ingredient, completed: false });
          } else {
            ingredientList.groups.push({
              name: ungroupedName,
              items: [{ ingredient, completed: false }],
            });
          }
        } else {
          ingredientList = {
            groups: [{ name: ungroupedName, items: [{ ingredient, completed: false }] }],
            lastModified: new Date().toString(),
          };
        }

        if (docs) {
          await collection.update({ userId }, { $set: { ingredientList } });
          response.json({ success: true, data: { ...docs, ingredientList } });
        } else {
          const newDoc = await collection.insert({ userId, ingredientList });
          response.json({ success: true, data: newDoc });
        }
      } catch (err) {
        console.error(`[ingredients] addIngredient error user="${userId}": ${err}`);
        response.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(response);
    }
  }

  async function addManyIngredients(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const ingredients = req.body.ingredients;

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});

        let ingredientList;
        if (docs?.ingredientList) {
          ingredientList = docs.ingredientList;
          const ungrouped = ingredientList.groups.find((g) => g.name === ungroupedName);
          if (ungrouped) {
            ungrouped.items = ungrouped.items.concat(
              ingredients.map((ingredient) => ({ ingredient, completed: false })),
            );
          } else {
            ingredientList.groups.push({
              name: ungroupedName,
              items: ingredients.map((ingredient) => ({ ingredient, completed: false })),
            });
          }
        } else {
          ingredientList = {
            groups: [
              {
                name: ungroupedName,
                items: ingredients.map((ingredient) => ({ ingredient, completed: false })),
              },
            ],
            lastModified: new Date().toString(),
          };
        }

        if (docs) {
          await collection.update({ userId }, { $set: { ingredientList } });
          response.json({ success: true, data: { ...docs, ingredientList } });
        } else {
          const newDoc = await collection.insert({ userId, ingredientList });
          response.json({ success: true, data: newDoc });
        }
      } catch (err) {
        console.error(`[ingredients] addManyIngredients error user="${userId}": ${err}`);
        response.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(response);
    }
  }

  // Returns the ingredient list for a specific user
  async function getIngredientListForUser(req, res) {
    const id = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, id)) {
      try {
        const docs = await collection.find({ userId: id }, {});
        res.json({ success: true, data: docs });
      } catch (err) {
        res.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  // Returns the 'ingredientlist' collection from the db
  function getIngredientListCollection(req) {
    return requestService.getCollection(req, "ingredientlist");
  }

  async function groupIngredientList(req, res) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const geminiAPIKey = secret.geminiApiKey;

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});
        if (docs?.ingredientList?.groups?.length) {
          console.log(`[ingredients] groupIngredientList: calling Gemini for user="${userId}"`);
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
                  }
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

          if (response.ok) {
            const responseBody = await response.json();
            const groupedListJSON = responseBody.candidates[0].content.parts[0].text;

            const strippedResponse = groupedListJSON.replace("```json", "").replace("```", "");
            const groupedItems = JSON.parse(strippedResponse);

            const newDocs = { ...docs };
            newDocs.ingredientList.groups = groupedItems;

            await collection.update(
              { userId },
              { $set: { ingredientList: newDocs.ingredientList } },
            );
            res.json({ success: true, data: newDocs });
          } else {
            const errBody = await response.text().catch(() => "(unreadable)");
            console.warn(
              `[ingredients] groupIngredientList: Gemini responded with status ${response.status} for user="${userId}": ${errBody}`,
            );
            if (response.status === 429) {
              res.json({ success: true, data: "Rate limited" });
            } else {
              res.json({
                success: false,
                data: `Gemini error: ${response.status} ${errBody}`,
              });
            }
          }
        } else {
          console.warn(
            `[ingredients] groupIngredientList: no ingredient groups found for user="${userId}"`,
          );
          res.json({ success: false, data: "could not find item group to update" });
        }
      } catch (err) {
        console.error(
          `[ingredients] groupIngredientList error user="${userId}": ${err.message || err}`,
        );
        res.json({ success: false, data: err.message || err });
      }
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  async function removeAllIngredients(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});
        docs.ingredientList = {
          groups: [],
          lastModified: new Date().toString(),
        };

        await collection.update({ userId }, { $set: { ingredientList: docs.ingredientList } });
        response.json({ success: true, data: docs });
      } catch (err) {
        console.error(`[ingredients] removeAllIngredients error user="${userId}": ${err}`);
        response.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(response);
    }
  }

  async function removeIngredient(req, res) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const ingredientId = parseInt(req.params.itemId);
    const groupName = req.params.groupName;

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});
        const itemGroupIndex = docs.ingredientList.groups.findIndex(
          (group) => group.name === groupName,
        );

        if (itemGroupIndex !== -1) {
          const itemGroup = docs.ingredientList.groups[itemGroupIndex];
          const itemIndex = itemGroup.items.findIndex((groupItem) => {
            return groupItem.ingredient.id === ingredientId;
          });

          if (itemIndex !== -1) {
            itemGroup.items.splice(itemIndex, 1);

            if (itemGroup.items.length < 1) {
              docs.ingredientList.groups.splice(itemGroupIndex, 1);
            }

            await collection.update({ userId }, { $set: { ingredientList: docs.ingredientList } });
            res.json({ success: true, data: docs });
          } else {
            res.json({
              success: true,
              data: docs,
              msg: "could not find item to update",
            });
          }
        } else {
          res.json({
            success: true,
            data: docs,
            msg: "could not find item group to update",
          });
        }
      } catch (err) {
        console.error(`[ingredients] removeIngredient error user="${userId}": ${err}`);
        res.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(res);
    }
  }

  async function removeMarkedIngredients(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});
        const removeGroups = [];

        docs.ingredientList.groups.forEach((group) => {
          group.items = group.items.filter((item) => !item.completed);

          if (group.items.length < 1) {
            removeGroups.push(group.name);
          }
        });

        removeGroups.forEach((removeGroupName) => {
          const groupIndex = docs.ingredientList.groups.findIndex(
            (group) => group.name === removeGroupName,
          );

          if (groupIndex !== -1) {
            docs.ingredientList.groups.splice(groupIndex, 1);
          }
        });

        await collection.update({ userId }, { $set: { ingredientList: docs.ingredientList } });
        response.json({ success: true, data: docs });
      } catch (err) {
        console.error(`[ingredients] removeMarkedIngredients error user="${userId}": ${err}`);
        response.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(response);
    }
  }

  async function updateIngredient(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, userId)) {
      const payload = req.body.payload;
      const ingredientItem = payload.ingredientListItem;
      const groupName = payload.groupName;

      try {
        const docs = await collection.findOne({ userId }, {});
        const itemGroup = docs.ingredientList.groups.find((group) => group.name === groupName);

        if (itemGroup) {
          const itemIndex = itemGroup.items.findIndex(
            (groupItem) => groupItem.ingredient.id === ingredientItem.ingredient.id,
          );

          if (itemIndex !== -1) {
            itemGroup.items[itemIndex] = ingredientItem;
            await collection.update({ userId }, { $set: { ingredientList: docs.ingredientList } });
            response.json({ success: true, data: docs });
          } else {
            response.json({
              success: true,
              data: docs,
              msg: "could not find item to update",
            });
          }
        } else {
          response.json({
            success: true,
            data: docs,
            msg: "could not find item group to update",
          });
        }
      } catch (err) {
        console.error(`[ingredients] updateIngredient error user="${userId}": ${err}`);
        response.json({ success: false, data: err.message });
      }
    } else {
      requestService.returnUnauthorized(response);
    }
  }
};

export default IngredientService;
