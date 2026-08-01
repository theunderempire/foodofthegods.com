import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import bcrypt from "bcrypt";
import {
  computeLegacyHash,
  handleGetUser,
  handleLogin,
  handleGenerateApiKey,
  handleRevokeApiKey,
  tokenCheck,
} from "../../src/routes/token.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

before(() => {
  process.env.JWT_SECRET = "test-secret";
});

describe("computeLegacyHash", () => {
  test("returns a 96-character hex string", () => {
    const result = computeLegacyHash("some-timestamp", "password");
    assert.equal(result.length, 96);
    assert.match(result, /^[0-9a-f]+$/);
  });

  test("is deterministic — same inputs produce same output", () => {
    const a = computeLegacyHash("ts1", "pass1");
    const b = computeLegacyHash("ts1", "pass1");
    assert.equal(a, b);
  });

  test("different passwords produce different hashes", () => {
    const a = computeLegacyHash("same-ts", "password1");
    const b = computeLegacyHash("same-ts", "password2");
    assert.notEqual(a, b);
  });

  test("different timestamps produce different hashes", () => {
    const a = computeLegacyHash("timestamp1", "samepassword");
    const b = computeLegacyHash("timestamp2", "samepassword");
    assert.notEqual(a, b);
  });
});

describe("handleLogin", () => {
  test("returns token for correct bcrypt password", async () => {
    const password = "testpassword";
    const hash = await bcrypt.hash(password, 10);
    const res = makeRes();
    const req = makeReq({
      body: { username: "user-hash", password },
      collections: {
        users: makeCollection({
          findOne: () => Promise.resolve({ username: "user-hash", password: hash }),
        }),
      },
    });

    await handleLogin(req, res, () => {});

    assert.equal(res._body.success, true);
    assert.ok(res._body.data.token, "should return a token");
  });

  test("returns error for wrong bcrypt password", async () => {
    const hash = await bcrypt.hash("correctpassword", 10);
    const res = makeRes();
    const req = makeReq({
      body: { username: "user-hash", password: "wrongpassword" },
      collections: {
        users: makeCollection({
          findOne: () => Promise.resolve({ username: "user-hash", password: hash }),
        }),
      },
    });

    await handleLogin(req, res, () => {});

    assert.equal(res._body.success, false);
    assert.match(res._body.data.message, /Authentication failed/);
  });

  test("returns token and migrates legacy password to bcrypt on success", async () => {
    const password = "testpassword";
    const timestamp = "test-timestamp";
    const legacyHash = computeLegacyHash(timestamp, password);
    let migratedHash = null;
    const res = makeRes();
    const req = makeReq({
      body: { username: "user-hash", password },
      collections: {
        users: makeCollection({
          findOne: () =>
            Promise.resolve({ username: "user-hash", password: legacyHash, timestamp }),
          update: (_q, u) => {
            migratedHash = u.$set.password;
            return Promise.resolve();
          },
        }),
      },
    });

    await handleLogin(req, res, () => {});

    assert.equal(res._body.success, true);
    assert.ok(res._body.data.token, "should return a token");
    assert.ok(migratedHash, "should have updated the stored password");
    assert.ok(migratedHash.startsWith("$2b$"), "migrated password should be a bcrypt hash");
  });

  test("returns error for wrong legacy password", async () => {
    const timestamp = "test-timestamp";
    const legacyHash = computeLegacyHash(timestamp, "correctpassword");
    const res = makeRes();
    const req = makeReq({
      body: { username: "user-hash", password: "wrongpassword" },
      collections: {
        users: makeCollection({
          findOne: () =>
            Promise.resolve({ username: "user-hash", password: legacyHash, timestamp }),
        }),
      },
    });

    await handleLogin(req, res, () => {});

    assert.equal(res._body.success, false);
  });

  test("rejects Mongo operator objects as credentials without querying", async () => {
    let queried = false;
    const res = makeRes();
    const req = makeReq({
      body: { username: { $gt: "" }, password: { $gt: "" } },
      collections: {
        users: makeCollection({
          findOne: () => {
            queried = true;
            return Promise.resolve({ username: "victim", password: "$2b$12$whatever" });
          },
        }),
      },
    });

    await handleLogin(req, res, () => {});

    assert.equal(res._body.success, false);
    assert.equal(queried, false, "must not reach the database");
  });

  test("returns error when user is not found", async () => {
    const res = makeRes();
    const req = makeReq({
      body: { username: "unknown", password: "any" },
      collections: {
        users: makeCollection({
          findOne: () => Promise.resolve(null),
        }),
      },
    });

    await handleLogin(req, res, () => {});

    assert.equal(res._body.success, false);
    assert.match(res._body.data.message, /Authentication failed/);
  });
});

