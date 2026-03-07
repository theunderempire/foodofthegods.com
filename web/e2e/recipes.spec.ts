import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("recipes", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("recipe list shows seed recipe", async ({ page }) => {
    await expect(
      page.locator(".recipe-card-title", { hasText: "Test" }),
    ).toBeVisible();
  });

  test("view single recipe shows details", async ({ page }) => {
    await page.locator(".recipe-card-link", { hasText: "Test" }).click();
    await expect(page).toHaveURL(/\/recipes\/recipe\//);
    await expect(page.getByRole("heading", { name: "Test" })).toBeVisible();
  });

  test("create, edit, and delete a recipe", async ({ page }) => {
    // Create
    await page.click('button:has-text("+ New Recipe")');
    await expect(page).toHaveURL("/recipes/add");

    await page.fill("#name", "E2E Test Recipe");
    await page.fill("#prepDuration", "5 min");
    await page.fill("#cookDuration", "10 min");
    await page.fill("#servings", "2");
    await page.locator(".input-amount").first().fill("2");
    await page.locator(".input-name").first().fill("flour");
    await page.locator("textarea").first().fill("Mix everything.");

    await page.click('button:has-text("Create Recipe")');
    await expect(page).toHaveURL("/recipes");
    await expect(
      page.locator(".recipe-card-title", { hasText: "E2E Test Recipe" }),
    ).toBeVisible();

    // Edit
    const card = page.locator(".recipe-card", {
      has: page.locator(".recipe-card-title", { hasText: "E2E Test Recipe" }),
    });
    await card.hover();
    await card.locator('button:has-text("Edit")').click();
    await expect(page).toHaveURL(/\/recipes\/edit\//);

    await page.fill("#name", "");
    await page.fill("#name", "E2E Test Recipe (edited)");
    await page.click('button:has-text("Save Changes")');
    await expect(page).toHaveURL("/recipes");
    await expect(
      page.locator(".recipe-card-title", {
        hasText: "E2E Test Recipe (edited)",
      }),
    ).toBeVisible();

    // Delete
    const editedCard = page.locator(".recipe-card", {
      has: page.locator(".recipe-card-title", {
        hasText: "E2E Test Recipe (edited)",
      }),
    });
    await editedCard.hover();
    await editedCard.locator('button:has-text("Delete")').click();
    await page.click('button:has-text("Confirm")');
    await expect(
      page.locator(".recipe-card-title", {
        hasText: "E2E Test Recipe (edited)",
      }),
    ).not.toBeVisible();
  });
});
