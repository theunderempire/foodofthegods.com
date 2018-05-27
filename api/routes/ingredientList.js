var express = require('express');
var router = express.Router();
var ObjectId = require('mongodb').ObjectID;

/* GET ingredient list */
router.get('/:userId', function(req, res, next) {
    var id = req.params.userId;
    var db = getDB(req);
    var collection = getCollection(db);
    
    if (checkUser(req, id)) {    
        collection.find({"userId" : id},{},function(e, docs){
            res.json({success: true, data: docs});
        });
    } else {
        returnUnauthorized(res);
    }
});

router.post('/:userId', function (req, res, next) {
    var id = req.params.userId;
    var db = getDB(req);
    var collection = getCollection(db);

    if (checkUser(req, id)) {
        collection.update({"userId" : id}, {"userId" : id, "ingredientList" : req.body.ingredientList, "completedList" : req.body.completedList}, { 'upsert' : true }, function(err, result){
            printMsg(res, err, 'list updated');
        });
    } else {
        returnUnauthorized(res);
    }
});

function returnUnauthorized(res) {
    res.status(401).json({success: false});
}

function checkUser(req, id) {
    return req.decoded.username === id;
}

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

