var express = require('express');
var router = express.Router();
var ObjectId = require('mongodb').ObjectID;

/* GET recipes listing. */
router.get('/:userId', function(req, res, next) {
    var id = req.params.userId;
    var db = getDB(req);
    var collection = getCollection(db);
    collection.find({'userId': id},{},function(e, docs){
        res.json({success: true, data: docs});
    })
});

router.post('/', function (req, res, next) {
    var db = getDB(req);
    var collection = getCollection(db);

    collection.insert(req.body, function(err, result){
        printMsg(res, err, 'recipe added');
    });
});

router.delete('/:id', function (req, res, next) {
    var db = getDB(req);
    var collection = getCollection(db);
    var recipeToDelete = req.params.id;

    collection.remove({ '_id' : recipeToDelete }, function(err) {
        printMsg(res, err, 'recipe deleted');
    });
});

router.put('/:id', function (req, res, next) {
    var db = getDB(req);
    var collection = getCollection(db);
    var recipeToUpdate = req.params.id;
    var updatedRecipe = req.body;

    collection.update({'_id' : recipeToUpdate}, updatedRecipe, function (err) {
        printMsg(res, err, 'recipe updated');
    });
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