describe("handleGetUser", () => {
  test("returns the username for a self-lookup without exposing the legacy salt", async () => {
    const res = makeRes();
    const req = makeReq({
      username: "me",
      params: { username: "me" },
      collections: {
        users: makeCollection({
          findOne: () => Promise.resolve({ username: "me", timestamp: "salt-source" }),
        }),
      },
    });

    await handleGetUser(req, res, () => {});

    assert.equal(res._body.success, true);
    assert.equal(res._body.data.username, "me");
    assert.equal(
      res._body.data.timestamp,
      undefined,
      "timestamp is the legacy password salt and must not be returned",
    );
  });

  test("returns 401 when looking up another user, without querying", async () => {
    let queried = false;
    const res = makeRes();
    const req = makeReq({
      username: "me",
      params: { username: "someone-else" },
      collections: {
        users: makeCollection({
          findOne: () => {
            queried = true;
            return Promise.resolve({ username: "someone-else", timestamp: "salt-source" });
          },
        }),
      },
    });

    await handleGetUser(req, res, () => {});

    assert.equal(res._status, 401);
    assert.equal(res._body.success, false);
    assert.equal(queried, false, "must not confirm whether the account exists");
  });
});

describe("handleGenerateApiKey", () => {
  test("stores only the hash and returns the raw key once", async () => {
    let storedUpdate = null;
    const res = makeRes();
    const req = makeReq({
      username: "user-hash",
      collections: {
        users: makeCollection({
          update: (_q, u) => {
            storedUpdate = u;
            return Promise.resolve();
          },
        }),
      },
    });

    await handleGenerateApiKey(req, res, () => {});

    assert.equal(res._body.success, true);
    const rawKey = res._body.data.apiKey;
    assert.match(rawKey, /^[0-9a-f]{64}$/, "raw key should be 32 bytes of hex");
    assert.ok(storedUpdate.$set.apiKeyHash, "should store an apiKeyHash");
    assert.notEqual(storedUpdate.$set.apiKeyHash, rawKey, "should not store the raw key");
    assert.equal(
      storedUpdate.$set.apiKeyHash,
      sha256(rawKey),
      "stored hash should be sha256 of the raw key",
    );
  });
});

describe("handleRevokeApiKey", () => {
  test("unsets the stored apiKeyHash", async () => {
    let storedUpdate = null;
    const res = makeRes();
    const req = makeReq({
      username: "user-hash",
      collections: {
        users: makeCollection({
          update: (_q, u) => {
            storedUpdate = u;
            return Promise.resolve();
          },
        }),
      },
    });

    await handleRevokeApiKey(req, res, () => {});

    assert.equal(res._body.success, true);
    assert.deepEqual(storedUpdate, { $unset: { apiKeyHash: "" } });
  });
});

describe("tokenCheck with API key", () => {
  test("authenticates as the user owning the key", async () => {
    const rawKey = "a".repeat(64);
    let queriedHash = null;
    let nextCalled = false;
    const res = makeRes();
    const req = makeReq({
      headers: { "x-api-key": rawKey },
      collections: {
        users: makeCollection({
          findOne: (q) => {
            queriedHash = q.apiKeyHash;
            return Promise.resolve({ username: "owner-hash" });
          },
        }),
      },
    });
    // makeReq seeds req.decoded; clear it to prove tokenCheck sets it from the key
    req.decoded = null;

    await tokenCheck(req, res, () => {
      nextCalled = true;
    });

    assert.equal(queriedHash, sha256(rawKey), "should look up by the hashed key");
    assert.ok(nextCalled, "should call next() on a valid key");
    assert.equal(req.decoded.username, "owner-hash");
  });

  test("rejects an unknown API key with 403", async () => {
    let nextCalled = false;
    const res = makeRes();
    const req = makeReq({
      headers: { "x-api-key": "b".repeat(64) },
      collections: {
        users: makeCollection({
          findOne: () => Promise.resolve(null),
        }),
      },
    });

    await tokenCheck(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false, "should not call next() on an invalid key");
    assert.equal(res._status, 403);
    assert.equal(res._body.success, false);
  });
});
