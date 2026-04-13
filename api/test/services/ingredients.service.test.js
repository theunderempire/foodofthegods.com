import { describe, test } from "node:test";
import assert from "node:assert/strict";
import IngredientService from "../../src/services/ingredients.service.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

const service = new IngredientService();

// UUIDs represent IDs as they would exist in the database after being assigned by the service
const SALT_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const SUGAR_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const SALT = { id: SALT_ID, name: "salt", amount: 1, unit: "tsp" };
const SUGAR = { id: SUGAR_ID, name: "sugar", amount: 1, unit: "cup" };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeDocsWithList(items = [], groupName = "ungrouped") {
  return { ingredientList: { groups: [{ name: groupName, items }] } };
}

function makeIngredientReq({ username = "user-1", params = {}, body = {}, collections = {} } = {}) {
  return makeReq({ username, params: { userId: "user-1", ...params }, body, collections });
}

describe("IngredientService", () => {
  describe("getIngredientListForUser", () => {
    test("returns ingredient list for authorized user", async () => {
      const mockDocs = [makeDocsWithList([{ ingredient: SALT, completed: false }])];
      const res = makeRes();
      const req = makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            find: (_q, _o) => Promise.resolve(mockDocs),
          }),
        },
      });

      await service.getIngredientListForUser(req, res);

      assert.equal(res._body.success, true);
      assert.deepEqual(res._body.data, mockDocs);
    });

    test("returns 401 when requesting another user's list", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.getIngredientListForUser(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("addIngredient", () => {
    test("adds ingredient to existing ungrouped list", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: { ingredient: SALT },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve(makeDocsWithList([])),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.addIngredient(req, res);

      const items = res._body.data.ingredientList.groups[0].items;
      assert.equal(items.length, 1);
      assert.equal(items[0].ingredient.name, SALT.name);
      assert.equal(items[0].ingredient.amount, SALT.amount);
      assert.equal(items[0].ingredient.unit, SALT.unit);
      assert.equal(items[0].completed, false);
    });

    test("assigns a UUID as the ingredient id", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: { ingredient: SALT },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve(makeDocsWithList([])),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.addIngredient(req, res);

      const id = res._body.data.ingredientList.groups[0].items[0].ingredient.id;
      assert.match(String(id), UUID_REGEX);
    });

    test("creates new ingredientList when none exists", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: { ingredient: SALT },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve({}), // no ingredientList
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.addIngredient(req, res);

      const groups = res._body.data.ingredientList.groups;
      assert.equal(groups.length, 1);
      assert.equal(groups[0].name, "ungrouped");
      assert.equal(groups[0].items[0].ingredient.name, SALT.name);
      assert.match(String(groups[0].items[0].ingredient.id), UUID_REGEX);
    });

    test("returns failure when list is being grouped", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: { ingredient: SALT },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve({ ingredientList: { groups: [], grouping: true } }),
          }),
        },
      });

      await service.addIngredient(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /being grouped/);
    });

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.addIngredient(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("addManyIngredients", () => {
    test("adds multiple ingredients to existing ungrouped list", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: { ingredients: [SALT, SUGAR] },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve(makeDocsWithList([])),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.addManyIngredients(req, res);

      const items = res._body.data.ingredientList.groups[0].items;
      assert.equal(items.length, 2);
      assert.equal(items[0].ingredient.name, SALT.name);
      assert.equal(items[1].ingredient.name, SUGAR.name);
    });

    test("assigns a UUID to each added ingredient", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: { ingredients: [SALT, SUGAR] },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve(makeDocsWithList([])),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.addManyIngredients(req, res);

      const items = res._body.data.ingredientList.groups[0].items;
      for (const item of items) {
        assert.match(String(item.ingredient.id), UUID_REGEX);
      }
    });

    test("assigns unique UUIDs when ingredients from two recipes share the same id", async () => {
      // Simulates adding ingredients from two recipes where both have id:1, id:2, etc.
      const recipeAIngredients = [
        { id: 1, name: "flour", amount: 2, unit: "cup" },
        { id: 2, name: "sugar", amount: 1, unit: "cup" },
      ];
      const recipeBIngredients = [
        { id: 1, name: "butter", amount: 0.5, unit: "cup" },
        { id: 2, name: "eggs", amount: 2 },
      ];

      // Add recipe A
      const resA = makeRes();
      const reqA = makeIngredientReq({
        body: { ingredients: recipeAIngredients },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve(makeDocsWithList([])),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });
      await service.addManyIngredients(reqA, resA);

      const listAfterA = resA._body.data.ingredientList;

      // Add recipe B on top of recipe A's list
      const resB = makeRes();
      const reqB = makeIngredientReq({
        body: { ingredients: recipeBIngredients },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve({ ingredientList: listAfterA }),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });
      await service.addManyIngredients(reqB, resB);

      const allItems = resB._body.data.ingredientList.groups[0].items;
      assert.equal(allItems.length, 4);

      const ids = allItems.map((i) => i.ingredient.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, 4, "all four ingredients must have unique IDs");
      for (const id of ids) {
        assert.match(String(id), UUID_REGEX);
      }
    });

    test("returns failure when list is being grouped", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: { ingredients: [SALT, SUGAR] },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve({ ingredientList: { groups: [], grouping: true } }),
          }),
        },
      });

      await service.addManyIngredients(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /being grouped/);
    });

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.addManyIngredients(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("removeIngredient", () => {
    test("removes the specified ingredient from its group", async () => {
      const initialItems = [
        { ingredient: SALT, completed: false },
        { ingredient: SUGAR, completed: false },
      ];
      const res = makeRes();
      const req = makeIngredientReq({
        params: { userId: "user-1", groupName: "ungrouped", itemId: SALT_ID },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(makeDocsWithList(JSON.parse(JSON.stringify(initialItems)))),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.removeIngredient(req, res);

      const items = res._body.data.ingredientList.groups[0].items;
      assert.equal(items.length, 1);
      assert.equal(items[0].ingredient.id, SUGAR_ID);
    });

    test("removes the group when it becomes empty after removal", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        params: { userId: "user-1", groupName: "ungrouped", itemId: SALT_ID },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(makeDocsWithList([{ ingredient: SALT, completed: false }])),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.removeIngredient(req, res);

      assert.equal(res._body.data.ingredientList.groups.length, 0);
    });

    test("responds with not-found message when item does not exist in group", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        params: {
          userId: "user-1",
          groupName: "ungrouped",
          itemId: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
        },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(makeDocsWithList([{ ingredient: SALT, completed: false }])),
          }),
        },
      });

      await service.removeIngredient(req, res);

      assert.match(res._body.msg, /could not find item/);
    });

    test("returns failure when list is being grouped", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        params: { userId: "user-1", groupName: "ungrouped", itemId: SALT_ID },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve({ ingredientList: { groups: [], grouping: true } }),
          }),
        },
      });

      await service.removeIngredient(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /being grouped/);
    });

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.removeIngredient(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("removeAllIngredients", () => {
    test("clears all groups from the ingredient list", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(
                makeDocsWithList([
                  { ingredient: SALT, completed: false },
                  { ingredient: SUGAR, completed: true },
                ]),
              ),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.removeAllIngredients(req, res);

      assert.equal(res._body.data.ingredientList.groups.length, 0);
    });

    test("returns failure when list is being grouped", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve({ ingredientList: { groups: [], grouping: true } }),
          }),
        },
      });

      await service.removeAllIngredients(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /being grouped/);
    });

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.removeAllIngredients(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("removeMarkedIngredients", () => {
    test("removes completed items and keeps uncompleted ones", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(
                makeDocsWithList([
                  { ingredient: SALT, completed: false },
                  { ingredient: SUGAR, completed: true },
                ]),
              ),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.removeMarkedIngredients(req, res);

      const items = res._body.data.ingredientList.groups[0].items;
      assert.equal(items.length, 1);
      assert.equal(items[0].ingredient.id, SALT.id);
    });

    test("removes the group entirely when all items were completed", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(
                makeDocsWithList([
                  { ingredient: SALT, completed: true },
                  { ingredient: SUGAR, completed: true },
                ]),
              ),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.removeMarkedIngredients(req, res);

      assert.equal(res._body.data.ingredientList.groups.length, 0);
    });

    test("returns failure when list is being grouped", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve({ ingredientList: { groups: [], grouping: true } }),
          }),
        },
      });

      await service.removeMarkedIngredients(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /being grouped/);
    });

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.removeMarkedIngredients(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("groupIngredientList", () => {
    const GROUPED_RESPONSE = [
      { name: "Dairy", items: [{ ingredient: SALT, completed: false }] },
      { name: "Produce", items: [{ ingredient: SUGAR, completed: false }] },
    ];

    function makeGroupReq({ ingredientlistOverrides = {}, geminiApiKey = "test-key" } = {}) {
      return makeIngredientReq({
        collections: {
          users: makeCollection({
            findOne: (_q, _o) => Promise.resolve({ geminiApiKey }),
          }),
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(makeDocsWithList([{ ingredient: SALT, completed: false }])),
            update: (_q, _u) => Promise.resolve(),
            ...ingredientlistOverrides,
          }),
        },
      });
    }

    test("groups ingredients and saves result on Gemini success", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(GROUPED_RESPONSE) }] } }],
        }),
      });

      try {
        const res = makeRes();
        await service.groupIngredientList(makeGroupReq(), res);

        assert.equal(res._body.success, true);
        assert.deepEqual(res._body.data.ingredientList.groups, GROUPED_RESPONSE);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("strips markdown fencing from Gemini response before parsing", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: "```json\n" + JSON.stringify(GROUPED_RESPONSE) + "\n```" }],
              },
            },
          ],
        }),
      });

      try {
        const res = makeRes();
        await service.groupIngredientList(makeGroupReq(), res);

        assert.equal(res._body.success, true);
        assert.deepEqual(res._body.data.ingredientList.groups, GROUPED_RESPONSE);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns failure with rate-limited message on Gemini 429", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        text: async () => "Too Many Requests",
      });

      try {
        const res = makeRes();
        await service.groupIngredientList(makeGroupReq(), res);

        assert.equal(res._body.success, false);
        assert.match(res._body.data, /rate limit/i);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns failure with status on Gemini non-429 error", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      try {
        const res = makeRes();
        await service.groupIngredientList(makeGroupReq(), res);

        assert.equal(res._body.success, false);
        assert.match(res._body.data, /400/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("reads Gemini API key from the user's database record", async () => {
      const originalFetch = globalThis.fetch;

      let capturedHeaders;
      globalThis.fetch = async (_url, opts) => {
        capturedHeaders = opts.headers;
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: JSON.stringify(GROUPED_RESPONSE) }] } }],
          }),
        };
      };

      try {
        const res = makeRes();
        await service.groupIngredientList(makeGroupReq({ geminiApiKey: "user-db-key" }), res);

        assert.equal(capturedHeaders["x-goog-api-key"], "user-db-key");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns failure when no Gemini API key is configured", async () => {
      const res = makeRes();
      await service.groupIngredientList(makeGroupReq({ geminiApiKey: null }), res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /No Gemini API key/);
    });

    test("returns failure when ingredient list has no groups", async () => {
      const res = makeRes();
      const req = makeGroupReq({
        ingredientlistOverrides: {
          findOne: (_q, _o) => Promise.resolve({ ingredientList: { groups: [] } }),
        },
      });

      await service.groupIngredientList(req, res);

      assert.equal(res._body.success, false);
    });

    test("sets grouping lock before calling Gemini", async () => {
      const updateCalls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(GROUPED_RESPONSE) }] } }],
        }),
      });

      try {
        const res = makeRes();
        const req = makeGroupReq({
          ingredientlistOverrides: {
            update: (_q, u) => {
              updateCalls.push(u);
              return Promise.resolve();
            },
          },
        });
        await service.groupIngredientList(req, res);

        assert.equal(updateCalls[0].$set["ingredientList.grouping"], true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("clears grouping lock in the response after successful grouping", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(GROUPED_RESPONSE) }] } }],
        }),
      });

      try {
        const res = makeRes();
        await service.groupIngredientList(makeGroupReq(), res);

        assert.equal(res._body.data.ingredientList.grouping, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("clears grouping lock when Gemini returns an error", async () => {
      const updateCalls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      try {
        const res = makeRes();
        const req = makeGroupReq({
          ingredientlistOverrides: {
            update: (_q, u) => {
              updateCalls.push(u);
              return Promise.resolve();
            },
          },
        });
        await service.groupIngredientList(req, res);

        const lastUpdate = updateCalls[updateCalls.length - 1];
        assert.equal(lastUpdate.$set["ingredientList.grouping"], false);
        assert.equal(res._body.success, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.groupIngredientList(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("updateIngredient", () => {
    test("updates the ingredient item in its group", async () => {
      const updatedSalt = { ingredient: { ...SALT, amount: 3, unit: "tbsp" }, completed: true };
      const res = makeRes();
      const req = makeIngredientReq({
        body: { payload: { groupName: "ungrouped", ingredientListItem: updatedSalt } },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(makeDocsWithList([{ ingredient: SALT, completed: false }])),
            update: (_q, _u) => Promise.resolve(),
          }),
        },
      });

      await service.updateIngredient(req, res);

      const item = res._body.data.ingredientList.groups[0].items[0];
      assert.equal(item.ingredient.amount, 3);
      assert.equal(item.ingredient.unit, "tbsp");
      assert.equal(item.completed, true);
    });

    test("responds with not-found message when item does not exist in group", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        body: {
          payload: {
            groupName: "ungrouped",
            ingredientListItem: { ingredient: { id: 99 }, completed: false },
          },
        },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(makeDocsWithList([{ ingredient: SALT, completed: false }])),
          }),
        },
      });

      await service.updateIngredient(req, res);

      assert.match(res._body.msg, /could not find item/);
    });

    test("returns failure when list is being grouped", async () => {
      const updatedSalt = { ingredient: { ...SALT, amount: 3 }, completed: false };
      const res = makeRes();
      const req = makeIngredientReq({
        body: { payload: { groupName: "ungrouped", ingredientListItem: updatedSalt } },
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve({ ingredientList: { groups: [], grouping: true } }),
          }),
        },
      });

      await service.updateIngredient(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /being grouped/);
    });

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.updateIngredient(req, res);

      assert.equal(res._status, 401);
    });
  });
});
