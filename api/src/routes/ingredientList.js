import express from "express";
import IngredientService from "../services/ingredients.service.js";
import { subscribe, unsubscribe } from "../services/sse.js";
const router = express.Router();
const ingredientService = new IngredientService();

router.get("/:userId/stream", function (req, res) {
  if (req.decoded.username !== req.params.userId)
    return res.status(401).json({ success: false, msg: "Unauthorized" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  subscribe(req.params.userId, res);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 30_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe(req.params.userId, res);
  });
});

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

export default router;
