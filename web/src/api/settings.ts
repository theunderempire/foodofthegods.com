import { client } from "./client";

export async function getSettings(): Promise<{
  geminiApiKey: string | null;
  geminiModel: string | null;
}> {
  const res = await client.get<{ geminiApiKey: string | null; geminiModel: string | null }>(
    "/users/settings",
  );
  return res.data;
}

export async function saveSettings(payload: {
  geminiApiKey?: string | null;
  geminiModel?: string | null;
}): Promise<void> {
  await client.put("/users/settings", payload);
}

export async function getGeminiModels(): Promise<{ value: string; label: string }[]> {
  const res = await client.get<{
    success: boolean;
    data: { value: string; label: string }[] | string;
  }>("/users/gemini-models");
  if (!res.data.success || !Array.isArray(res.data.data)) return [];
  return res.data.data;
}
