import { describe, test } from "node:test";
import assert from "node:assert/strict";
import RecipesService from "../../src/services/recipes.service.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

const service = new RecipesService();

describe("RecipesService", () => {
  describe("addRecipeForUser", () => {
    test("inserts recipe and responds with success when userId matches token", async () => {
      let inserted = null;
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        body: { name: "Pasta", userId: "user-1" },
        collections: {
          recipelist: makeCollection({
            insert: (doc) => {
              inserted = doc;
              return Promise.resolve({ ...doc, _id: "new-id" });
            },
          }),
        },
      });

      await service.addRecipeForUser(req, res);

      assert.equal(inserted.name, "Pasta");
      assert.equal(res._body.data.msg, "recipe added");
    });

    test("returns 401 when userId in body does not match token", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        body: { name: "Pasta", userId: "user-2" },
      });

      await service.addRecipeForUser(req, res);

      assert.equal(res._status, 401);
      assert.equal(res._body.success, false);
    });
  });

  describe("getRecipesForUser", () => {
    test("returns recipes for authorized user", async () => {
      const mockRecipes = [{ _id: "r1", name: "Pasta" }];
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        params: { userId: "user-1" },
        collections: {
          users: makeCollection({
            find: (_q, _o) => Promise.resolve([{ recipeList: ["r1"] }]),
          }),
          recipelist: makeCollection({
            find: (_q, _o) => Promise.resolve(mockRecipes),
          }),
        },
      });

      await service.getRecipesForUser(req, res);

      assert.equal(res._body.success, true);
      assert.deepEqual(res._body.data, mockRecipes);
    });

    test("returns 401 when requesting another user's recipes", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        params: { userId: "user-2" },
      });

      await service.getRecipesForUser(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("getSingleRecipe", () => {
    test("returns the recipe matching the requested id", async () => {
      const mockRecipe = [{ _id: "r1", name: "Pasta" }];
      const res = makeRes();
      const req = makeReq({
        params: { id: "r1" },
        collections: {
          recipelist: makeCollection({
            find: (_q, _o) => Promise.resolve(mockRecipe),
          }),
        },
      });

      await service.getSingleRecipe(req, res);

      assert.equal(res._body.success, true);
      assert.deepEqual(res._body.data, mockRecipe);
    });
  });

  describe("deleteRecipe", () => {
    test("removes recipe from db when no other users own it", async () => {
      let removeCalled = false;
      const res = makeRes();
      let userFindCount = 0;
      const req = makeReq({
        username: "user-1",
        params: { id: "r1" },
        collections: {
          recipelist: makeCollection({
            find: (_q, _o) => Promise.resolve([{ _id: "r1" }]),
            remove: (_q) => {
              removeCalled = true;
              return Promise.resolve();
            },
          }),
          users: makeCollection({
            update: (_q, _u) => Promise.resolve(),
            find: (_q, _o) => {
              userFindCount++;
              return Promise.resolve(
                userFindCount === 1
                  ? [{ recipeList: ["r1"] }] // ownership check
                  : [], // no remaining owners
              );
            },
          }),
        },
      });

      await service.deleteRecipe(req, res);

      assert.equal(removeCalled, true);
      assert.equal(res._body.data.msg, "recipe deleted");
    });

    test("keeps recipe in db when another user still owns it", async () => {
      let removeCalled = false;
      const res = makeRes();
      let userFindCount = 0;
      const req = makeReq({
        username: "user-1",
        params: { id: "r1" },
        collections: {
          recipelist: makeCollection({
            find: (_q, _o) => Promise.resolve([{ _id: "r1" }]),
            remove: (_q) => {
              removeCalled = true;
              return Promise.resolve();
            },
          }),
          users: makeCollection({
            update: (_q, _u) => Promise.resolve(),
            find: (_q, _o) => {
              userFindCount++;
              return Promise.resolve(
                userFindCount === 1
                  ? [{ recipeList: ["r1"] }] // ownership check
                  : [{ _id: "user-2" }], // another owner still exists
              );
            },
          }),
        },
      });

      await service.deleteRecipe(req, res);

      assert.equal(removeCalled, false);
      assert.equal(res._body.data.msg, "recipe deleted");
    });

    test("returns 401 when recipe is not in user's recipeList", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        params: { id: "r1" },
        collections: {
          users: makeCollection({
            find: (_q, _o) => Promise.resolve([{ recipeList: [] }]),
          }),
        },
      });

      await service.deleteRecipe(req, res);

      assert.equal(res._status, 401);
    });
  });

  describe("updateRecipe", () => {
    test("updates recipe with $set and strips _id when user owns it", async () => {
      let updateArgs = null;
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        params: { id: "r1" },
        body: { _id: "r1", name: "Updated Pasta", userId: "user-1" },
        collections: {
          users: makeCollection({
            find: (_q, _o) => Promise.resolve([{ recipeList: ["r1"] }]),
          }),
          recipelist: makeCollection({
            update: (query, update) => {
              updateArgs = { query, update };
              return Promise.resolve();
            },
          }),
        },
      });

      await service.updateRecipe(req, res);

      assert.equal(res._body.data.msg, "recipe updated");
      assert.ok(updateArgs.update.$set, "update should use $set");
      assert.equal(updateArgs.update.$set._id, undefined, "_id should be stripped from $set");
      assert.equal(updateArgs.update.$set.name, "Updated Pasta");
    });

    test("returns 401 when recipe is not in user's recipeList", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        params: { id: "r1" },
        body: { name: "Updated Pasta" },
        collections: {
          users: makeCollection({
            find: (_q, _o) => Promise.resolve([]), // recipe not in user's list
          }),
        },
      });

      await service.updateRecipe(req, res);

      assert.equal(res._status, 401);
    });

    test("returns error response when ownership lookup throws", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        params: { id: "r1" },
        body: { name: "Updated Pasta" },
        collections: {
          users: makeCollection({
            find: (_q, _o) => Promise.reject(new Error("db error")),
          }),
        },
      });

      await service.updateRecipe(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /db error/);
    });
  });

  describe("importRecipeFromUrl", () => {
    test("returns error immediately when url is missing", async () => {
      const res = makeRes();
      const req = makeReq({ body: {} });

      await service.importRecipeFromUrl(req, res);

      assert.equal(res._body.success, false);
    });

    test("fetches page and returns parsed recipe on success", async () => {
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return { text: async () => "<html><body>Recipe content here</body></html>" };
        }
        return {
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        name: "Test Pasta",
                        prepDuration: "10 min",
                        cookDuration: "20 min",
                        servings: "4",
                        ingredients: [],
                        directions: [],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      };

      try {
        const res = makeRes();
        const req = makeReq({ body: { url: "https://example.com/recipe" } });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, true);
        assert.equal(res._body.data.name, "Test Pasta");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns error when fetch throws", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Network error");
      };

      try {
        const res = makeRes();
        const req = makeReq({ body: { url: "https://example.com/recipe" } });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, false);
        assert.match(res._body.data, /Network error/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("reads Gemini API key from process.env at call time", async () => {
      const originalFetch = globalThis.fetch;
      const originalKey = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key-at-call-time";

      let callCount = 0;
      let capturedHeaders;
      globalThis.fetch = async (_url, opts) => {
        callCount++;
        if (callCount === 1) {
          return { text: async () => "<html>page</html>" };
        }
        capturedHeaders = opts?.headers;
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    { text: JSON.stringify({ name: "Pasta", ingredients: [], directions: [] }) },
                  ],
                },
              },
            ],
          }),
        };
      };

      try {
        const res = makeRes();
        const req = makeReq({ body: { url: "https://example.com/recipe" } });

        await service.importRecipeFromUrl(req, res);

        assert.equal(capturedHeaders["x-goog-api-key"], "test-key-at-call-time");
      } finally {
        globalThis.fetch = originalFetch;
        process.env.GEMINI_API_KEY = originalKey;
      }
    });

    test("returns error when Gemini response cannot be parsed", async () => {
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          return { text: async () => "<html>page</html>" };
        }
        return {
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "this is not json {{{" }] } }],
          }),
        };
      };

      try {
        const res = makeRes();
        const req = makeReq({ body: { url: "https://example.com/recipe" } });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("extracts recipe from JSON-LD structured data when present", async () => {
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      let capturedGeminiText;
      const jsonLdRecipe = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "JSON-LD Pasta",
        recipeIngredient: ["2 cups pasta", "1 cup sauce"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Boil pasta." }],
      });
      const htmlWithJsonLd = `<html><head><script type="application/ld+json">${jsonLdRecipe}</script></head><body>Some page text</body></html>`;

      globalThis.fetch = async (_url, opts) => {
        callCount++;
        if (callCount === 1) {
          return { text: async () => htmlWithJsonLd };
        }
        const body = JSON.parse(opts.body);
        capturedGeminiText = body.contents[0].parts[0].text;
        return {
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        name: "JSON-LD Pasta",
                        ingredients: [],
                        directions: [],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
        };
      };

      try {
        const res = makeRes();
        const req = makeReq({ body: { url: "https://example.com/recipe" } });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, true);
        assert.ok(
          capturedGeminiText.includes("JSON-LD Pasta"),
          "Gemini should receive the JSON-LD content",
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("importRecipeFromText", () => {
    test("returns error immediately when text is missing", async () => {
      const res = makeRes();
      const req = makeReq({ body: {} });

      await service.importRecipeFromText(req, res);

      assert.equal(res._body.success, false);
    });

    test("calls Gemini and returns parsed recipe on success", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      name: "Pasted Soup",
                      prepDuration: "5 min",
                      cookDuration: "15 min",
                      servings: "2",
                      ingredients: [{ id: 1, name: "water", amount: 1, unit: "cup" }],
                      directions: [{ id: 1, text: "Boil water.", duration: "" }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      });

      try {
        const res = makeRes();
        const req = makeReq({ body: { text: "Pasted soup recipe text here" } });

        await service.importRecipeFromText(req, res);

        assert.equal(res._body.success, true);
        assert.equal(res._body.data.name, "Pasted Soup");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns error when Gemini call throws", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Gemini unavailable");
      };

      try {
        const res = makeRes();
        const req = makeReq({ body: { text: "Some recipe text" } });

        await service.importRecipeFromText(req, res);

        assert.equal(res._body.success, false);
        assert.match(res._body.data, /Gemini unavailable/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns error when Gemini response cannot be parsed", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "not valid json {{" }] } }],
        }),
      });

      try {
        const res = makeRes();
        const req = makeReq({ body: { text: "Some recipe text" } });

        await service.importRecipeFromText(req, res);

        assert.equal(res._body.success, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
