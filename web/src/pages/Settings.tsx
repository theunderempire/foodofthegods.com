import { useState } from "react";
import { saveSettings } from "../api/settings";
import { showSuccessToast } from "../components/ToastContainer";
import { DEFAULT_GEMINI_MODEL, useSettings } from "../contexts/SettingsContext";

const GEMINI_MODELS = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (free tier)" },
  { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
];

export function Settings() {
  const { hasGeminiKey, geminiModel, refreshSettings } = useSettings();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

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
    await saveSettings({ geminiModel: e.target.value });
    await refreshSettings();
    showSuccessToast("Model saved.");
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
          {hasGeminiKey && (
            <div className="form-group">
              <label htmlFor="geminiModel">Model</label>
              <select
                id="geminiModel"
                className="input"
                value={geminiModel || DEFAULT_GEMINI_MODEL}
                onChange={handleModelChange}
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
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
