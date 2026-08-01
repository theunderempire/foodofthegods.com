import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { handleGetSettings, handlePutSettings } from "../../src/routes/users.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

describe("users settings", () => {
  describe("handleGetSettings", () => {
    // The raw key must never leave the server; only its presence is reported.
    test("reports that a key is set without returning the key", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        collections: {
          users: makeCollection({
            findOne: () => Promise.resolve({ username: "user-1", geminiApiKey: "my-key" }),
          }),
        },
      });

      await handleGetSettings(req, res);

      assert.equal(res._body.hasGeminiKey, true);
      assert.equal(res._body.geminiApiKey, undefined, "the key itself must not be sent");
      assert.ok(
        !JSON.stringify(res._body).includes("my-key"),
        "no part of the response may contain the key",
      );
    });

    test("returns geminiModel when user has one set", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        collections: {
          users: makeCollection({
            findOne: () =>
              Promise.resolve({
                username: "user-1",
                geminiApiKey: "my-key",
                geminiModel: "gemini-2.5-pro",
              }),
          }),
        },
      });

      await handleGetSettings(req, res);

      assert.equal(res._body.geminiModel, "gemini-2.5-pro");
    });

    test("reports no key when the user has none", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        collections: {
          users: makeCollection({
            findOne: () => Promise.resolve({ username: "user-1" }),
          }),
        },
      });

      await handleGetSettings(req, res);

      assert.equal(res._body.hasGeminiKey, false);
    });

    test("returns null for geminiModel when user has none", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        collections: {
          users: makeCollection({
            findOne: () => Promise.resolve({ username: "user-1" }),
          }),
        },
      });

      await handleGetSettings(req, res);

      assert.equal(res._body.geminiModel, null);
    });

    test("reports no key and no model when the user is not found", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        collections: {
          users: makeCollection({
            findOne: () => Promise.resolve(null),
          }),
        },
      });

      await handleGetSettings(req, res);

      assert.equal(res._body.hasGeminiKey, false);
      assert.equal(res._body.geminiModel, null);
    });

    test("reports no key and no model when the db throws", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        collections: {
          users: makeCollection({
            findOne: () => Promise.reject(new Error("db error")),
          }),
        },
      });

      await handleGetSettings(req, res);

      assert.equal(res._body.hasGeminiKey, false);
      assert.equal(res._body.geminiModel, null);
    });
  });

  describe("handlePutSettings", () => {
    test("saves geminiApiKey and returns success", async () => {
      let updateArgs = null;
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        body: { geminiApiKey: "new-key" },
        collections: {
          users: makeCollection({
            update: (query, update) => {
              updateArgs = { query, update };
              return Promise.resolve();
            },
          }),
        },
      });

      await handlePutSettings(req, res);

      assert.equal(res._body.success, true);
      assert.deepEqual(updateArgs.query, { username: "user-1" });
      assert.equal(updateArgs.update.$set.geminiApiKey, "new-key");
    });

    test("saves geminiModel and returns success", async () => {
      let updateArgs = null;
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        body: { geminiModel: "gemini-2.5-pro" },
        collections: {
          users: makeCollection({
            update: (query, update) => {
              updateArgs = { query, update };
              return Promise.resolve();
            },
          }),
        },
      });

      await handlePutSettings(req, res);

      assert.equal(res._body.success, true);
      assert.equal(updateArgs.update.$set.geminiModel, "gemini-2.5-pro");
    });

    test("does not include geminiApiKey in update when not in request body", async () => {
      let updateArgs = null;
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        body: { geminiModel: "gemini-2.5-pro" },
        collections: {
          users: makeCollection({
            update: (query, update) => {
              updateArgs = { query, update };
              return Promise.resolve();
            },
          }),
        },
      });

      await handlePutSettings(req, res);

      assert.equal("geminiApiKey" in updateArgs.update.$set, false);
    });

    test("does not include geminiModel in update when not in request body", async () => {
      let updateArgs = null;
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        body: { geminiApiKey: "new-key" },
        collections: {
          users: makeCollection({
            update: (query, update) => {
              updateArgs = { query, update };
              return Promise.resolve();
            },
          }),
        },
      });

      await handlePutSettings(req, res);

      assert.equal("geminiModel" in updateArgs.update.$set, false);
    });

    test("returns failure when db throws", async () => {
      const res = makeRes();
      const req = makeReq({
        username: "user-1",
        body: { geminiApiKey: "new-key" },
        collections: {
          users: makeCollection({
            update: () => Promise.reject(new Error("db error")),
          }),
        },
      });

      await handlePutSettings(req, res);

      assert.equal(res._body.success, false);
      assert.match(res._body.data, /db error/);
    });
  });
});
