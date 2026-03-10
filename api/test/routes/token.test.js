import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { computeLegacyHash, handleLogin } from "../../src/routes/token.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

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
