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

export async function handleGetGeminiModels(req, res) {
  const userCollection = req.db.get("users");
  try {
    const user = await userCollection.findOne({ username: req.decoded.username });
    const apiKey = user?.geminiApiKey;
    if (!apiKey) {
      return res.json({ success: false, data: "No API key configured" });
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    const data = await response.json();
    const models = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({ value: m.name.replace("models/", ""), label: m.displayName }));
    res.json({ success: true, data: models });
  } catch (err) {
    res.json({ success: false, data: err.message });
  }
}

router.get("/settings", handleGetSettings);
router.put("/settings", handlePutSettings);
router.get("/gemini-models", handleGetGeminiModels);

export default router;
