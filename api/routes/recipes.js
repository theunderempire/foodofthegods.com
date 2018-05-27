var express = require('express');
var router = express.Router();
var ObjectId = require('mongodb').ObjectID;

/* GET recipes listing. */
router.get('/:userId', function(req, res, next) {
    var id = req.params.userId;
    var db = getDB(req);
    var collection = getCollection(db);
    
    // Check that this user is authorized to view these things
    if (checkUser(req, id)) {

        collection.find({'userId': id},{},function(e, docs){
            res.json({success: true, data: docs});
        })
    } else {
        returnUnauthorized(res);
    }
});

router.post('/', function (req, res, next) {
    var db = getDB(req);
    var collection = getCollection(db);

//    res.send(req.body.userId === req.decoded.username);

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

function checkUser(req, id) {
    return id === req.decoded.username;
}

function returnUnauthorized(res) {
    res.status(401).json({success: false});
}

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

