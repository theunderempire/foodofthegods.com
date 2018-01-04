var express = require('express');
var router = express.Router();
var ObjectId = require('mongodb').ObjectID;

/* GET ingredient list */
router.get('/', function(req, res, next) {
    var db = getDB(req);
    var collection = getCollection(db);
    collection.find({},{},function(e, docs){
        res.json({success: true, data: docs});
    })
});

router.post('/', function (req, res, next) {
    var db = getDB(req);
    var collection = getCollection(db);

    collection.remove({});

    collection.insert(req.body, function(err, result){
        printMsg(res, err, 'list updated');
    });
});

function getCollection(db) {
    return db.get('ingredientlist');
}

function getDB(req) {
    return req.db;
}

function printMsg(res, err, msg) {
    var resMsg = err === null
        ? {"msg": msg}
        : {msg: "error: " + err};
    res.json({success: true, data: resMsg});
}

module.exports = router;

