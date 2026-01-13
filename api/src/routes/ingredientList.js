var express = require("express");
var router = express.Router();
var IngredientService = require("../services/ingredients.service");
var ingredientService = new IngredientService();

/* GET ingredient list */
router.get("/:userId", function (req, res, next) {
  ingredientService.getIngredientListForUser(req, res);
});

router.post("/:userId", function (req, res, next) {
  ingredientService.addOrUpdateIngredient(req, res);
});

router.post("/:userId/group", async function (req, res) {
  await ingredientService.groupIngredientList(req, res);
});

module.exports = router;
