// Scales a recipe amount for display. Stored amounts represent a 1x recipe;
// values that aren't plain numbers (e.g. "a pinch", "1/2") are left unchanged.
export function scaleAmount(amount: number | string, multiplier: number): number | string {
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
