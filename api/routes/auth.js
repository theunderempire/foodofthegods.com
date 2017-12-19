var express = require('express');
var router = express.Router();

router.post('/', function(req, res, next) {
    var enteredCode = req.body.code;

    res.send({result: enteredCode === '0607'}); 
});

module.exports = router;
