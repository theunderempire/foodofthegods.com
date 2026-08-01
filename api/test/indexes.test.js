import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ensureIndexes } from "../src/indexes.js";

function makeDb({ onCreateIndex } = {}) {
  const calls = [];
  return {
    calls,
    get: (name) => ({
      createIndex: async (fields, options) => {
        calls.push({ collection: name, fields, options });
        if (onCreateIndex) return onCreateIndex(name, fields);
        return `${name}_index`;
      },
    }),
  };
}

describe("ensureIndexes", () => {
  test("indexes the fields the hot paths query on", async () => {
    const db = makeDb();

    await ensureIndexes(db);

    const created = db.calls.map((c) => `${c.collection}:${Object.keys(c.fields).join(",")}`);
    assert.ok(
      created.includes("users:username"),
      "tokenCheck and every service look up by username",
    );
    assert.ok(
      created.includes("users:apiKeyHash"),
      "API-key auth looks up by hash on every request",
    );
    assert.ok(created.includes("users:recipeList"), "deleteRecipe searches for remaining owners");
    assert.ok(
      created.includes("ingredientlist:userId"),
      "every shopping-list op looks up by userId",
    );
  });

  test("makes username and apiKeyHash unique", async () => {
    const db = makeDb();

    await ensureIndexes(db);

    const username = db.calls.find((c) => c.fields.username);
    const apiKey = db.calls.find((c) => c.fields.apiKeyHash);
    assert.equal(username.options.unique, true);
    assert.equal(apiKey.options.unique, true);
  });

  // Most users have no API key, so a non-sparse unique index would collide on
  // every missing value and fail to build.
  test("makes the apiKeyHash index sparse", async () => {
    const db = makeDb();

    await ensureIndexes(db);

    assert.equal(db.calls.find((c) => c.fields.apiKeyHash).options.sparse, true);
  });

  // A unique index cannot build over data that already violates it. That must not
  // stop the API from serving traffic.
  test("reports a failed index without throwing", async () => {
    const db = makeDb({
      onCreateIndex: (name, fields) => {
        if (fields.username) throw new Error("E11000 duplicate key error");
        return "ok";
      },
    });

    const result = await ensureIndexes(db);

    assert.deepEqual(result.failures, ["users.username"]);
  });

  test("still attempts every remaining index after one fails", async () => {
    const db = makeDb({
      onCreateIndex: (name, fields) => {
        if (fields.username) throw new Error("boom");
        return "ok";
      },
    });

    await ensureIndexes(db);

    assert.equal(db.calls.length, 4, "a failure must not abort the rest");
  });

  test("reports no failures when every index builds", async () => {
    const result = await ensureIndexes(makeDb());

    assert.deepEqual(result.failures, []);
  });
});
