import { useState } from "react";
import { saveSettings } from "../api/settings";
import { showSuccessToast } from "../components/ToastContainer";
import { useSettings } from "../contexts/SettingsContext";

export function Settings() {
  const { hasGeminiKey, refreshSettings } = useSettings();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await saveSettings(apiKey.trim());
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
      await saveSettings(null);
      await refreshSettings();
      showSuccessToast("API key removed.");
    } finally {
      setRemoving(false);
    }
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
            <label htmlFor="geminiApiKey">Gemini API Key</label>
            <input
              id="geminiApiKey"
              type="password"
              className="input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasGeminiKey ? "••••••••" : "Enter your Gemini API key"}
            />
          </div>
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
