import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

test.describe("ingredients", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('a:has-text("Shopping List")');
    await expect(page).toHaveURL("ingredients");
  });

  test("shows shopping list page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Shopping List" })).toBeVisible();
  });

  test("add and remove an ingredient", async ({ page }) => {
    const name = `butter-${Date.now()}`;

    // Open add modal
    await page.click('[aria-label="Add ingredient"]');
    await expect(page.locator(".add-item-dialog")).toBeVisible();

    // Fill form
    await page.locator('.add-item-dialog input[placeholder="Ingredient name"]').fill(name);
    await page.locator('.add-item-dialog input[type="number"]').fill("2");
    await page.locator('.add-item-dialog input[placeholder="cup, oz, …"]').fill("tbsp");

    await page.click('.add-item-dialog button:has-text("Add")');
    await expect(page.locator(".add-item-dialog")).not.toBeVisible();

    // Verify it appears
    await expect(page.locator(".item-name", { hasText: name })).toBeVisible();

    // Remove it
    const item = page.locator(".shopping-item", {
      has: page.locator(".item-name", { hasText: name }),
    });
    await item.locator('[aria-label="Remove"]').click();
    await expect(page.locator(".item-name", { hasText: name })).not.toBeVisible();
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

  // Every pasted line below carries a unit the deterministic parser recognises, so
  // the server never calls Gemini for them — even if the local test user has an API
  // key. A unit-less line ("3 eggs") would be sent to the model, so keep them out.
  test.describe("paste list", () => {
    // Letters only: digits next to a quantity would be ambiguous to the parser.
    const suffix = String(Date.now()).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);

    async function openPasteDialog(page: Page) {
      await page.getByRole("button", { name: "Paste list" }).click();
      await expect(page.locator(".add-item-dialog")).toBeVisible();
    }

    async function removeItem(page: Page, name: string) {
      const item = page.locator(".shopping-item", {
        has: page.locator(".item-name", { hasText: name }),
      });
      await item.locator('[aria-label="Remove"]').click();
      await expect(page.locator(".item-name", { hasText: name })).not.toBeVisible();
    }

    test("parses pasted lines into amounts, units and names", async ({ page }) => {
      const flour = `flour${suffix}`;
      const sugar = `sugar${suffix}`;
      const butter = `butter${suffix}`;

      await openPasteDialog(page);
      await page
        .getByLabel("One item per line")
        .fill(`- 2 cups ${flour}\n1 1/2 tbsp ${sugar}\n\n½ lb ${butter}`);
      await page
        .locator(".add-item-dialog")
        .getByRole("button", { name: "Add", exact: true })
        .click();
      await expect(page.locator(".add-item-dialog")).not.toBeVisible();

      const row = (name: string) =>
        page.locator(".shopping-item", { has: page.locator(".item-name", { hasText: name }) });
      await expect(row(flour).locator(".item-amount")).toHaveText("2 cup");
      await expect(row(sugar).locator(".item-amount")).toHaveText("1.5 tbsp");
      await expect(row(butter).locator(".item-amount")).toHaveText("0.5 lb");

      for (const name of [flour, sugar, butter]) await removeItem(page, name);
    });

    test("folds mixed quantities of the same unit family into one amount", async ({ page }) => {
      const name = `milk${suffix}`;

      await openPasteDialog(page);
      await page.getByLabel("One item per line").fill(`1 cup + 8 tbsp ${name}`);
      await page
        .locator(".add-item-dialog")
        .getByRole("button", { name: "Add", exact: true })
        .click();

      const row = page.locator(".shopping-item", {
        has: page.locator(".item-name", { hasText: name }),
      });
      await expect(row.locator(".item-amount")).toHaveText("1.5 cup");

      await removeItem(page, name);
    });

    test("shows the server error inside the dialog and keeps the text", async ({ page }) => {
      await openPasteDialog(page);
      await page.getByLabel("One item per line").fill("-");
      await page
        .locator(".add-item-dialog")
        .getByRole("button", { name: "Add", exact: true })
        .click();

      const dialog = page.locator(".add-item-dialog");
      await expect(dialog.locator(".alert-error")).toHaveText(
        "Couldn't find any ingredients in that text",
      );
      await expect(page.getByLabel("One item per line")).toHaveValue("-");
    });

    test("Add is disabled for blank text and Cancel discards it", async ({ page }) => {
      await openPasteDialog(page);
      const add = page
        .locator(".add-item-dialog")
        .getByRole("button", { name: "Add", exact: true });
      await expect(add).toBeDisabled();

      await page.getByLabel("One item per line").fill("2 cups nothing");
      await expect(add).toBeEnabled();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.locator(".add-item-dialog")).not.toBeVisible();

      await openPasteDialog(page);
      await expect(page.getByLabel("One item per line")).toHaveValue("");
    });
  });
});
