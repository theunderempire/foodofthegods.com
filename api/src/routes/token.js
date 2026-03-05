import express from "express";
import jwt from "jsonwebtoken";
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
      res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    } else if (user.password != req.body.password) {
      console.log(user.password, req.body.password);
      res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    } else {
      var token = jwt.sign(
        {
          success: true,
          username: user.username,
          password: user.password,
        },
        secret.superSecret,
        {
          expiresIn: "1d",
          algorithm: "HS256",
        }
      );

      res.json({
        success: true,
        data: {
          message: "authenticated",
          token: token,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

function getCollection(db) {
  return db.get("users");
}

function tokenCheck(req, res, next) {
  // check header or url parameters or post parameters for token
  var token =
    req.body.token || req.query.token || req.headers["x-access-token"];

  // decode token
  if (token) {
    // verifies secret and checks exp
    jwt.verify(token, secret.superSecret, { algorithms: ["HS256"] }, function (err, decoded) {
      if (err) {
        return res.json({
          success: false,
          message: "Failed to authenticate token.",
        });
      } else {
        // if everything is good, save to request for use in other routes
        req.decoded = decoded;
        next();
      }
    });
  } else {
    // if there is no token
    // return an error
    return res.status(403).send({
      success: false,
      message: "No token provided.",
    });
  }
}

export { router, tokenCheck };
