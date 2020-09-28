var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  var title = process.env.NODE_ENV === 'development'
    ? 'dev server running'
    : 'Recipe action, if you know how';
  res.render('index', { title: title });
});

module.exports = router;
