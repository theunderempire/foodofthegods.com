var RecipesService = function () {
    this.getRecipesForUser = function (userID, req, res) {
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
    };

    function getCollection(db) {
        return db.get('recipelist');
    }

    function getDB(req) {
        return req.db;
    }

    function returnUnauthorized() {
        res.status(401).json({success: false});
    }
};

module.exports = RecipesService;

