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
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);

    if (req.body.userId === req.decoded.username) {
      recipeCollection.insert(req.body, function (err, result) {
        userCollection.update({ "username": req.decoded.username }, { $push: { recipeList: result._id } });
        requestService.printMsg(res, err, 'recipe added');
      });
    }
  };

  // Deletes the recipe with the requested recipeID
  function deleteRecipe(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);
    var recipeID = req.params.id;

    recipeCollection.find({ '_id': recipeID }, {}, function (e, docs) {
      // Remove from recipeList
      userCollection.update({ "username": req.decoded.username }, { $pull: { recipeList: recipeID } }, function (e, result) {
        userCollection.find({ recipeList: recipeID }, { "_id": 1 }, function (e, usersWithRecipe) {
          // If the recipe is no longer in anyone's list, delete it
          if (!usersWithRecipe.length) {
            recipeCollection.remove({ '_id': recipeID }, function (err) { });
          }
        });
      });

      requestService.printMsg(res, e, 'recipe deleted');
    });
  }

  // Returns all the recipes that are owned by the user with userID id
  function getRecipesForUser(req, res) {
    var recipeCollection = getRecipeListCollection(req);
    var userCollection = getUserCollection(req);
    var userID = req.params.userId;

    if (requestService.checkUser(req, userID)) {
      userCollection.find({ "username": userID }, { recipeList: 1 }, function (e, recipeIDs) {
        recipeCollection.find({ "_id": { $in: recipeIDs[0].recipeList } }, { 'name': 1, 'prepDuration': 1, 'cookDuration': 1 }, function (e, recipes) {
          res.json({ success: true, data: recipes });
        });
      });
    } else {
      requestService.returnUnauthorized(res);
    }
  };

  function getSingleRecipe(req, res) {
    var collection = getRecipeListCollection(req);

    collection.find({ '_id': req.params.id }, {}, function (e, docs) {
      res.json({ success: true, data: docs });
    })
  }

  // Updates the recipe with the passed `id` param with the
  // recipe passed in the request body
  function updateRecipe(req, res) {
    var collection = getRecipeListCollection(req);
    var recipeID = req.params.id
    var updatedRecipe = req.body;

    collection.find({ '_id': recipeID }, {}, function (e, docs) {
      if (requestService.checkUser(req, docs[0].userId)) {
        collection.update({ '_id': recipeID }, updatedRecipe, function (err) {
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

  // Returns the user collection
  function getUserCollection(req) {
    return requestService.getCollection(req, 'users');
  }
};

module.exports = RecipesService;

