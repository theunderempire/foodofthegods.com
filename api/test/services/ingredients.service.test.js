import { describe, test } from "node:test";
import assert from "node:assert/strict";
import IngredientService from "../../src/services/ingredients.service.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

const service = new IngredientService();

const SALT = { id: 1, name: "salt", amount: 1, unit: "tsp" };
const SUGAR = { id: 2, name: "sugar", amount: 1, unit: "cup" };

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
      assert.deepEqual(items[0].ingredient, SALT);
      assert.equal(items[0].completed, false);
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
      assert.deepEqual(groups[0].items[0].ingredient, SALT);
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
      assert.deepEqual(items[0].ingredient, SALT);
      assert.deepEqual(items[1].ingredient, SUGAR);
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
        params: { userId: "user-1", groupName: "ungrouped", itemId: "1" },
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
      assert.equal(items[0].ingredient.id, SUGAR.id);
    });

    test("removes the group when it becomes empty after removal", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        params: { userId: "user-1", groupName: "ungrouped", itemId: "1" },
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
        params: { userId: "user-1", groupName: "ungrouped", itemId: "99" },
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

    function makeGroupReq(collectionOverrides = {}) {
      return makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) =>
              Promise.resolve(makeDocsWithList([{ ingredient: SALT, completed: false }])),
            update: (_q, _u) => Promise.resolve(),
            ...collectionOverrides,
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

    test("returns success with rate-limited message on Gemini 429", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        text: async () => "Too Many Requests",
      });

      try {
        const res = makeRes();
        await service.groupIngredientList(makeGroupReq(), res);

        assert.equal(res._body.success, true);
        assert.equal(res._body.data, "Rate limited");
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

    test("reads Gemini API key from process.env at call time", async () => {
      const originalFetch = globalThis.fetch;
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key-at-call-time";

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
        await service.groupIngredientList(makeGroupReq(), res);

        assert.equal(capturedHeaders["x-goog-api-key"], "test-key-at-call-time");
      } finally {
        globalThis.fetch = originalFetch;
        process.env.GEMINI_API_KEY = originalKey;
      }
    });

    test("returns failure when ingredient list has no groups", async () => {
      const res = makeRes();
      const req = makeIngredientReq({
        collections: {
          ingredientlist: makeCollection({
            findOne: (_q, _o) => Promise.resolve({ ingredientList: { groups: [] } }),
          }),
        },
      });

      await service.groupIngredientList(req, res);

      assert.equal(res._body.success, false);
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

    test("returns 401 for unauthorized user", async () => {
      const res = makeRes();
      const req = makeIngredientReq({ params: { userId: "user-2" } });

      await service.updateIngredient(req, res);

      assert.equal(res._status, 401);
    });
  });
});
