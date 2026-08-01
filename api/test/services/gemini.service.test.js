import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GEMINI_MODEL,
  buildGeminiUrl,
  getGeminiConfig,
  requestGemini,
  extractCandidateText,
  parseJsonLoosely,
} from "../../src/services/gemini.service.js";
import { makeReq, makeCollection } from "../helpers/mocks.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("buildGeminiUrl", () => {
  test("targets generateContent for the given model", () => {
    assert.equal(
      buildGeminiUrl("gemini-2.5-pro"),
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
    );
  });
});

describe("getGeminiConfig", () => {
  function reqWithUser(user) {
    return makeReq({
      username: "user-1",
      collections: { users: makeCollection({ findOne: () => Promise.resolve(user) }) },
    });
  }

  test("reads the key and model from the caller's own user record", async () => {
    const config = await getGeminiConfig(
      reqWithUser({ geminiApiKey: "user-key", geminiModel: "gemini-2.5-pro" }),
    );

    assert.equal(config.apiKey, "user-key");
    assert.equal(config.model, "gemini-2.5-pro");
    assert.match(config.url, /gemini-2\.5-pro:generateContent$/);
  });

  test("falls back to the default model when the user has not chosen one", async () => {
    const config = await getGeminiConfig(reqWithUser({ geminiApiKey: "user-key" }));

    assert.equal(config.model, DEFAULT_GEMINI_MODEL);
  });

  test("reports a null key rather than throwing when none is configured", async () => {
    assert.equal((await getGeminiConfig(reqWithUser({}))).apiKey, null);
    assert.equal((await getGeminiConfig(reqWithUser(null))).apiKey, null);
  });

  test("looks the user up by the username on the verified token", async () => {
    let query = null;
    const req = makeReq({
      username: "user-1",
      collections: {
        users: makeCollection({
          findOne: (q) => {
            query = q;
            return Promise.resolve({ geminiApiKey: "k" });
          },
        }),
      },
    });

    await getGeminiConfig(req);

    assert.deepEqual(query, { username: "user-1" });
  });
});

describe("requestGemini", () => {
  test("posts the prompt with the key in the header, not the query string", async () => {
    let seen = null;
    globalThis.fetch = async (url, options) => {
      seen = { url, options };
      return { ok: true };
    };

    await requestGemini({ url: "https://gemini.test/x", apiKey: "secret-key", prompt: "hello" });

    assert.equal(seen.url, "https://gemini.test/x");
    assert.equal(seen.options.method, "POST");
    assert.equal(seen.options.headers["x-goog-api-key"], "secret-key");
    assert.equal(seen.options.headers["Content-Type"], "application/json");
    assert.equal(JSON.parse(seen.options.body).contents[0].parts[0].text, "hello");
  });

  test("omits generationConfig when the caller does not ask for one", async () => {
    let body = null;
    globalThis.fetch = async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true };
    };

    await requestGemini({ url: "https://gemini.test/x", apiKey: "k", prompt: "p" });

    assert.equal("generationConfig" in body, false);
  });

  test("passes generationConfig through when given", async () => {
    let body = null;
    globalThis.fetch = async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true };
    };

    await requestGemini({
      url: "https://gemini.test/x",
      apiKey: "k",
      prompt: "p",
      generationConfig: { responseMimeType: "application/json" },
    });

    assert.equal(body.generationConfig.responseMimeType, "application/json");
  });
});

describe("extractCandidateText", () => {
  test("returns the model's text when present", () => {
    const body = { candidates: [{ content: { parts: [{ text: "hi" }] } }] };

    assert.deepEqual(extractCandidateText(body), { text: "hi" });
  });

  // The explanation for an empty response arrives in one of several unrelated
  // fields depending on why it was empty.
  test("prefers an explicit API error message", () => {
    const body = { error: { message: "quota exceeded" }, promptFeedback: { blockReason: "OTHER" } };

    assert.equal(extractCandidateText(body).reason, "quota exceeded");
  });

  test("falls back to a safety block reason", () => {
    assert.equal(
      extractCandidateText({ promptFeedback: { blockReason: "SAFETY" } }).reason,
      "SAFETY",
    );
  });

  test("falls back to the candidate's finish reason", () => {
    const body = { candidates: [{ finishReason: "MAX_TOKENS" }] };

    assert.equal(extractCandidateText(body).reason, "MAX_TOKENS");
  });

  test("always gives some reason, even for an empty body", () => {
    assert.equal(extractCandidateText({}).reason, "no content returned");
    assert.equal(extractCandidateText(undefined).reason, "no content returned");
  });
});

// These repairs previously existed only on the recipe-import path; sharing them
// means the list-grouping path gets them too.
describe("parseJsonLoosely", () => {
  test("parses clean JSON unchanged", () => {
    assert.deepEqual(parseJsonLoosely('{"a":1}'), { a: 1 });
    assert.deepEqual(parseJsonLoosely('[{"a":1}]', "array"), [{ a: 1 }]);
  });

  test("strips markdown fencing", () => {
    assert.deepEqual(parseJsonLoosely('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseJsonLoosely('```JSON\n[{"a":1}]\n```', "array"), [{ a: 1 }]);
  });

  test("ignores prose around the payload", () => {
    assert.deepEqual(parseJsonLoosely('Sure! Here you go:\n{"a":1}\nHope that helps.'), { a: 1 });
    assert.deepEqual(parseJsonLoosely('Here:\n[{"a":1}]\ndone', "array"), [{ a: 1 }]);
  });

  test("repairs trailing commas", () => {
    assert.deepEqual(parseJsonLoosely('{"a":1,}'), { a: 1 });
    assert.deepEqual(parseJsonLoosely('[{"a":1},]', "array"), [{ a: 1 }]);
  });

  test("repairs a missing comma between adjacent objects", () => {
    assert.deepEqual(parseJsonLoosely('[{"a":1}{"a":2}]', "array"), [{ a: 1 }, { a: 2 }]);
  });

  test("does not corrupt braces that appear inside string values", () => {
    assert.deepEqual(parseJsonLoosely('{"note":"use }{ carefully"}'), { note: "use }{ carefully" });
  });

  test("throws when there is no JSON to recover", () => {
    assert.throws(() => parseJsonLoosely("I could not do that"));
  });
});
