var express = require('express');
var router = express.Router();
var ObjectId = require('mongodb').ObjectID;
var RecipesService = require('../services/recipes.service');
var recipesService = new RecipesService();

/* GET recipes listing. */
router.get('/:id', function (req, res, next) {
  recipesService.getSingleRecipe(req, res);
});

module.exports = router;

