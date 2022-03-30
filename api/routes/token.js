var express = require('express');

var router = express.Router();
var ObjectId = require('mongodb').ObjectID;
var jwt = require('jsonwebtoken');
var app = require('../fotg');

router.get('/:username', function (req, res, next) {
  var db = getDB(req);
  var collection = getCollection(db);
  var app = require('../fotg');
  var username = req.params.username;

  collection.findOne({ username: username }, {}, function (e, user) {
    if (!user) {
      res.json({ success: false, message: 'Authentication failed. Incorrect credentials.' });
    } else {
      res.json({ success: true, username: username, timestamp: user.timestamp });
    }
  });
})

router.post('/', function (req, res, next) {
  var db = getDB(req);
  var collection = getCollection(db);
  var app = require('../fotg');

  collection.findOne({ username: req.body.username }, {}, function (e, user) {

    if (!user) {
      res.json({ success: false, message: 'Authentication failed. Incorrect credentials.' });
    } else {
      if (user.password != req.body.password) {
        res.json({ success: false, message: 'Authentication failed. Incorrect credentials.' });
      } else {
        var token = jwt.sign({ success: true, username: user.username, password: user.password }, app.get('superSecret'), {
          expiresIn: '1d'
        });

        res.json({
          success: true,
          message: 'authenticated',
          token: token
        });
      }
    }
  });
});

function getCollection(db) {
  return db.get('users');
}

function getDB(req) {
  return req.db;
}

module.exports = router;

