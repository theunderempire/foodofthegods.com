import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import secret from "../secret.js";
const router = express.Router();

router.get("/:username", async function (req, res, next) {
  var collection = getCollection(req.db);
  var username = req.params.username;

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
        data: { username: username, timestamp: user.timestamp },
      });
    }
  } catch (err) {
    next(err);
  }
});

router.post("/", async function (req, res, next) {
  var collection = getCollection(req.db);

  try {
    const user = await collection.findOne({ username: req.body.username }, {});
    if (!user) {
      return res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    }

    let passwordMatch;
    if (user.password.startsWith("$2b$")) {
      // bcrypt hash — compare directly
      passwordMatch = await bcrypt.compare(req.body.password, user.password);
    } else {
      // Legacy plain/MD5 comparison — migrate to bcrypt on success
      passwordMatch = user.password === req.body.password;
      if (passwordMatch) {
        const hashed = await bcrypt.hash(req.body.password, 12);
        await collection.update(
          { username: req.body.username },
          { $set: { password: hashed } },
        );
        console.log(
          `[auth] migrated password to bcrypt for user="${req.body.username}"`,
        );
      }
    }

    if (!passwordMatch) {
      return res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    }

    var token = jwt.sign({ username: user.username }, secret.superSecret, {
      expiresIn: "1d",
      algorithm: "HS256",
    });

    res.json({
      success: true,
      data: { message: "authenticated", token },
    });
  } catch (err) {
    next(err);
  }
});

function getCollection(db) {
  return db.get("users");
}

function tokenCheck(req, res, next) {
  var token =
    req.body.token || req.query.token || req.headers["x-access-token"];

  if (token) {
    jwt.verify(
      token,
      secret.superSecret,
      { algorithms: ["HS256"] },
      function (err, decoded) {
        if (err) {
          return res.json({
            success: false,
            message: "Failed to authenticate token.",
          });
        } else {
          req.decoded = decoded;
          next();
        }
      },
    );
  } else {
    return res.status(403).send({
      success: false,
      message: "No token provided.",
    });
  }
}

export { router, tokenCheck };
