import crypto from "crypto";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import secret from "../secret.js";
import { isNonEmptyString } from "../validate.js";
const router = express.Router();

// The access token TTL doubles as the inactivity timeout: an active client
// refreshes well before expiry, an idle one lapses. SESSION_MAX_MS is the
// absolute ceiling — refresh carries the original sessionStart forward, so a
// stolen token can slide at most this far before re-authentication.
export const TOKEN_TTL = "1h";
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

function signToken(username, sessionStart) {
  return jwt.sign({ username, sessionStart }, secret.superSecret, {
    expiresIn: TOKEN_TTL,
    algorithm: "HS256",
  });
}

// Replicates the legacy client-side hash so existing accounts can be migrated
export function computeLegacyHash(timestamp, rawPassword) {
  const md5 = (v) => crypto.createHash("md5").update(v).digest("hex");
  const salt = md5(timestamp);
  const passHash = md5(md5(rawPassword));
  const pbkdf2 = crypto.pbkdf2Sync(passHash, salt, 10, 32, "sha512").toString("hex");
  return salt + pbkdf2;
}

// Self-lookup only. While this was public it confirmed which usernames existed
// and returned `timestamp`, which is the salt for legacy password hashes — that
// combination let an attacker precompute hashes offline for a known account.
export async function handleGetUser(req, res, next) {
  var collection = getCollection(req.db);
  var username = req.params.username;
  if (req.decoded?.username !== username) {
    return res.status(401).json({ success: false, data: { message: "Unauthorized." } });
  }
  try {
    const user = await collection.findOne({ username: username }, {});
    if (!user) {
      res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    } else {
      res.json({
        success: true,
        data: { username: username },
      });
    }
  } catch (err) {
    next(err);
  }
}

export async function handleLogin(req, res, next) {
  var collection = getCollection(req.db);
  const { username, password } = req.body;
  if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
    return res.json({
      success: false,
      data: { message: "Authentication failed. Incorrect credentials." },
    });
  }
  try {
    const user = await collection.findOne({ username }, {});
    if (!user) {
      return res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    }

    let passwordMatch;
    if (user.password.startsWith("$2b$")) {
      passwordMatch = await bcrypt.compare(password, user.password);
    } else {
      // Legacy: derive the old client-side hash and compare, then migrate
      const legacyHash = computeLegacyHash(user.timestamp, password);
      passwordMatch = user.password === legacyHash;
      if (passwordMatch) {
        const hashed = await bcrypt.hash(password, 12);
        await collection.update({ username }, { $set: { password: hashed } });
        console.log(`[auth] migrated password to bcrypt for user="${username}"`);
      }
    }

    if (!passwordMatch) {
      return res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    }

    res.json({
      success: true,
      data: { message: "authenticated", token: signToken(user.username, Date.now()) },
    });
  } catch (err) {
    next(err);
  }
}

// Exchanges a currently valid token (tokenCheck runs first) for a fresh one.
// sessionStart is carried forward, never reset, so refreshing cannot extend a
// session past SESSION_MAX_MS. Tokens minted before sessionStart existed fall
// back to their issue time; API-key callers have neither claim and start now.
export function handleRefresh(req, res) {
  const { username, sessionStart, iat } = req.decoded;
  const start = sessionStart ?? (iat ? iat * 1000 : Date.now());
  if (Date.now() - start > SESSION_MAX_MS) {
    return res.status(403).json({
      success: false,
      data: { message: "Session expired. Please log in again." },
    });
  }
  res.json({
    success: true,
    data: { message: "refreshed", token: signToken(username, start) },
  });
}

// Hashes an API key the same way it is stored, so raw keys never touch the DB
function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

// Generates (or rotates) a long-lived API key for the authenticated user.
// Only the SHA-256 hash is stored; the raw key is returned once and cannot be
// recovered later.
export async function handleGenerateApiKey(req, res, next) {
  try {
    const rawKey = crypto.randomBytes(32).toString("hex");
    await getCollection(req.db).update(
      { username: req.decoded.username },
      { $set: { apiKeyHash: hashApiKey(rawKey) } },
    );
    res.json({ success: true, data: { apiKey: rawKey } });
  } catch (err) {
    next(err);
  }
}

// Revokes the authenticated user's API key.
export async function handleRevokeApiKey(req, res, next) {
  try {
    await getCollection(req.db).update(
      { username: req.decoded.username },
      { $unset: { apiKeyHash: "" } },
    );
    res.json({ success: true, data: { message: "revoked" } });
  } catch (err) {
    next(err);
  }
}

router.post("/", handleLogin);
router.post("/refresh", tokenCheck, handleRefresh);
router.get("/:username", tokenCheck, handleGetUser);
router.post("/apikey", tokenCheck, handleGenerateApiKey);
router.delete("/apikey", tokenCheck, handleRevokeApiKey);

function getCollection(db) {
  return db.get("users");
}

async function tokenCheck(req, res, next) {
  // An API key authenticates as the user it belongs to. Used by external
  // clients (e.g. the phone shopping-list voice automation) that can't hold a
  // short-lived JWT.
  var apiKey = req.headers["x-api-key"];
  if (apiKey) {
    try {
      var user = await getCollection(req.db).findOne({ apiKeyHash: hashApiKey(apiKey) });
      if (!user) {
        return res.status(403).send({ success: false, message: "Invalid API key." });
      }
      req.decoded = { username: user.username };
      return next();
    } catch (err) {
      console.error(`[auth] API key check failed: ${err}`);
      return res.status(500).send({ success: false, message: "Failed to authenticate API key." });
    }
  }

  var token = req.body.token || req.query.token || req.headers["x-access-token"];

  if (token) {
    jwt.verify(token, secret.superSecret, { algorithms: ["HS256"] }, function (err, decoded) {
      if (err) {
        return res.json({
          success: false,
          message: "Failed to authenticate token.",
        });
      } else {
        req.decoded = decoded;
        next();
      }
    });
  } else {
    return res.status(403).send({
      success: false,
      message: "No token provided.",
    });
  }
}

export { router, tokenCheck };
