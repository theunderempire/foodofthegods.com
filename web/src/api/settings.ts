import { client } from "./client";

export interface Settings {
  geminiApiKey: string | null;
  geminiModel: string | null;
}

export async function getSettings(): Promise<Settings> {
  const res = await client.get<Settings>("/users/settings");
  return res.data;
}

export async function saveSettings(payload: Partial<Settings>): Promise<void> {
  await client.put("/users/settings", payload);
}
