var express = require("express");
var router = express.Router();
var IngredientService = require("../services/ingredients.service");
var ingredientService = new IngredientService();

/* GET ingredient list */
router.get("/:userId", function (req, res) {
  ingredientService.getIngredientListForUser(req, res);
});

router.post("/:userId", function (req, res) {
  ingredientService.addIngredient(req, res);
});

router.post("/:userId/many", function (req, res) {
  ingredientService.addManyIngredients(req, res);
});

router.patch("/:userId", function (req, res) {
  ingredientService.updateIngredient(req, res);
});

router.delete("/:userId/:groupName/:itemId", function (req, res) {
  ingredientService.removeIngredient(req, res);
});

router.delete("/:userId/all", function (req, res) {
  ingredientService.removeAllIngredients(req, res);
});

router.delete("/:userId/marked", function (req, res) {
  ingredientService.removeMarkedIngredients(req, res);
});

router.get("/:userId/group", async function (req, res) {
  await ingredientService.groupIngredientList(req, res);
});

module.exports = router;
