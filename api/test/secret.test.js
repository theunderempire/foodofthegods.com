import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { assertStrongJwtSecret, MIN_JWT_SECRET_LENGTH } from "../src/secret.js";

describe("assertStrongJwtSecret", () => {
  test("accepts a 32-byte random hex secret", () => {
    const strong = crypto.randomBytes(32).toString("hex");
    assert.doesNotThrow(() => assertStrongJwtSecret(strong));
  });

  test("accepts a value exactly at the minimum length", () => {
    assert.doesNotThrow(() => assertStrongJwtSecret("a".repeat(MIN_JWT_SECRET_LENGTH)));
  });

  test("rejects the dictionary-word default that shipped in .env", () => {
    assert.throws(() => assertStrongJwtSecret("secret"), /at least 32 characters/);
  });

  test("rejects a value one character under the minimum", () => {
    assert.throws(() => assertStrongJwtSecret("a".repeat(MIN_JWT_SECRET_LENGTH - 1)));
  });

  test("rejects an unset secret rather than signing with undefined", () => {
    assert.throws(() => assertStrongJwtSecret(undefined), /not set/);
  });

  test("error message tells the operator how to generate one", () => {
    assert.throws(() => assertStrongJwtSecret(""), /randomBytes\(32\)/);
  });
});
