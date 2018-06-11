var RequestService = require('./request.service');
var requestService = new RequestService();

var IngredientService = function () {
    this.addOrUpdateIngredient = addOrUpdateIngredient;
    this.getIngredientListForUser = getIngredientListForUser;

    // Updates the list for the user with the passed id with the request body
    function addOrUpdateIngredient(req, res) {
        var id = req.params.userId;
        var collection = getIngredientListCollection(req);

        if (requestService.checkUser(req, id)) {
            collection.update(
                {"userId" : id},
                {
                    "userId" : id,
                    "ingredientList" : req.body.ingredientList,
                    "completedList" : req.body.completedList
                },
                { 'upsert' : true },
                function(err, result){
                    requestService.printMsg(res, err, 'list updated');
                }
            );
        } else {
            requestService.returnUnauthorized(res);
        }
    }

    // Returns the ingredient list for a specific user
    function getIngredientListForUser(req, res) {
        var id = req.params.userId;
        var collection = getIngredientListCollection(req);

        if (requestService.checkUser(req, id)) {
            collection.find({"userId" : id},{},function(e, docs){
                res.json({success: true, data: docs});
            });
        } else {
            requestService.returnUnauthorized(res);
        }
    }

    // Returns the 'recipelist' collection from the db
    function getIngredientListCollection(req) {
        return requestService.getCollection(req, 'ingredientlist');
    }
};

module.exports = IngredientService;

