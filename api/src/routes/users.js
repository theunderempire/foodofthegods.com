import express from "express";
const router = express.Router();

export async function handleGetSettings(req, res) {
  const userCollection = req.db.get("users");
  try {
    const user = await userCollection.findOne({ username: req.decoded.username });
    res.json({ geminiApiKey: user?.geminiApiKey ?? null, geminiModel: user?.geminiModel ?? null });
  } catch {
    res.json({ geminiApiKey: null, geminiModel: null });
  }
}

export async function handlePutSettings(req, res) {
  const userCollection = req.db.get("users");
  const { geminiApiKey, geminiModel } = req.body;
  const update = {};
  if (geminiApiKey !== undefined) update.geminiApiKey = geminiApiKey;
  if (geminiModel !== undefined) update.geminiModel = geminiModel;
  try {
    await userCollection.update({ username: req.decoded.username }, { $set: update });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, data: err.message });
  }
}

router.get("/settings", handleGetSettings);
router.put("/settings", handlePutSettings);

export default router;
