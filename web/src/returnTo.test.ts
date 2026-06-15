import { consumeReturnTo, setReturnTo, toRouterPath } from "./returnTo";

describe("returnTo", () => {
  beforeEach(() => sessionStorage.clear());

  test("stores and consumes a router-relative path", () => {
    setReturnTo("/recipes/42?x=1");
    expect(consumeReturnTo()).toBe("/recipes/42?x=1");
  });

  test("consuming clears the stored path", () => {
    setReturnTo("/recipes/42");
    consumeReturnTo();
    expect(consumeReturnTo()).toBe("/recipes");
  });

  test("falls back to the default when nothing is stored", () => {
    expect(consumeReturnTo()).toBe("/recipes");
  });

  test("never stores auth pages (avoids redirect loops)", () => {
    setReturnTo("/login");
    setReturnTo("/register?ref=x");
    expect(consumeReturnTo()).toBe("/recipes");
  });

  test("toRouterPath returns the path unchanged when basename is root", () => {
    // BASE_URL defaults to "/" under vitest
    expect(toRouterPath("/recipes/9", "?a=b", "#top")).toBe("/recipes/9?a=b#top");
  });
});
