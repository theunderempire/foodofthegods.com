// A service for making recipe operations
var RecipesService = function () {
    this.addRecipeForUser = addRecipeForUser;
    this.deleteRecipe = deleteRecipe;
    this.getRecipesForUser = getRecipesForUser;
    this.updateRecipe = updateRecipe;

    // Adds a recipe to a user's recipe list
    function addRecipeForUser(req, res) {
        var collection = getRecipeListCollection(req);

        if (req.body.userId === req.decoded.username) {
            collection.insert(req.body, function(err, result){
                printMsg(res, err, 'recipe added');
            });
        }
    };

    // Deletes the recipe with the requested recipeID
    function deleteRecipe(req, res) {
        var collection = getRecipeListCollection(req);
        var recipeID = req.params.id;

        collection.find({'_id' : recipeID}, {}, function(e, docs) {
            if (checkUser(req, docs[0].userId)) {
                collection.remove({ '_id' : recipeID }, function(err) {
                    printMsg(res, err, 'recipe deleted');
                });
            } else {
                returnUnauthorized(res);
            }
        });
    }

    // Returns all the recipes that are owned by the user with userID id
    function getRecipesForUser(req, res) {
        var collection = getRecipeListCollection(req);
        var userID = req.params.userId;

        if (checkUser(req, userID)) {
            collection.find({'userId': userID},{},function(e, docs){
                res.json({success: true, data: docs});
            })
        } else {
            returnUnauthorized(res);
        }
    };

    // Updates the recipe with the passed `id` param with the
    // recipe passed in the request body
    function updateRecipe(req, res) {
        var collection = getRecipeListCollection(req);
        var recipeID = req.params.id
        var updatedRecipe = req.body;

        collection.find({'_id' : recipeID}, {}, function(e, docs) {
            if (checkUser(req, docs[0].userId)) {
                collection.update({'_id' : recipeID}, updatedRecipe, function (err) {
                    printMsg(res, err, 'recipe updated');
                });
            } else {
                returnUnauthorized(res);
            }
        });
    }

    // Returns the 'recipelist' collection from the db
    function getRecipeListCollection(req) {
        return getCollection(getDB(req));
    }

    // Validates that the user making the request is the user whose informatioin
    // they are requesting
    function checkUser(req, id) {
        return id === req.decoded.username;
    }

    // Returns the recipelist collection from the DB
    function getCollection(db) {
        return db.get('recipelist');
    }

    // Returns a reference to the DB
    function getDB(req) {
        return req.db;
    }

    function printMsg(res, err, msg) {
        var resMsg = err === null ?
            {"msg": msg} :
            {msg: "error: " + err};

        res.json({success: true, data: resMsg});
    }

    // Returns a standard unauthorized message
    function returnUnauthorized() {
        res.status(401).json({success: false});
    }
};

module.exports = RecipesService;

