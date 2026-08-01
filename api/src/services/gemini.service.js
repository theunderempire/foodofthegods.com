export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function buildGeminiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// Each user brings their own Gemini key, so credentials come from the user
// document rather than the environment.
export async function getGeminiConfig(req) {
  const user = await req.db.get("users").findOne({ username: req.decoded.username });
  const model = user?.geminiModel || DEFAULT_GEMINI_MODEL;
  return { apiKey: user?.geminiApiKey ?? null, model, url: buildGeminiUrl(model) };
}

// Returns the raw Response rather than interpreting it: the two callers need
// different failure policies (recipe import retries transient errors; list
// grouping maps 429 to its own message and must clear its lock).
export function requestGemini({ url, apiKey, prompt, generationConfig }) {
  return fetch(url, {
    method: "POST",
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(generationConfig ? { generationConfig } : {}),
    }),
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });
}

// Either the model's text, or the best available explanation of why there is
// none — the reason can arrive in any of several unrelated fields.
export function extractCandidateText(responseBody) {
  const text = responseBody?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return { text };

  return {
    reason:
      responseBody?.error?.message ||
      responseBody?.promptFeedback?.blockReason ||
      responseBody?.candidates?.[0]?.finishReason ||
      "no content returned",
  };
}

// Models wrap JSON in markdown fences and surrounding prose despite being told
// not to, and occasionally emit trailing or missing commas. The recipe-import
// path had grown repairs for the comma cases that the list-grouping path never
// got; sharing this gives both the stronger handling.
export function parseJsonLoosely(rawText, shape = "object") {
  try {
    return JSON.parse(rawText.trim());
  } catch {
    // Fall through to fence-stripping and repair.
  }

  let json = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const outermost = shape === "array" ? json.match(/\[[\s\S]*\]/) : json.match(/\{[\s\S]*\}/);
  if (outermost) json = outermost[0];

  json = json
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/\}(\s*)\{/g, "},$1{")
    .replace(/\](\s*)\{/g, "],$1{");

  return JSON.parse(json);
}
