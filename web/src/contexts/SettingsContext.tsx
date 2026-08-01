import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSettings } from "../api/settings";
import { useAuth } from "./AuthContext";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

interface SettingsContextValue {
  hasGeminiKey: boolean;
  geminiModel: string;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [geminiModel, setGeminiModel] = useState(DEFAULT_GEMINI_MODEL);

  const refreshSettings = useCallback(async () => {
    if (!isAuthenticated) {
      setHasGeminiKey(false);
      setGeminiModel(DEFAULT_GEMINI_MODEL);
      return;
    }
    try {
      const settings = await getSettings();
      setHasGeminiKey(settings.hasGeminiKey);
      setGeminiModel(settings.geminiModel ?? DEFAULT_GEMINI_MODEL);
    } catch {
      setHasGeminiKey(false);
      setGeminiModel(DEFAULT_GEMINI_MODEL);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ hasGeminiKey, geminiModel, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
