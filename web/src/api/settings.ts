import { client } from "./client";

export async function getSettings(): Promise<{ geminiApiKey: string | null }> {
  const res = await client.get<{ geminiApiKey: string | null }>("/users/settings");
  return res.data;
}

export async function saveSettings(geminiApiKey: string): Promise<void> {
  await client.put("/users/settings", { geminiApiKey });
}
