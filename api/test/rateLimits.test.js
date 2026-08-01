import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveLimit, createLimiters } from "../src/rateLimits.js";

describe("resolveLimit", () => {
  test("uses the production value in production", () => {
    assert.equal(
      resolveLimit({ isProduction: true, production: 30, development: 2000 }),
      30,
      "brute-force protection is the point of the feature in production",
    );
  });

  // A production-tight limit makes the e2e suite fail on its own logins: a full run
  // spends most of a 30-per-15-minutes budget, and a second run inside the window
  // cannot authenticate at all.
  test("uses the relaxed value outside production", () => {
    assert.equal(resolveLimit({ isProduction: false, production: 30, development: 2000 }), 2000);
  });

  test("an explicit override wins in either environment", () => {
    assert.equal(
      resolveLimit({ override: "5", isProduction: true, production: 30, development: 2000 }),
      5,
    );
    assert.equal(
      resolveLimit({ override: "5", isProduction: false, production: 30, development: 2000 }),
      5,
    );
  });

  for (const override of [undefined, "", "abc", "0", "-1", "1.5", "NaN"]) {
    test(`ignores a non-positive-integer override (${JSON.stringify(override)})`, () => {
      assert.equal(
        resolveLimit({ override, isProduction: true, production: 30, development: 2000 }),
        30,
        "a malformed override must not silently disable the limit",
      );
    });
  }
});

describe("createLimiters", () => {
  test("is strict in production", () => {
    const { limits } = createLimiters({ NODE_ENV: "production" });

    assert.equal(limits.authLimit, 30);
    assert.equal(limits.publicRecipeLimit, 300);
  });

  test("is permissive in development so the test suite can run repeatedly", () => {
    const { limits } = createLimiters({ NODE_ENV: "development" });

    assert.ok(limits.authLimit >= 1000, `auth limit ${limits.authLimit} is too low for e2e`);
    assert.ok(limits.publicRecipeLimit >= 1000);
  });

  test("treats an unset NODE_ENV as non-production", () => {
    assert.ok(createLimiters({}).limits.authLimit >= 1000);
  });

  test("honours per-limit overrides", () => {
    const { limits } = createLimiters({
      NODE_ENV: "production",
      AUTH_RATE_LIMIT: "7",
      PUBLIC_RECIPE_RATE_LIMIT: "99",
    });

    assert.equal(limits.authLimit, 7);
    assert.equal(limits.publicRecipeLimit, 99);
  });

  test("returns usable middleware", () => {
    const { authLimiter, publicRecipeLimiter } = createLimiters({ NODE_ENV: "production" });

    assert.equal(typeof authLimiter, "function");
    assert.equal(typeof publicRecipeLimiter, "function");
  });
});
