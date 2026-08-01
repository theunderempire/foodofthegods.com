import { test, expect } from "@playwright/test";

// Sign in via the login form without assuming where we land afterwards
// (the shared login helper waits for /recipes, which the deeplink flow skips).
async function submitLogin(page: import("@playwright/test").Page) {
  await page.fill("#username", "testuser");
  await page.fill("#password", "testpassword");
  await page.click('button[type="submit"]');
}

test.describe("deeplink resume", () => {
  test("returns to the intended protected page after logging in", async ({ page }) => {
    // Hit a protected deeplink while logged out — distinct from the default
    // /recipes landing, so reaching it proves the resume actually happened.
    await page.goto("ingredients");
    await expect(page).toHaveURL("login");

    await submitLogin(page);

    await expect(page).toHaveURL("ingredients");
    await expect(page.getByRole("heading", { name: "Shopping List" })).toBeVisible();
  });

  test("preserves the query string of the intended page", async ({ page }) => {
    await page.goto("ingredients?highlight=eggs");
    await expect(page).toHaveURL("login");

    await submitLogin(page);

    await expect(page).toHaveURL("ingredients?highlight=eggs");
  });

  test("falls back to /recipes when there is no stored deeplink", async ({ page }) => {
    await page.goto("login");
    await submitLogin(page);

    await expect(page).toHaveURL("recipes");
  });

  test("does not loop back to login when visiting /login directly", async ({ page }) => {
    // Visiting /login itself must never be stored as a return target.
    await page.goto("login");
    await submitLogin(page);

    await expect(page).toHaveURL("recipes");
    await expect(page).not.toHaveURL("login");
  });
});
