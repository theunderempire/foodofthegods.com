// Scales a recipe amount for display. Stored amounts represent a 1x recipe;
// values that aren't plain numbers (e.g. "a pinch", "1/2") are left unchanged.
// Imported recipes may have no amount at all (e.g. "salt to taste").
export function scaleAmount(
  amount: number | string | null | undefined,
  multiplier: number,
): number | string {
  if (amount == null) {
    return "";
  }
  if (typeof amount === "number") {
    return round(amount * multiplier);
  }
  const trimmed = amount.trim();
  if (trimmed !== "" && /^\d*\.?\d+$/.test(trimmed)) {
    return round(parseFloat(trimmed) * multiplier);
  }
  return amount;
}

function round(value: number): number {
  return parseFloat(value.toFixed(2));
}
