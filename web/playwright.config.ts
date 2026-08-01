import { defineConfig, devices } from "@playwright/test";

// Vite serves the app from "/" in development but "/foodofthegods/" in a
// production build. Until now every test — unit and e2e — ran against the dev
// server, so nothing ever exercised the base path. A share link built from
// window.location.origin alone therefore passed the whole suite and 404'd in
// production. The chromium-build project below is the only place the production
// configuration is exercised.
//
// Navigations and URL assertions in the specs must stay RELATIVE ("login", not
// "/login"): a leading slash resolves against the origin and drops the base path,
// which is the same mistake that caused the bug.
const DEV_URL = "http://localhost:5173/";
const PREVIEW_ORIGIN = "http://localhost:4173";
const PREVIEW_URL = `${PREVIEW_ORIGIN}/foodofthegods/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-dev",
      use: { ...devices["Desktop Chrome"], baseURL: DEV_URL },
      testIgnore: /production-build\.spec\.ts/,
    },
    {
      // Deliberately a focused subset rather than the whole suite: this project
      // exists to catch configuration-level breakage (base path, asset URLs, SPA
      // fallback, copied links), not to re-verify business logic against the same
      // database a second time.
      name: "chromium-build",
      use: { ...devices["Desktop Chrome"], baseURL: PREVIEW_URL },
      testMatch: /(production-build|deeplink)\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: "npm run start",
      url: DEV_URL,
      reuseExistingServer: true,
    },
    {
      command: `npm run build && npm run preview -- --port 4173 --strictPort`,
      url: PREVIEW_URL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
