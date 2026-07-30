import { scaleAmount } from "./scaleAmount";

describe("scaleAmount", () => {
  test("multiplies numeric amounts", () => {
    expect(scaleAmount(2, 2)).toBe(4);
    expect(scaleAmount(1.5, 3)).toBe(4.5);
    expect(scaleAmount(0.5, 0.5)).toBe(0.25);
  });

  test("rounds scaled amounts to two decimals", () => {
    expect(scaleAmount(1 / 3, 1)).toBe(0.33);
    expect(scaleAmount(0.1, 3)).toBe(0.3);
  });

  test("multiplies numeric string amounts (legacy data)", () => {
    expect(scaleAmount("2", 2)).toBe(4);
    expect(scaleAmount("1.5", 2)).toBe(3);
    expect(scaleAmount(" 3 ", 2)).toBe(6);
  });

  test("leaves non-numeric amounts unchanged", () => {
    expect(scaleAmount("a pinch", 2)).toBe("a pinch");
    expect(scaleAmount("1/2", 2)).toBe("1/2");
    expect(scaleAmount("", 2)).toBe("");
  });

  test("returns empty string for missing amounts (imported recipes)", () => {
    expect(scaleAmount(null, 2)).toBe("");
    expect(scaleAmount(undefined, 2)).toBe("");
  });
});
