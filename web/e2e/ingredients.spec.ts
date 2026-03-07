import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("ingredients", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('a:has-text("Shopping List")');
    await expect(page).toHaveURL("/ingredients");
  });

  test("shows shopping list page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Shopping List" })).toBeVisible();
  });

  test("add and remove an ingredient", async ({ page }) => {
    // Open add modal
    await page.click('[aria-label="Add ingredient"]');
    await expect(page.locator(".add-item-dialog")).toBeVisible();

    // Fill form
    await page.locator('.add-item-dialog input[placeholder="Ingredient name"]').fill("butter");
    await page.locator('.add-item-dialog input[type="number"]').fill("2");
    await page.locator('.add-item-dialog input[placeholder="cup, oz, …"]').fill("tbsp");

    await page.click('.add-item-dialog button:has-text("Add")');
    await expect(page.locator(".add-item-dialog")).not.toBeVisible();

    // Verify it appears
    await expect(page.locator(".item-name", { hasText: "butter" })).toBeVisible();

    // Remove it
    const item = page.locator(".shopping-item", {
      has: page.locator(".item-name", { hasText: "butter" }),
    });
    await item.locator('[aria-label="Remove"]').click();
    await expect(
      page.locator(".item-name", { hasText: "butter" }),
    ).not.toBeVisible();
  });

  test("toggle an ingredient as completed", async ({ page }) => {
    const name = `eggs-${Date.now()}`;

    // Add an ingredient first
    await page.click('[aria-label="Add ingredient"]');
    await page.locator('.add-item-dialog input[placeholder="Ingredient name"]').fill(name);
    await page.locator('.add-item-dialog input[type="number"]').fill("3");
    await page.click('.add-item-dialog button:has-text("Add")');

    // Toggle it
    const item = page.locator(".shopping-item", {
      has: page.locator(".item-name", { hasText: name }),
    });
    await item.locator(".item-checkbox").click();
    await expect(item).toHaveClass(/completed/, { timeout: 10000 });

    // Clean up
    await item.locator('[aria-label="Remove"]').click();
  });
});
