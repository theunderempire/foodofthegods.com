import { test, expect } from "@playwright/test";
import { login } from "./helpers/auth";

// These only run under the chromium-build project, against `vite preview` serving
// the real production build at its real base path. The dev server serves from "/",
// so none of this is reachable there.
test.describe("production build", () => {
  test("serves the app shell under the base path", async ({ page }) => {
    await page.goto("login");

    await expect(page).toHaveURL(/\/foodofthegods\/login$/);
    await expect(page.locator("#username")).toBeVisible();
  });

  // A wrong `base` shows up as 404s on the hashed asset URLs, which leaves a blank
  // page rather than a failed assertion anywhere obvious.
  test("loads every asset it references without a 404", async ({ page }) => {
    const failed: string[] = [];
    page.on("response", (response) => {
      const url = response.url();
      if (response.status() >= 400 && url.startsWith("http://localhost:4173")) {
        failed.push(`${response.status()} ${url}`);
      }
    });

    await page.goto("login");
    await expect(page.locator("#username")).toBeVisible();

    expect(failed).toEqual([]);
  });

  test("falls back to the app shell on a deep route loaded directly", async ({ page }) => {
    // Not a client-side navigation: the server is asked for a nested path it has no
    // file for, which is what a pasted link does. /recipes is protected, so the app
    // booting and redirecting to login is itself the proof that the shell was
    // served and the router picked up the base path — a broken base would have
    // given a 404 or a blank page instead.
    const response = await page.goto("recipes", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/foodofthegods\/(recipes|login)$/);
    await expect(page.locator("#username")).toBeVisible();
  });

  test.describe("share links", () => {
    test.beforeEach(async ({ page }) => {
      await login(page);
    });

    // The regression test for the bug this project was added to catch: the Share
    // button built its link from window.location.origin, which omits the base
    // path, so every copied link 404'd against the real deployment.
    test("copies a link that includes the base path and actually resolves", async ({ page }) => {
      await page
        .locator(".recipe-card-link", {
          has: page.locator(".recipe-card-title", { hasText: /^Test$/ }),
        })
        .click();
      await expect(page.getByRole("heading", { name: "Test" })).toBeVisible();

      // Capture the copied value by replacing the clipboard write, which avoids
      // depending on clipboard permissions.
      await page.evaluate(() => {
        navigator.clipboard.writeText = async (text: string) => {
          (window as unknown as { __copied?: string }).__copied = text;
        };
      });
      await page.getByRole("button", { name: "Share" }).click();
      const copied = await page.evaluate(
        () => (window as unknown as { __copied?: string }).__copied,
      );

      expect(copied).toBeTruthy();
      expect(copied).toContain("/foodofthegods/recipes/");
      expect(copied).toMatch(/\/share$/);

      // The assertion that matters: the copied link has to render the recipe.
      const response = await page.goto(copied!);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByRole("heading", { name: "Test" })).toBeVisible();
    });

    test("a share link works without a session", async ({ page, context }) => {
      await page
        .locator(".recipe-card-link", {
          has: page.locator(".recipe-card-title", { hasText: /^Test$/ }),
        })
        .click();
      await expect(page.getByRole("heading", { name: "Test" })).toBeVisible();

      await page.evaluate(() => {
        navigator.clipboard.writeText = async (text: string) => {
          (window as unknown as { __copied?: string }).__copied = text;
        };
      });
      await page.getByRole("button", { name: "Share" }).click();
      const copied = await page.evaluate(
        () => (window as unknown as { __copied?: string }).__copied,
      );

      // Sharing is only useful if the recipient does not need an account.
      await context.clearCookies();
      const anonymous = await context.newPage();
      const response = await anonymous.goto(copied!);

      expect(response?.status()).toBeLessThan(400);
      await expect(anonymous.getByRole("heading", { name: "Test" })).toBeVisible();
      await anonymous.close();
    });
  });
});
