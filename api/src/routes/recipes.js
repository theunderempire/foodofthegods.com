var express = require("express");
var router = express.Router();
var RecipesService = require("../services/recipes.service");
var recipesService = new RecipesService();

/* GET recipes listing. */
router.get("/:userId", function (req, res, next) {
  recipesService.getRecipesForUser(req, res);
});

router.post("/", function (req, res, next) {
  recipesService.addRecipeForUser(req, res);
});

router.delete("/:id", function (req, res, next) {
  recipesService.deleteRecipe(req, res);
});

router.put("/:id", function (req, res, next) {
  recipesService.updateRecipe(req, res);
});

module.exports = router;
