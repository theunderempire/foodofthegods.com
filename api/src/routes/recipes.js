import express from "express";
import multer from "multer";
import RecipesService from "../services/recipes.service.js";
import { saveUploadedImage } from "../services/thumbnail.service.js";

const router = express.Router();
const recipesService = new RecipesService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post("/upload-image", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, data: "No image file provided" });
  }
  const imageUrl = await saveUploadedImage(req.file.buffer);
  if (!imageUrl) {
    return res.status(500).json({ success: false, data: "Failed to process image" });
  }
  res.json({ success: true, data: { imageUrl } });
});

router.post("/import-url", function (req, res) {
  recipesService.importRecipeFromUrl(req, res);
});

router.post("/import-text", function (req, res) {
  recipesService.importRecipeFromText(req, res);
});

/* GET recipes listing. */
router.get("/:userId", function (req, res, _next) {
  recipesService.getRecipesForUser(req, res);
});

router.post("/", function (req, res, _next) {
  recipesService.addRecipeForUser(req, res);
});

router.delete("/:id", function (req, res, _next) {
  recipesService.deleteRecipe(req, res);
});

router.put("/:id", function (req, res, _next) {
  recipesService.updateRecipe(req, res);
});

export default router;
