import { useEffect, useState } from "react";
import { getGeminiModels, saveSettings } from "../api/settings";
import { showSuccessToast } from "../components/ToastContainer";
import { DEFAULT_GEMINI_MODEL, useSettings } from "../contexts/SettingsContext";

// Known free-tier model IDs — used to annotate labels from the API
const FREE_TIER_MODELS = new Set(["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"]);

export function Settings() {
  const { hasGeminiKey, geminiModel, refreshSettings } = useSettings();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (!hasGeminiKey) {
      setAvailableModels([]);
      return;
    }
    setLoadingModels(true);
    getGeminiModels()
      .then((models) => setAvailableModels(models))
      .finally(() => setLoadingModels(false));
  }, [hasGeminiKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await saveSettings({ geminiApiKey: apiKey.trim() });
      await refreshSettings();
      setApiKey("");
      showSuccessToast("API key saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await saveSettings({ geminiApiKey: null });
      await refreshSettings();
      showSuccessToast("API key removed.");
    } finally {
      setRemoving(false);
    }
  }

  async function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const model = e.target.value;
    await saveSettings({ geminiModel: model });
    await refreshSettings();
    showSuccessToast("Model saved.");
  }

  function modelLabel(value: string, label: string) {
    return FREE_TIER_MODELS.has(value) ? `${label} (free tier)` : label;
  }

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <section className="form-section">
        <h2 className="form-section-title">AI Import</h2>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="geminiApiKey">
              Gemini API Key{" "}
              <a
                href="https://ai.google.dev/gemini-api/docs/api-key"
                target="_blank"
                rel="noopener noreferrer"
                className="link-subtle"
              >
                (how to get one)
              </a>
            </label>
            <input
              id="geminiApiKey"
              type="password"
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasGeminiKey ? "••••••••" : "Enter your Gemini API key"}
            />
          </div>
          {hasGeminiKey && availableModels.length > 0 && (
            <div className="form-group">
              <label htmlFor="geminiModel">Model</label>
              <select
                id="geminiModel"
                className="input"
                value={geminiModel || DEFAULT_GEMINI_MODEL}
                onChange={handleModelChange}
                disabled={loadingModels}
              >
                {availableModels.map((m) => (
                  <option key={m.value} value={m.value}>
                    {modelLabel(m.value, m.label)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-footer">
            {hasGeminiKey && (
              <button
                type="button"
                className="btn btn-ghost btn-danger-text"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? "Removing..." : "Remove key"}
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving || !apiKey.trim()}>
              {saving ? "Saving..." : hasGeminiKey ? "Update key" : "Save"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
