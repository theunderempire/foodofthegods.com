var RequestService = function () {
  this.checkUser = checkUser;
  this.getCollection = getCollection;
  this.printMsg = printMsg;
  this.returnUnauthorized = returnUnauthorized;

  // Validates that the user making the request is the user whose informatioin
  // they are requesting
  function checkUser(req, id) {
    const match = id === req.decoded.username;
    if (!match) {
      console.warn(`[auth] checkUser failed: token user="${req.decoded.username}" resource user="${id}"`);
    }
    return match;
  }

  // Returns the recipelist collection from the DB
  function getCollection(req, collectionName) {
    return req.db.get(collectionName);
  }

  function printMsg(res, err, msg) {
    if (err !== null) {
      console.error(`[db] error: ${err}`);
    }
    var resMsg = err === null ? { msg: msg } : { msg: "error: " + err };
    res.json({ success: true, data: resMsg });
  }

  // Returns a standard unauthorized message
  function returnUnauthorized(res) {
    console.warn("[auth] returning 401 Unauthorized");
    res.status(401).json({ success: false, msg: "Unauthorized" });
  }
};

module.exports = RequestService;
