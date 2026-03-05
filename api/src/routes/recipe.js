import express from "express";
import RecipesService from "../services/recipes.service.js";
const router = express.Router();
const recipesService = new RecipesService();

/* GET recipes listing. */
router.get("/:id", function (req, res, _next) {
  recipesService.getSingleRecipe(req, res);
});

export default router;
