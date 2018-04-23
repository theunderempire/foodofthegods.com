var express = require('express');
var router = express.Router();
var ObjectId = require('mongodb').ObjectID;

/* GET recipes listing. */
router.get('/:id', function(req, res, next) {
    var db = getDB(req);
    var collection = getCollection(db);
    collection.find({ '_id': req.params.id },{},function(e, docs){
        res.json({success: true, data: docs});
    })
});

function getCollection(db) {
    return db.get('recipelist');
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

