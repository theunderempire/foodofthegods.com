import express from "express";
import RecipesService from "../services/recipes.service.js";
const router = express.Router();
const recipesService = new RecipesService();

router.post("/import-url", function (req, res) {
  recipesService.importRecipeFromUrl(req, res);
});

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

export default router;
