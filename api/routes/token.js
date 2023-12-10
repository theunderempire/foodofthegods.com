var express = require("express");

var router = express.Router();
var jwt = require("jsonwebtoken");

router.get("/:username", function (req, res, next) {
  var db = getDB(req);
  var collection = getCollection(db);
  var username = req.params.username;

  collection.findOne({ username: username }, {}, function (e, user) {
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
  });
});

router.post("/", function (req, res, next) {
  var db = getDB(req);
  var collection = getCollection(db);
  var app = require("../fotg");

  collection.findOne({ username: req.body.username }, {}, function (e, user) {
    if (!user) {
      res.json({
        success: false,
        data: { message: "Authentication failed. Incorrect credentials." },
      });
    } else {
      if (user.password != req.body.password) {
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
          app.get("superSecret"),
          {
            expiresIn: "1d",
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
    }
  });
});

function getCollection(db) {
  return db.get("users");
}

function getDB(req) {
  return req.db;
}

function tokenCheck(req, res, next) {
  // check header or url parameters or post parameters for token
  var token =
    req.body.token || req.query.token || req.headers["x-access-token"];

  if (req.method === "OPTIONS") {
    res.send("op");

    return;
  }

  // decode token
  if (token) {
    // verifies secret and checks exp
    jwt.verify(token, app.get("superSecret"), function (err, decoded) {
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

module.exports = { router, tokenCheck };
