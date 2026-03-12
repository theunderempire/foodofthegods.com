import { useState } from "react";
import { saveSettings } from "../api/settings";
import { useSettings } from "../contexts/SettingsContext";

export function Settings() {
  const { hasGeminiKey, refreshSettings } = useSettings();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveSettings(apiKey.trim());
      await refreshSettings();
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
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
            <button type="submit" className="btn btn-primary" disabled={saving || !apiKey.trim()}>
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-success">API key saved.</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
