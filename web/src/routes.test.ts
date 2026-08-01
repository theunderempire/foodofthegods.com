import { describe, expect, test, afterEach, vi } from "vitest";
import { matchPath } from "react-router-dom";
import { ROUTES, absoluteUrl, shareUrl } from "./routes";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shareUrl", () => {
  test("produces a link that matches the share route when served from the domain root", () => {
    vi.stubEnv("BASE_URL", "/");

    const url = shareUrl("recipe-1");

    const { pathname } = new URL(url);
    expect(pathname).toBe("/recipes/recipe-1/share");
    expect(matchPath(ROUTES.recipes.SHARE_PATTERN, pathname)?.params.shareId).toBe("recipe-1");
  });

  // Production serves the app from /foodofthegods/. Building the link from
  // window.location.origin alone dropped that prefix, so every copied share link
  // 404'd against the real deployment.
  test("includes the base path when the app is served from a sub-path", () => {
    vi.stubEnv("BASE_URL", "/foodofthegods/");

    const url = shareUrl("69b1e9ee5ce10600146b818c");

    expect(new URL(url).pathname).toBe("/foodofthegods/recipes/69b1e9ee5ce10600146b818c/share");
  });

  test("the sub-path link still matches the route pattern once the base is stripped", () => {
    vi.stubEnv("BASE_URL", "/foodofthegods/");

    const { pathname } = new URL(shareUrl("recipe-1"));
    const withoutBase = pathname.replace("/foodofthegods", "");

    expect(matchPath(ROUTES.recipes.SHARE_PATTERN, withoutBase)?.params.shareId).toBe("recipe-1");
  });

  test("does not emit a doubled slash between the base path and the route", () => {
    vi.stubEnv("BASE_URL", "/foodofthegods/");

    expect(shareUrl("recipe-1")).not.toMatch(/[^:]\/\//);
  });

  test("is absolute so it can be pasted anywhere", () => {
    vi.stubEnv("BASE_URL", "/foodofthegods/");

    expect(shareUrl("recipe-1")).toMatch(/^https?:\/\//);
  });
});

describe("absoluteUrl", () => {
  test("prefixes any route path with the origin and base path", () => {
    vi.stubEnv("BASE_URL", "/foodofthegods/");

    expect(new URL(absoluteUrl(ROUTES.recipes.list)).pathname).toBe("/foodofthegods/recipes");
  });
});
