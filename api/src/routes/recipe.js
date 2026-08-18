import express from "express";
import RecipesService from "../services/recipes.service.js";
const router = express.Router();
const recipesService = new RecipesService();

/* GET recipes listing. */
router.get("/:id", function (req, res, _next) {
  recipesService.getSingleRecipe(req, res);
});

/* GET server-rendered share preview (Open Graph / Twitter Card / JSON-LD) for
   social crawlers. The reverse proxy rewrites crawler requests for the SPA's
   /recipes/:shareId/share route here — see docs/social-share-previews.md. */
router.get("/:id/share", function (req, res, _next) {
  recipesService.getRecipeSharePreview(req, res);
});

export default router;
