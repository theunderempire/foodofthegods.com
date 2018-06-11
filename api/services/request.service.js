var RequestService = function () {
    this.checkUser = checkUser;
    this.getCollection = getCollection;
    this.printMsg = printMsg;
    this.returnUnauthorized = returnUnauthorized;

    // Validates that the user making the request is the user whose informatioin
    // they are requesting
    function checkUser(req, id) {
        return id === req.decoded.username;
    }

    // Returns the recipelist collection from the DB
    function getCollection(req, collectionName) {
        return req.db.get(collectionName);
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

module.exports = RequestService;

