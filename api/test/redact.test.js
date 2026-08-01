import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { redactQueryToken } from "../src/redact.js";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VybmFtZSI6ImFiYyJ9.c2lnbmF0dXJl";

describe("redactQueryToken", () => {
  test("redacts the token the SSE stream passes in the query string", () => {
    const result = redactQueryToken(`/ingredientList/user-1/stream?token=${JWT}`);

    assert.ok(!result.includes(JWT), "the token must not survive into the log line");
    assert.equal(result, "/ingredientList/user-1/stream?token=[redacted]");
  });

  test("redacts a token that is not the first query parameter", () => {
    const result = redactQueryToken(`/stream?foo=bar&token=${JWT}`);

    assert.equal(result, "/stream?foo=bar&token=[redacted]");
  });

  test("keeps parameters that follow the token", () => {
    const result = redactQueryToken(`/stream?token=${JWT}&retry=1`);

    assert.equal(result, "/stream?token=[redacted]&retry=1");
  });

  test("redacts access_token as well", () => {
    assert.equal(redactQueryToken(`/x?access_token=${JWT}`), "/x?access_token=[redacted]");
  });

  test("is case-insensitive on the parameter name", () => {
    assert.equal(redactQueryToken(`/x?Token=${JWT}`), "/x?Token=[redacted]");
  });

  test("leaves URLs without a token untouched", () => {
    assert.equal(redactQueryToken("/recipes/user-1?sort=name"), "/recipes/user-1?sort=name");
  });

  test("does not redact a parameter that merely ends in token", () => {
    assert.equal(redactQueryToken("/x?csrftoken=abc"), "/x?csrftoken=abc");
  });
});
