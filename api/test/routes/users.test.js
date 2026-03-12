import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { handleGetSettings, handlePutSettings } from "../../src/routes/users.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

describe("users settings", () => {
  describe("handleGetSettings", () => {
    test("returns geminiApiKey when user has one set", async () => {
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

      assert.equal(res._body.geminiApiKey, "my-key");
    });

    test("returns null when user has no geminiApiKey", async () => {
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

      assert.equal(res._body.geminiApiKey, null);
    });

    test("returns null when user is not found", async () => {
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

      assert.equal(res._body.geminiApiKey, null);
    });

    test("returns null when db throws", async () => {
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

      assert.equal(res._body.geminiApiKey, null);
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
