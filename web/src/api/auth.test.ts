import { describe, expect, test } from "vitest";
import { getUserIdFromToken } from "./auth";

function makeToken(payload: object): string {
  const base64url = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${base64url}.signature`;
}

describe("getUserIdFromToken", () => {
  test("extracts the username from a base64url payload", () => {
    expect(getUserIdFromToken(makeToken({ username: "abc123" }))).toBe("abc123");
  });

  // A real JWT payload is base64url with the `=` padding stripped. atob follows
  // the WHATWG forgiving-base64 algorithm, which restores the padding itself, and
  // base64 of any byte string is only ever 0, 2, or 3 chars past a multiple of
  // four — never 1, the single length atob rejects. So every username length is
  // decodable. This sweep pins that, since the unpadded input looks like a
  // plausible place for someone to "helpfully" add padding logic later.
  test("decodes payloads of every length past a multiple of four", () => {
    for (let length = 1; length <= 40; length++) {
      const username = "a".repeat(length);
      expect(getUserIdFromToken(makeToken({ username }))).toBe(username);
    }
  });

  test("handles payloads containing base64url-specific characters", () => {
    // '?' and '~' in the JSON push the encoding into - and _ substitutions.
    const username = "user?name~with/chars+here";
    expect(getUserIdFromToken(makeToken({ username }))).toBe(username);
  });

  test("decodes a payload carrying extra claims alongside username", () => {
    const token = makeToken({ username: "someone", iat: 1770000000, exp: 1770086400 });
    expect(getUserIdFromToken(token)).toBe("someone");
  });
});
