import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSettings } from "../api/settings";
import { useAuth } from "./AuthContext";

interface SettingsContextValue {
  hasGeminiKey: boolean;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [hasGeminiKey, setHasGeminiKey] = useState(false);

  const refreshSettings = useCallback(async () => {
    if (!isAuthenticated) {
      setHasGeminiKey(false);
      return;
    }
    try {
      const settings = await getSettings();
      setHasGeminiKey(!!settings.geminiApiKey);
    } catch {
      setHasGeminiKey(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ hasGeminiKey, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
