import { client } from "./client";

// Read and write shapes differ deliberately: the API reports only whether a key
// is set, while writing takes the key itself.
export interface Settings {
  hasGeminiKey: boolean;
  geminiModel: string | null;
}

export interface SettingsUpdate {
  geminiApiKey?: string | null;
  geminiModel?: string | null;
}

export async function getSettings(): Promise<Settings> {
  const res = await client.get<Settings>("/users/settings");
  return res.data;
}

export async function saveSettings(payload: SettingsUpdate): Promise<void> {
  await client.put("/users/settings", payload);
}
