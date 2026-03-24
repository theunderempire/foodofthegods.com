import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import RecipesService from "../../src/services/recipes.service.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBNAILS_DIR = path.join(__dirname, "../../public/thumbnails");

const service = new RecipesService();

describe("RecipesService", () => {
  let tinyJpeg;

  before(async () => {
    tinyJpeg = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .jpeg()
      .toBuffer();
  });

  function makeFetchWithJpeg(jpeg) {
    return async () => ({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => {
        const ab = new ArrayBuffer(jpeg.byteLength);
        new Uint8Array(ab).set(jpeg);
        return ab;
      },
    });
  }
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

    test("overwrites imageUrl with local thumbnail URL when imageUrl is provided", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = makeFetchWithJpeg(tinyJpeg);
      let recipeUpdateArgs = null;
      const recipeId = "add-thumb-success";
      try {
        const res = makeRes();
        const req = makeReq({
          username: "user-1",
          body: { name: "Pasta", userId: "user-1", imageUrl: "https://example.com/img.jpg" },
          collections: {
            recipelist: makeCollection({
              insert: (doc) => Promise.resolve({ ...doc, _id: recipeId }),
              update: (_q, update) => {
                recipeUpdateArgs = update;
                return Promise.resolve();
              },
            }),
          },
        });

        await service.addRecipeForUser(req, res);

        assert.equal(res._body.data.msg, "recipe added");
        assert.ok(recipeUpdateArgs, "should call update with thumbnail URL");
        assert.match(recipeUpdateArgs.$set.imageUrl, /\/thumbnails\/add-thumb-success\.jpg$/);
      } finally {
        globalThis.fetch = originalFetch;
        await fs.unlink(path.join(THUMBNAILS_DIR, `${recipeId}.jpg`)).catch(() => {});
      }
    });

    test("saves recipe successfully when thumbnail generation fails", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Network error");
      };
      let recipeUpdateCalled = false;
      try {
        const res = makeRes();
        const req = makeReq({
          username: "user-1",
          body: { name: "Pasta", userId: "user-1", imageUrl: "https://example.com/img.jpg" },
          collections: {
            recipelist: makeCollection({
              insert: (doc) => Promise.resolve({ ...doc, _id: "add-thumb-fail" }),
              update: () => {
                recipeUpdateCalled = true;
                return Promise.resolve();
              },
            }),
          },
        });

        await service.addRecipeForUser(req, res);

        assert.equal(res._body.data.msg, "recipe added");
        assert.equal(recipeUpdateCalled, false, "should not update imageUrl when thumbnail fails");
      } finally {
        globalThis.fetch = originalFetch;
      }
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

    test("generates thumbnail and replaces imageUrl when imageUrl changes", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = makeFetchWithJpeg(tinyJpeg);
      let updateArgs = null;
      const recipeId = "update-thumb-success";
      try {
        const res = makeRes();
        const req = makeReq({
          username: "user-1",
          params: { id: recipeId },
          body: { _id: recipeId, name: "Pasta", imageUrl: "https://example.com/new.jpg" },
          collections: {
            users: makeCollection({
              find: () => Promise.resolve([{ recipeList: [recipeId] }]),
            }),
            recipelist: makeCollection({
              findOne: () => Promise.resolve({ imageUrl: "https://example.com/old.jpg" }),
              update: (_q, update) => {
                updateArgs = update;
                return Promise.resolve();
              },
            }),
          },
        });

        await service.updateRecipe(req, res);

        assert.equal(res._body.data.msg, "recipe updated");
        assert.match(
          updateArgs.$set.imageUrl,
          /\/thumbnails\/update-thumb-success\.jpg$/,
          "imageUrl should be replaced with local thumbnail URL",
        );
      } finally {
        globalThis.fetch = originalFetch;
        await fs.unlink(path.join(THUMBNAILS_DIR, `${recipeId}.jpg`)).catch(() => {});
      }
    });

    test("does not regenerate thumbnail when imageUrl is unchanged", async () => {
      const originalFetch = globalThis.fetch;
      let fetchCalled = false;
      globalThis.fetch = async () => {
        fetchCalled = true;
        return {
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      };
      try {
        const res = makeRes();
        const req = makeReq({
          username: "user-1",
          params: { id: "r1" },
          body: { _id: "r1", name: "Updated Name", imageUrl: "https://example.com/same.jpg" },
          collections: {
            users: makeCollection({
              find: () => Promise.resolve([{ recipeList: ["r1"] }]),
            }),
            recipelist: makeCollection({
              findOne: () => Promise.resolve({ imageUrl: "https://example.com/same.jpg" }),
              update: () => Promise.resolve(),
            }),
          },
        });

        await service.updateRecipe(req, res);

        assert.equal(res._body.data.msg, "recipe updated");
        assert.equal(fetchCalled, false, "should not fetch image when imageUrl has not changed");
      } finally {
        globalThis.fetch = originalFetch;
      }
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

    test("returns error when user has no geminiApiKey", async () => {
      const res = makeRes();
      const req = makeReq({
        body: { url: "https://example.com/recipe" },
        collections: {
          users: makeCollection({ findOne: () => Promise.resolve({ username: "testuser" }) }),
        },
      });

      await service.importRecipeFromUrl(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /No Gemini API key set/);
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
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

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
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, false);
        assert.match(res._body.data, /Network error/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("calls Gemini with the user's API key", async () => {
      const originalFetch = globalThis.fetch;
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
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () =>
                Promise.resolve({ username: "testuser", geminiApiKey: "user-specific-key" }),
            }),
          },
        });

        await service.importRecipeFromUrl(req, res);

        assert.equal(capturedHeaders["x-goog-api-key"], "user-specific-key");
      } finally {
        globalThis.fetch = originalFetch;
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
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

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
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

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

    test("handles Gemini response with missing commas between array objects", async () => {
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      // Simulate Gemini omitting commas between direction objects (the production error)
      const malformedJson = `{
  "name": "Test Recipe",
  "prepDuration": "5 min",
  "cookDuration": "10 min",
  "servings": "2",
  "ingredients": [{"id": 1, "name": "water", "amount": 1, "unit": "cup"}],
  "directions": [
    {"id": 1, "text": "Boil water.", "duration": ""}
    {"id": 2, "text": "Add pasta.", "duration": ""}
  ]
}`;
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) return { text: async () => "<html>page</html>" };
        return {
          json: async () => ({ candidates: [{ content: { parts: [{ text: malformedJson }] } }] }),
        };
      };

      try {
        const res = makeRes();
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, true);
        assert.equal(res._body.data.name, "Test Recipe");
        assert.equal(res._body.data.directions.length, 2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("handles Gemini response with trailing commas", async () => {
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      const trailingCommaJson = `{
  "name": "Soup",
  "prepDuration": "5 min",
  "cookDuration": "15 min",
  "servings": "2",
  "ingredients": [{"id": 1, "name": "water", "amount": 1, "unit": "cup",}],
  "directions": [{"id": 1, "text": "Boil.", "duration": ""},],
}`;
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) return { text: async () => "<html>page</html>" };
        return {
          json: async () => ({
            candidates: [{ content: { parts: [{ text: trailingCommaJson }] } }],
          }),
        };
      };

      try {
        const res = makeRes();
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, true);
        assert.equal(res._body.data.name, "Soup");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("handles Gemini response with surrounding prose", async () => {
      const originalFetch = globalThis.fetch;
      let callCount = 0;
      const withProse =
        'Here is the recipe:\n{"name":"Pasta","prepDuration":"5 min","cookDuration":"10 min","servings":"2","ingredients":[],"directions":[]}\nLet me know if you need anything else!';
      globalThis.fetch = async () => {
        callCount++;
        if (callCount === 1) return { text: async () => "<html>page</html>" };
        return {
          json: async () => ({ candidates: [{ content: { parts: [{ text: withProse }] } }] }),
        };
      };

      try {
        const res = makeRes();
        const req = makeReq({
          body: { url: "https://example.com/recipe" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

        await service.importRecipeFromUrl(req, res);

        assert.equal(res._body.success, true);
        assert.equal(res._body.data.name, "Pasta");
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

    test("returns error when user has no geminiApiKey", async () => {
      const res = makeRes();
      const req = makeReq({
        body: { text: "Some recipe text" },
        collections: {
          users: makeCollection({ findOne: () => Promise.resolve({ username: "testuser" }) }),
        },
      });

      await service.importRecipeFromText(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /No Gemini API key set/);
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
        const req = makeReq({
          body: { text: "Pasted soup recipe text here" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

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
        const req = makeReq({
          body: { text: "Some recipe text" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

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
        const req = makeReq({
          body: { text: "Some recipe text" },
          collections: {
            users: makeCollection({
              findOne: () => Promise.resolve({ username: "testuser", geminiApiKey: "test-key" }),
            }),
          },
        });

        await service.importRecipeFromText(req, res);

        assert.equal(res._body.success, false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
