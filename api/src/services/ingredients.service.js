import { randomUUID } from "crypto";
import RequestService from "./request.service.js";
import { broadcast } from "./sse.js";
import {
  getGeminiConfig,
  requestGemini,
  extractCandidateText,
  parseJsonLoosely,
} from "./gemini.service.js";

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

  // Every list mutation shares one envelope: authorize the caller, load their
  // list, refuse while an auto-group is in flight, then persist, broadcast to the
  // user's other devices, and respond. A mutator returns `{ ingredientList }` to
  // persist, or `{ msg }` to respond without persisting when the thing it was
  // asked to change no longer exists.
  async function withUserList(req, res, name, mutate) {
    const userId = req.params.userId;

    if (!requestService.checkUser(req, userId)) {
      return requestService.returnUnauthorized(res);
    }

    const collection = getIngredientListCollection(req);

    try {
      const docs = await collection.findOne({ userId }, {});

      if (docs?.ingredientList?.grouping) {
        return res.json({
          success: false,
          data: "List is being grouped, try again in a moment.",
        });
      }

      const result = await mutate(docs);

      if (result?.msg) {
        return res.json({ success: true, data: docs, msg: result.msg });
      }

      const { ingredientList } = result;

      if (!docs) {
        const newDoc = await collection.insert({ userId, ingredientList });
        broadcast(userId, newDoc);
        return res.json({ success: true, data: newDoc });
      }

      await collection.update({ userId }, { $set: { ingredientList } });
      const updated = { ...docs, ingredientList };
      broadcast(userId, updated);
      return res.json({ success: true, data: updated });
    } catch (err) {
      console.error(`[ingredients] ${name} error user="${userId}": ${err}`);
      return res.json({ success: false, data: err.message });
    }
  }

  // Ids are assigned here rather than trusted from the client so that the same
  // ingredient added from two recipes cannot collide.
  function toListItem(ingredient) {
    return { ingredient: { ...ingredient, id: randomUUID() }, completed: false };
  }

  function addToUngrouped(docs, ingredients) {
    const items = ingredients.map(toListItem);

    if (!docs?.ingredientList) {
      return {
        ingredientList: {
          groups: [{ name: ungroupedName, items }],
          lastModified: new Date().toString(),
        },
      };
    }

    const { ingredientList } = docs;
    const ungrouped = ingredientList.groups.find((g) => g.name === ungroupedName);

    if (ungrouped) {
      ungrouped.items = ungrouped.items.concat(items);
    } else {
      ingredientList.groups.push({ name: ungroupedName, items });
    }

    return { ingredientList };
  }

  // Adding one ingredient is adding many with a single element.
  function addIngredient(req, res) {
    return withUserList(req, res, "addIngredient", (docs) =>
      addToUngrouped(docs, [req.body.ingredient]),
    );
  }

  function addManyIngredients(req, res) {
    return withUserList(req, res, "addManyIngredients", (docs) =>
      addToUngrouped(docs, req.body.ingredients),
    );
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

  // Maps ingredient id -> all list items carrying that id. Ids are unique for
  // server-assigned UUIDs, but legacy data may contain duplicates; keeping every
  // item per id guarantees none can be lost during regrouping.
  function mapItemsById(groups) {
    const itemsById = new Map();
    groups.forEach((group) => {
      group.items.forEach((item) => {
        const id = String(item.ingredient.id);
        if (!itemsById.has(id)) itemsById.set(id, []);
        itemsById.get(id).push(item);
      });
    });
    return itemsById;
  }

  // Parses the Gemini grouping response ([{ name, itemIds }]) and rebuilds full groups
  // from the original items, so the model can only move items — never alter or drop them.
  function buildGroupsFromResponse(rawText, itemsById) {
    const parsed = parseJsonLoosely(rawText, "array");
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
        const items = itemsById.get(id);
        if (!items || placed.has(id)) continue;
        placed.add(id);
        if (!groupsByName.has(name)) groupsByName.set(name, { name, items: [] });
        groupsByName.get(name).items.push(...items);
      }
    }

    // Items the model dropped or hallucinated ids for stay on the list as ungrouped.
    const missing = [...itemsById.entries()]
      .filter(([id]) => !placed.has(id))
      .flatMap(([, items]) => items);
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
        const { apiKey: geminiAPIKey, url: geminiUrl } = await getGeminiConfig(req);

        if (!geminiAPIKey) {
          res.json({ success: false, data: "No Gemini API key configured" });
          return;
        }

        docs = await collection.findOne({ userId }, {});
        if (docs?.ingredientList?.groups?.length) {
          console.log(`[ingredients] groupIngredientList: calling Gemini for user="${userId}"`);
          const groups = docs.ingredientList.groups;

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

          const response = await requestGemini({
            url: geminiUrl,
            apiKey: geminiAPIKey,
            prompt: `Organize this grocery shopping list into grocery store sections (e.g. "Dairy", "Produce", "Meat", "Bakery", "Pantry", "Frozen").

The list may already be partially grouped. Keep items that are already in a sensible store section where they are (reuse the existing section name), and place items from the "${ungroupedName}" section into the appropriate section.

Return a JSON array of section objects. Each section has "name" and "itemIds" (the ids of the items that belong in that section). Every item id from the input must appear in exactly one section. Use only ids that appear in the input.

Shopping list: ${JSON.stringify(promptGroups)}

Example response:
[
  { "name": "Dairy", "itemIds": ["id-1", "id-4"] },
  { "name": "Produce", "itemIds": ["id-2", "id-3"] }
]`,
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
          });

          if (response.ok) {
            const candidate = extractCandidateText(await response.json());
            if (!candidate.text) {
              throw new Error(`Gemini returned no usable content: ${candidate.reason}`);
            }

            // Re-read the list: a write that slipped in before the grouping lock
            // landed must not be clobbered by a rebuild from the earlier snapshot.
            // Items added since the prompt was built simply end up as ungrouped.
            const freshDocs = (await collection.findOne({ userId }, {})) || docs;
            const itemsById = mapItemsById(freshDocs.ingredientList?.groups || []);

            const groupedItems = buildGroupsFromResponse(candidate.text, itemsById);

            const updatedIngredientList = {
              ...freshDocs.ingredientList,
              groups: groupedItems,
              lastModified: new Date().toString(),
              grouping: false,
            };
            await collection.update(
              { userId },
              {
                $set: {
                  "ingredientList.groups": updatedIngredientList.groups,
                  "ingredientList.lastModified": updatedIngredientList.lastModified,
                  "ingredientList.grouping": false,
                },
              },
            );
            const resultDocs = { ...freshDocs, ingredientList: updatedIngredientList };
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

  function removeAllIngredients(req, res) {
    return withUserList(req, res, "removeAllIngredients", () => ({
      ingredientList: { groups: [], lastModified: new Date().toString() },
    }));
  }

  function removeIngredient(req, res) {
    return withUserList(req, res, "removeIngredient", (docs) => {
      const { groupName, itemId } = req.params;
      const { groups } = docs.ingredientList;

      const groupIndex = groups.findIndex((group) => group.name === groupName);
      if (groupIndex === -1) return { msg: "could not find item group to update" };

      const group = groups[groupIndex];
      const itemIndex = group.items.findIndex((item) => item.ingredient.id === itemId);
      if (itemIndex === -1) return { msg: "could not find item to update" };

      group.items.splice(itemIndex, 1);
      // A group with nothing left in it should not linger as an empty heading.
      if (group.items.length < 1) groups.splice(groupIndex, 1);

      return { ingredientList: docs.ingredientList };
    });
  }

  function removeMarkedIngredients(req, res) {
    return withUserList(req, res, "removeMarkedIngredients", (docs) => {
      const { ingredientList } = docs;

      ingredientList.groups.forEach((group) => {
        group.items = group.items.filter((item) => !item.completed);
      });
      ingredientList.groups = ingredientList.groups.filter((group) => group.items.length > 0);

      return { ingredientList };
    });
  }

  function updateIngredient(req, res) {
    return withUserList(req, res, "updateIngredient", (docs) => {
      const { groupName, ingredientListItem } = req.body.payload;

      const group = docs.ingredientList.groups.find((g) => g.name === groupName);
      if (!group) return { msg: "could not find item group to update" };

      const itemIndex = group.items.findIndex(
        (item) => item.ingredient.id === ingredientListItem.ingredient.id,
      );
      if (itemIndex === -1) return { msg: "could not find item to update" };

      group.items[itemIndex] = ingredientListItem;

      return { ingredientList: docs.ingredientList };
    });
  }
};

export default IngredientService;
