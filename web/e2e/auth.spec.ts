import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("auth", () => {
  test("successful login navigates to recipes", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL("recipes");
    await expect(page.getByText("My Recipes")).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("login");
    await page.fill("#username", "testuser");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.locator(".alert-error")).toBeVisible();
  });

  test("logout returns to login page", async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL("login");
  });

  test("a reload mid-session continues the session", async ({ page }) => {
    await login(page);

    // The session must survive on the auth cookie alone — before the refresh
    // endpoint existed, a reload silently downgraded the sliding session to a
    // fixed 60-minute logout, and losing localStorage broke expiry entirely.
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(page).toHaveURL("recipes");
    await expect(page.getByText("My Recipes")).toBeVisible();
  });

  test("an expired session bounces to login and resumes where the user was", async ({ page }) => {
    await login(page);
    await page.goto("ingredients");
    await expect(page.getByRole("heading", { name: "Shopping List" })).toBeVisible();

    // Kill the auth cookie to simulate the token lapsing while on a deep page.
    await page.context().clearCookies();
    await page.reload();

    await expect(page).toHaveURL("login");
    await page.fill("#username", "testuser");
    await page.fill("#password", "testpassword");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("ingredients");
    await expect(page.getByRole("heading", { name: "Shopping List" })).toBeVisible();
  });
});
