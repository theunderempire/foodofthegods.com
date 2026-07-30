import { randomUUID } from "crypto";
import RequestService from "./request.service.js";
import { broadcast } from "./sse.js";

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

  const defaultGeminiModel = "gemini-2.5-flash";

  // Updates the list for the user with the passed id with the request body
  async function addIngredient(req, response) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);
    const ingredient = req.body.ingredient;

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});

        if (docs?.ingredientList?.grouping) {
          response.json({ success: false, data: "List is being grouped, try again in a moment." });
          return;
        }

        let ingredientList;
        if (docs?.ingredientList) {
          ingredientList = docs.ingredientList;
          const newItem = { ingredient: { ...ingredient, id: randomUUID() }, completed: false };
          const ungrouped = ingredientList.groups.find((g) => g.name === ungroupedName);
          if (ungrouped) {
            ungrouped.items.push(newItem);
          } else {
            ingredientList.groups.push({
              name: ungroupedName,
              items: [newItem],
            });
          }
        } else {
          ingredientList = {
            groups: [
              {
                name: ungroupedName,
                items: [{ ingredient: { ...ingredient, id: randomUUID() }, completed: false }],
              },
            ],
            lastModified: new Date().toString(),
          };
        }

        if (docs) {
          await collection.update({ userId }, { $set: { ingredientList } });
          broadcast(userId, { ...docs, ingredientList });
          response.json({ success: true, data: { ...docs, ingredientList } });
        } else {
          const newDoc = await collection.insert({ userId, ingredientList });
          broadcast(userId, newDoc);
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

        if (docs?.ingredientList?.grouping) {
          response.json({ success: false, data: "List is being grouped, try again in a moment." });
          return;
        }

        let ingredientList;
        const toItems = (ing) => ({ ingredient: { ...ing, id: randomUUID() }, completed: false });

        if (docs?.ingredientList) {
          ingredientList = docs.ingredientList;
          const ungrouped = ingredientList.groups.find((g) => g.name === ungroupedName);
          if (ungrouped) {
            ungrouped.items = ungrouped.items.concat(ingredients.map(toItems));
          } else {
            ingredientList.groups.push({
              name: ungroupedName,
              items: ingredients.map(toItems),
            });
          }
        } else {
          ingredientList = {
            groups: [{ name: ungroupedName, items: ingredients.map(toItems) }],
            lastModified: new Date().toString(),
          };
        }

        if (docs) {
          await collection.update({ userId }, { $set: { ingredientList } });
          broadcast(userId, { ...docs, ingredientList });
          response.json({ success: true, data: { ...docs, ingredientList } });
        } else {
          const newDoc = await collection.insert({ userId, ingredientList });
          broadcast(userId, newDoc);
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

  // Parses the Gemini grouping response ([{ name, itemIds }]) and rebuilds full groups
  // from the original items, so the model can only move items — never alter or drop them.
  function buildGroupsFromResponse(rawText, itemsById) {
    let parsed;
    try {
      parsed = JSON.parse(rawText.trim());
    } catch {
      // Fall back to stripping markdown fencing / surrounding prose.
      let json = rawText
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      const arrayMatch = json.match(/\[[\s\S]*\]/);
      if (arrayMatch) json = arrayMatch[0];
      parsed = JSON.parse(json);
    }
    if (!Array.isArray(parsed)) {
      throw new Error("Gemini grouping response was not a JSON array");
    }

    const placed = new Set();
    const groupsByName = new Map();
    for (const group of parsed) {
      if (!group || typeof group.name !== "string" || !Array.isArray(group.itemIds)) continue;
      const name = group.name.trim() || ungroupedName;
      for (const rawId of group.itemIds) {
        const id = String(rawId);
        const item = itemsById.get(id);
        if (!item || placed.has(id)) continue;
        placed.add(id);
        if (!groupsByName.has(name)) groupsByName.set(name, { name, items: [] });
        groupsByName.get(name).items.push(item);
      }
    }

    // Items the model dropped or hallucinated ids for stay on the list as ungrouped.
    const missing = [...itemsById.entries()]
      .filter(([id]) => !placed.has(id))
      .map(([, item]) => item);
    if (missing.length) {
      if (!groupsByName.has(ungroupedName)) {
        groupsByName.set(ungroupedName, { name: ungroupedName, items: [] });
      }
      groupsByName.get(ungroupedName).items.push(...missing);
    }

    if (!groupsByName.size) {
      throw new Error("Gemini grouping response contained no valid groups");
    }
    return [...groupsByName.values()];
  }

  async function groupIngredientList(req, res) {
    const userId = req.params.userId;
    const collection = getIngredientListCollection(req);

    if (requestService.checkUser(req, userId)) {
      let docs = null;
      try {
        const userCollection = req.db.get("users");
        const user = await userCollection.findOne({ username: req.decoded.username });
        const geminiAPIKey = user?.geminiApiKey;

        if (!geminiAPIKey) {
          res.json({ success: false, data: "No Gemini API key configured" });
          return;
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${user?.geminiModel || defaultGeminiModel}:generateContent`;

        docs = await collection.findOne({ userId }, {});
        if (docs?.ingredientList?.groups?.length) {
          console.log(`[ingredients] groupIngredientList: calling Gemini for user="${userId}"`);
          const groups = docs.ingredientList.groups;

          const itemsById = new Map();
          groups.forEach((group) => {
            group.items.forEach((item) => {
              itemsById.set(String(item.ingredient.id), item);
            });
          });

          await collection.update({ userId }, { $set: { "ingredientList.grouping": true } });
          broadcast(userId, {
            ...docs,
            ingredientList: { ...docs.ingredientList, grouping: true },
          });

          // Only send id + name per item; the full objects never leave the server.
          const promptGroups = groups.map((group) => ({
            name: group.name,
            items: group.items.map((item) => ({
              id: String(item.ingredient.id),
              name: item.ingredient.name,
            })),
          }));

          const response = await fetch(geminiUrl, {
            method: "POST",
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `Organize this grocery shopping list into grocery store sections (e.g. "Dairy", "Produce", "Meat", "Bakery", "Pantry", "Frozen").

The list may already be partially grouped. Keep items that are already in a sensible store section where they are (reuse the existing section name), and place items from the "${ungroupedName}" section into the appropriate section.

Return a JSON array of section objects. Each section has "name" and "itemIds" (the ids of the items that belong in that section). Every item id from the input must appear in exactly one section. Use only ids that appear in the input.

Shopping list: ${JSON.stringify(promptGroups)}

Example response:
[
  { "name": "Dairy", "itemIds": ["id-1", "id-4"] },
  { "name": "Produce", "itemIds": ["id-2", "id-3"] }
]`,
                    },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      itemIds: { type: "ARRAY", items: { type: "STRING" } },
                    },
                    required: ["name", "itemIds"],
                  },
                },
              },
            }),
            headers: {
              "x-goog-api-key": geminiAPIKey,
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            const responseBody = await response.json();
            const groupedListJSON = responseBody.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!groupedListJSON) {
              const reason =
                responseBody.promptFeedback?.blockReason ||
                responseBody.candidates?.[0]?.finishReason ||
                "no content returned";
              throw new Error(`Gemini returned no usable content: ${reason}`);
            }

            const groupedItems = buildGroupsFromResponse(groupedListJSON, itemsById);

            const updatedIngredientList = {
              ...docs.ingredientList,
              groups: groupedItems,
              grouping: false,
            };
            await collection.update(
              { userId },
              { $set: { ingredientList: updatedIngredientList } },
            );
            const resultDocs = { ...docs, ingredientList: updatedIngredientList };
            broadcast(userId, resultDocs);
            res.json({ success: true, data: resultDocs });
          } else {
            const errBody = await response.text().catch(() => "(unreadable)");
            console.warn(
              `[ingredients] groupIngredientList: Gemini responded with status ${response.status} for user="${userId}": ${errBody}`,
            );
            await collection.update({ userId }, { $set: { "ingredientList.grouping": false } });
            broadcast(userId, {
              ...docs,
              ingredientList: { ...docs.ingredientList, grouping: false },
            });
            if (response.status === 429) {
              res.json({
                success: false,
                data: "Gemini rate limit reached. Try again in a moment.",
              });
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
        if (docs) {
          await collection
            .update({ userId }, { $set: { "ingredientList.grouping": false } })
            .catch(() => {});
          broadcast(userId, {
            ...docs,
            ingredientList: { ...docs.ingredientList, grouping: false },
          });
        }
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

        if (docs?.ingredientList?.grouping) {
          response.json({ success: false, data: "List is being grouped, try again in a moment." });
          return;
        }

        docs.ingredientList = {
          groups: [],
          lastModified: new Date().toString(),
        };

        await collection.update({ userId }, { $set: { ingredientList: docs.ingredientList } });
        broadcast(userId, docs);
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
    const ingredientId = req.params.itemId;
    const groupName = req.params.groupName;

    if (requestService.checkUser(req, userId)) {
      try {
        const docs = await collection.findOne({ userId }, {});

        if (docs?.ingredientList?.grouping) {
          res.json({ success: false, data: "List is being grouped, try again in a moment." });
          return;
        }

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
            broadcast(userId, docs);
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

        if (docs?.ingredientList?.grouping) {
          response.json({ success: false, data: "List is being grouped, try again in a moment." });
          return;
        }

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
        broadcast(userId, docs);
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

        if (docs?.ingredientList?.grouping) {
          response.json({ success: false, data: "List is being grouped, try again in a moment." });
          return;
        }

        const itemGroup = docs.ingredientList.groups.find((group) => group.name === groupName);

        if (itemGroup) {
          const itemIndex = itemGroup.items.findIndex(
            (groupItem) => groupItem.ingredient.id === ingredientItem.ingredient.id,
          );

          if (itemIndex !== -1) {
            itemGroup.items[itemIndex] = ingredientItem;
            await collection.update({ userId }, { $set: { ingredientList: docs.ingredientList } });
            broadcast(userId, docs);
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
