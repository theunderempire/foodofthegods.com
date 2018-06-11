var RequestService = require('./request.service');
var requestService = new RequestService();

// A service for making recipe operations
var RecipesService = function () {
    this.addRecipeForUser = addRecipeForUser;
    this.deleteRecipe = deleteRecipe;
    this.getRecipesForUser = getRecipesForUser;
    this.getSingleRecipe = getSingleRecipe;
    this.updateRecipe = updateRecipe;

    // Adds a recipe to a user's recipe list
    function addRecipeForUser(req, res) {
        var collection = getRecipeListCollection(req);

        if (req.body.userId === req.decoded.username) {
            collection.insert(req.body, function(err, result){
                requestService.printMsg(res, err, 'recipe added');
            });
        }
    };

    // Deletes the recipe with the requested recipeID
    function deleteRecipe(req, res) {
        var collection = getRecipeListCollection(req);
        var recipeID = req.params.id;

        collection.find({'_id' : recipeID}, {}, function(e, docs) {
            if (requestService.checkUser(req, docs[0].userId)) {
                collection.remove({ '_id' : recipeID }, function(err) {
                    requestService.printMsg(res, err, 'recipe deleted');
                });
            } else {
                requestService.returnUnauthorized(res);
            }
        });
    }

    // Returns all the recipes that are owned by the user with userID id
    function getRecipesForUser(req, res) {
        var collection = getRecipeListCollection(req);
        var userID = req.params.userId;

        if (requestService.checkUser(req, userID)) {
            collection.find({'userId': userID},{},function(e, docs){
                res.json({success: true, data: docs});
            })
        } else {
            requestService.returnUnauthorized(res);
        }
    };

    function getSingleRecipe(req, res) {
        var collection = getRecipeListCollection(req);

        collection.find({ '_id': req.params.id },{},function(e, docs){
            res.json({success: true, data: docs});
        })
    }

    // Updates the recipe with the passed `id` param with the
    // recipe passed in the request body
    function updateRecipe(req, res) {
        var collection = getRecipeListCollection(req);
        var recipeID = req.params.id
        var updatedRecipe = req.body;

        collection.find({'_id' : recipeID}, {}, function(e, docs) {
            if (requestService.checkUser(req, docs[0].userId)) {
                collection.update({'_id' : recipeID}, updatedRecipe, function (err) {
                    requestService.printMsg(res, err, 'recipe updated');
                });
            } else {
                requestService.returnUnauthorized(res);
            }
        });
    }

    // Returns the 'recipelist' collection from the db
    function getRecipeListCollection(req) {
        return requestService.getCollection(req, 'recipelist');
    }
};

module.exports = RecipesService;

