import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("auth", () => {
  test("successful login navigates to recipes", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL("/recipes");
    await expect(page.getByText("My Recipes")).toBeVisible();
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#username", "testuser");
    await page.fill("#password", "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(page.locator(".alert-error")).toBeVisible();
  });

  test("logout returns to login page", async ({ page }) => {
    await login(page);
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL("/login");
  });
});
