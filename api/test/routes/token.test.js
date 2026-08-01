import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  computeLegacyHash,
  handleGetUser,
  handleLogin,
  handleRefresh,
  handleGenerateApiKey,
  handleRevokeApiKey,
  tokenCheck,
  SESSION_MAX_MS,
} from "../../src/routes/token.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");

// src/secret.js rejects secrets shorter than MIN_JWT_SECRET_LENGTH (32) at
// startup, so the test secret is sized accordingly even though tokenCheck
// itself does not re-check the length.
const TEST_JWT_SECRET = "test-secret-that-is-long-enough-32";

before(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
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

  test("issues a 1-hour token carrying a sessionStart claim", async () => {
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
    const before = Date.now();

    await handleLogin(req, res, () => {});

    const claims = jwt.verify(res._body.data.token, TEST_JWT_SECRET);
    assert.equal(claims.username, "user-hash");
    assert.equal(claims.exp - claims.iat, 60 * 60, "token TTL should be one hour");
    assert.ok(
      claims.sessionStart >= before && claims.sessionStart <= Date.now(),
      "sessionStart should be the login time",
    );
  });
});

describe("handleRefresh", () => {
  // handleRefresh runs behind tokenCheck (see the router wiring and the
  // "tokenCheck with JWT" suite), so these tests seed req.decoded with the
  // claims tokenCheck would have verified.
  function decodedClaims({ sessionStart, iatMsAgo = 0 } = {}) {
    const iat = Math.floor((Date.now() - iatMsAgo) / 1000);
    return { username: "user-hash", sessionStart, iat, exp: iat + 3600 };
  }

  test("exchanges a valid token for one with a later exp and the same username", async () => {
    const res = makeRes();
    const req = makeReq({});
    req.decoded = decodedClaims({ sessionStart: Date.now() - 30 * 60 * 1000, iatMsAgo: 1800000 });

    handleRefresh(req, res);

    assert.equal(res._body.success, true);
    const claims = jwt.verify(res._body.data.token, TEST_JWT_SECRET);
    assert.equal(claims.username, "user-hash");
    assert.ok(claims.exp > req.decoded.exp, "the new token should expire later than the old one");
  });

  test("carries sessionStart forward rather than resetting it", async () => {
    const sessionStart = Date.now() - 3 * 60 * 60 * 1000;
    const res = makeRes();
    const req = makeReq({});
    req.decoded = decodedClaims({ sessionStart });

    handleRefresh(req, res);

    const claims = jwt.verify(res._body.data.token, TEST_JWT_SECRET);
    assert.equal(
      claims.sessionStart,
      sessionStart,
      "resetting sessionStart would let a stolen token refresh forever",
    );
  });

  test("refuses with 403 once the session is older than SESSION_MAX_MS", async () => {
    const res = makeRes();
    const req = makeReq({});
    req.decoded = decodedClaims({ sessionStart: Date.now() - SESSION_MAX_MS - 1000 });

    handleRefresh(req, res);

    assert.equal(res._status, 403, "the client redirects to login on 403");
    assert.equal(res._body.success, false);
    assert.match(res._body.data.message, /Session expired/);
  });

  test("treats a pre-migration token without sessionStart as starting at iat", async () => {
    const res = makeRes();
    const req = makeReq({});
    req.decoded = decodedClaims({ iatMsAgo: 30 * 60 * 1000 });

    handleRefresh(req, res);

    assert.equal(res._body.success, true);
    const claims = jwt.verify(res._body.data.token, TEST_JWT_SECRET);
    assert.equal(
      claims.sessionStart,
      req.decoded.iat * 1000,
      "old tokens get a cap measured from their issue time",
    );
  });

  test("refuses a pre-migration token whose iat is already past the cap", async () => {
    const res = makeRes();
    const req = makeReq({});
    req.decoded = decodedClaims({ iatMsAgo: SESSION_MAX_MS + 1000 });

    handleRefresh(req, res);

    assert.equal(res._status, 403);
    assert.equal(res._body.success, false);
  });

  test("an API-key caller (no iat, no sessionStart) starts a session now", async () => {
    const res = makeRes();
    const req = makeReq({});
    req.decoded = { username: "apikey-user" };
    const before = Date.now();

    handleRefresh(req, res);

    assert.equal(res._body.success, true);
    const claims = jwt.verify(res._body.data.token, TEST_JWT_SECRET);
    assert.ok(claims.sessionStart >= before, "must not mint a token with an undefined cap");
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

describe("tokenCheck with JWT", () => {
  const signWith = (payload, options = {}, secret = TEST_JWT_SECRET) =>
    jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: "1h", ...options });

  // tokenCheck's JWT branch finishes inside jwt.verify's callback. That callback
  // is invoked synchronously today, but awaiting one extra macrotask makes these
  // tests independent of that implementation detail.
  async function runTokenCheck(req) {
    const res = makeRes();
    let nextCalled = false;
    await tokenCheck(req, res, () => {
      nextCalled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    return { res, nextCalled };
  }

  // makeReq seeds req.decoded, which would mask a tokenCheck that never sets it.
  function makeAnonReq(options) {
    const req = makeReq(options);
    req.decoded = null;
    return req;
  }

  test("accepts a valid token from req.body.token and populates req.decoded", async () => {
    const req = makeAnonReq({ body: { token: signWith({ username: "jwt-user" }) } });

    const { res, nextCalled } = await runTokenCheck(req);

    assert.ok(nextCalled, "should call next() on a valid token");
    assert.equal(req.decoded.username, "jwt-user");
    assert.equal(res._body, null, "should not write a response when authentication succeeds");
  });

  test("accepts a valid token from req.query.token", async () => {
    const req = makeAnonReq({ query: { token: signWith({ username: "query-user" }) } });

    const { nextCalled } = await runTokenCheck(req);

    assert.ok(nextCalled, "should call next() on a valid token");
    assert.equal(req.decoded.username, "query-user");
  });

  test("accepts a valid token from the x-access-token header", async () => {
    const req = makeAnonReq({
      headers: { "x-access-token": signWith({ username: "header-user" }) },
    });

    const { nextCalled } = await runTokenCheck(req);

    assert.ok(nextCalled, "should call next() on a valid token");
    assert.equal(req.decoded.username, "header-user");
  });

  test("rejects an expired token", async () => {
    const req = makeAnonReq({
      headers: { "x-access-token": signWith({ username: "expired-user" }, { expiresIn: "-1s" }) },
    });

    const { res, nextCalled } = await runTokenCheck(req);

    assert.equal(nextCalled, false, "should not call next() on an expired token");
    assert.equal(res._body.success, false);
    assert.match(res._body.message, /Failed to authenticate token/);
    assert.equal(req.decoded, null, "should not populate req.decoded");
  });

  test("rejects a malformed token", async () => {
    const req = makeAnonReq({ headers: { "x-access-token": "not-a-jwt-at-all" } });

    const { res, nextCalled } = await runTokenCheck(req);

    assert.equal(nextCalled, false, "should not call next() on a malformed token");
    assert.equal(res._body.success, false);
  });

  test("rejects a token signed with the wrong secret", async () => {
    const forged = signWith({ username: "attacker" }, {}, "an-attacker-controlled-secret-32-chars");
    const req = makeAnonReq({ headers: { "x-access-token": forged } });

    const { res, nextCalled } = await runTokenCheck(req);

    assert.equal(nextCalled, false, "a signature from another secret must not authenticate");
    assert.equal(res._body.success, false);
    assert.equal(req.decoded, null);
  });

  test("returns 403 when no token is provided anywhere", async () => {
    const req = makeAnonReq({});

    const { res, nextCalled } = await runTokenCheck(req);

    assert.equal(nextCalled, false, "should not call next() without a token");
    assert.equal(res._status, 403);
    assert.equal(res._body.success, false);
    assert.match(res._body.message, /No token provided/);
  });

  test("distinguishes a missing token (403) from an invalid token (200 with success:false)", async () => {
    // This asymmetry is load-bearing, not an oversight: the web client treats a
    // 403 as "you are not logged in" and redirects to the login page, while an
    // invalid-token response comes back as HTTP 200 with {success:false} and is
    // handled in-band. Changing either status code would change the client's
    // redirect behaviour, so both are pinned here.
    const missing = await runTokenCheck(makeAnonReq({}));
    assert.equal(
      missing.res._status,
      403,
      "missing token MUST be 403 — the client redirects on it",
    );
    assert.equal(missing.res._body.success, false);

    const invalid = await runTokenCheck(
      makeAnonReq({ headers: { "x-access-token": "garbage.token.value" } }),
    );
    assert.equal(
      invalid.res._status,
      200,
      "invalid token MUST NOT be 403 — it stays 200 so the client does not redirect",
    );
    assert.equal(invalid.res._body.success, false);

    assert.notEqual(
      missing.res._status,
      invalid.res._status,
      "the two failure modes must remain distinguishable by status code",
    );
  });

  test("prefers the API key branch over a JWT when both are present", async () => {
    const req = makeAnonReq({
      headers: {
        "x-api-key": "c".repeat(64),
        "x-access-token": signWith({ username: "jwt-user" }),
      },
      collections: {
        users: makeCollection({ findOne: () => Promise.resolve({ username: "apikey-user" }) }),
      },
    });

    const { nextCalled } = await runTokenCheck(req);

    assert.ok(nextCalled);
    assert.equal(req.decoded.username, "apikey-user");
  });
});
