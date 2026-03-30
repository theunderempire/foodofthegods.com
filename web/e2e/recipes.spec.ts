import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("recipes", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("recipe list shows seed recipe", async ({ page }) => {
    await expect(page.locator(".recipe-card-title", { hasText: /^Test$/ })).toBeVisible();
  });

  test("view single recipe shows details", async ({ page }) => {
    await page
      .locator(".recipe-card-link", {
        has: page.locator(".recipe-card-title", { hasText: /^Test$/ }),
      })
      .click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Test" })).toBeVisible();
  });

  test("restores search filter after navigating back from recipe", async ({ page }) => {
    await page.fill('input[placeholder="Search recipes..."]', "Test");
    await expect(page.locator(".recipe-card-title", { hasText: /^Test$/ })).toBeVisible();
    await expect(page.locator(".recipe-card-title", { hasText: "Banana Bread" })).not.toBeVisible();

    await page
      .locator(".recipe-card-link", {
        has: page.locator(".recipe-card-title", { hasText: /^Test$/ }),
      })
      .click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    await page.goBack();
    await expect(page).toHaveURL("/recipes");

    await expect(page.locator('input[placeholder="Search recipes..."]')).toHaveValue("Test");
    await expect(page.locator(".recipe-card-title", { hasText: /^Test$/ })).toBeVisible();
    await expect(page.locator(".recipe-card-title", { hasText: "Banana Bread" })).not.toBeVisible();
  });

  test("restores scroll position after navigating back from recipe", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 200 });
    await page.locator(".recipe-card-link").first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.evaluate(() =>
      (document.querySelector(".recipe-card-link") as HTMLAnchorElement).click(),
    );
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    await page.goBack();
    await expect(page).toHaveURL("/recipes");
    await page.locator(".recipe-card-title").first().waitFor();

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });

  test("recipe cards display images for recipes with imageUrl", async ({ page }) => {
    const card = page.locator(".recipe-card", {
      has: page.locator(".recipe-card-title", { hasText: "Lemon Herb Roast Chicken" }),
    });
    const img = card.locator(".recipe-card-image img");
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", /\/thumbnails\//);
  });

  test("recipe card image is not broken", async ({ page }) => {
    const card = page.locator(".recipe-card", {
      has: page.locator(".recipe-card-title", { hasText: "Lemon Herb Roast Chicken" }),
    });
    const img = card.locator(".recipe-card-image img");
    await expect(img).toBeVisible();
    const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0);
  });

  test("removes the correct ingredient when deleting the middle item", async ({ page }) => {
    const recipeName = `E2E Ingredient Order Test ${Date.now()}`;
    await page.click('[aria-label="Add recipe"]');
    await page.click('button:has-text("Enter Manually")');
    await page.fill("#name", recipeName);

    const ingredientsSection = page.locator("section", { hasText: /^Ingredients/ });
    const nameInputs = ingredientsSection.locator(".input-name");

    await nameInputs.nth(0).fill("flour");
    await page.click('button:has-text("+ Add Ingredient")');
    await nameInputs.nth(1).fill("sugar");
    await page.click('button:has-text("+ Add Ingredient")');
    await nameInputs.nth(2).fill("salt");

    // Remove the middle ingredient ("sugar")
    await ingredientsSection.locator(".remove-btn").nth(1).click();

    await expect(nameInputs).toHaveCount(2);
    await expect(nameInputs.nth(0)).toHaveValue("flour");
    await expect(nameInputs.nth(1)).toHaveValue("salt");

    // Clean up: create then delete from the recipe viewer
    await page.click('button:has-text("Create Recipe")');
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await page.click('button:has-text("Delete")');
    await page.click('button:has-text("Confirm")');
  });

  test("removes the correct direction when deleting the middle item", async ({ page }) => {
    const recipeName = `E2E Direction Order Test ${Date.now()}`;
    await page.click('[aria-label="Add recipe"]');
    await page.click('button:has-text("Enter Manually")');
    await page.fill("#name", recipeName);

    const directionsSection = page.locator("section", { hasText: /^Directions/ });
    const textareas = directionsSection.locator("textarea");

    await textareas.nth(0).fill("Preheat oven.");
    await page.click('button:has-text("+ Add Step")');
    await textareas.nth(1).fill("Mix ingredients.");
    await page.click('button:has-text("+ Add Step")');
    await textareas.nth(2).fill("Bake for 30 min.");

    // Remove the middle direction ("Mix ingredients.")
    await directionsSection.locator(".remove-btn").nth(1).click();

    await expect(textareas).toHaveCount(2);
    await expect(textareas.nth(0)).toHaveValue("Preheat oven.");
    await expect(textareas.nth(1)).toHaveValue("Bake for 30 min.");

    // Clean up: create then delete from the recipe viewer
    await page.click('button:has-text("Create Recipe")');
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await page.click('button:has-text("Delete")');
    await page.click('button:has-text("Confirm")');
  });

  test("delete a recipe from the recipe viewer", async ({ page }) => {
    const recipeName = `E2E Viewer Delete Test ${Date.now()}`;
    await page.click('[aria-label="Add recipe"]');
    await page.click('button:has-text("Enter Manually")');
    await page.fill("#name", recipeName);
    await page.click('button:has-text("Create Recipe")');
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    await page.click('button:has-text("Delete")');
    await page.click('button:has-text("Confirm")');

    await expect(page).toHaveURL("/recipes");
    await expect(page.locator(".recipe-card-title", { hasText: recipeName })).not.toBeVisible();
  });

  test("create, edit, and delete a recipe", async ({ page }) => {
    // Create
    await page.click('[aria-label="Add recipe"]');
    await expect(page).toHaveURL("/recipes/new");
    await page.click('button:has-text("Enter Manually")');

    await page.fill("#name", "E2E Test Recipe");
    await page.fill("#prepDuration", "5 min");
    await page.fill("#cookDuration", "10 min");
    await page.fill("#servings", "2");
    await page.locator(".input-amount").first().fill("2");
    await page.locator(".input-name").first().fill("flour");
    await page.locator("textarea").first().fill("Mix everything.");

    await page.click('button:has-text("Create Recipe")');
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "E2E Test Recipe" })).toBeVisible();

    // Edit
    await page.click('button:has-text("Edit")');
    await expect(page).toHaveURL(/\/recipes\/[^/]+\/edit$/);

    await page.fill("#name", "");
    await page.fill("#name", "E2E Test Recipe (edited)");
    await page.click('button:has-text("Save Changes")');
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "E2E Test Recipe (edited)" })).toBeVisible();

    // Delete
    await page.click('button:has-text("Delete")');
    await page.click('button:has-text("Confirm")');
    await expect(page).toHaveURL("/recipes");
    await expect(
      page.locator(".recipe-card-title", { hasText: "E2E Test Recipe (edited)" }),
    ).not.toBeVisible();
  });
});
