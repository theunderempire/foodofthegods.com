import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeDuplicateItems,
  parseIngredientLine,
  parseIngredientText,
  parseQuantity,
} from "../../src/services/ingredientMath.js";

const item = (id, name, amount, unit, completed = false) => ({
  ingredient: { id, name, amount, unit },
  completed,
});
const group = (...items) => [{ name: "ungrouped", items }];

describe("parseIngredientLine", () => {
  const cases = [
    ["2 cups flour", { name: "flour", amount: 2, unit: "cup" }],
    ["1 1/2 tbsp sugar", { name: "sugar", amount: 1.5, unit: "tbsp" }],
    ["½ lb butter", { name: "butter", amount: 0.5, unit: "lb" }],
    ["1½ cups milk", { name: "milk", amount: 1.5, unit: "cup" }],
    ["- 3 eggs", { name: "eggs", amount: 3, unit: undefined }],
    ["2 cloves of garlic", { name: "garlic", amount: 2, unit: "clove" }],
    ["16 fl oz cream", { name: "cream", amount: 16, unit: "fl oz" }],
    ["2-3 apples", { name: "apples", amount: 3, unit: undefined }],
    ["flour - 2 cups", { name: "flour", amount: 2, unit: "cup" }],
    ["eggs x3", { name: "eggs", amount: 3, unit: undefined }],
    ["2% milk", { name: "2% milk", amount: "", unit: undefined }],
    ["Cajun mix 2 tbsp", { name: "Cajun mix", amount: 2, unit: "tbsp" }],
    ["Lox 2", { name: "Lox", amount: 2, unit: undefined }],
    ["1 cup + 2 tbsp sugar", { name: "sugar", amount: 1.13, unit: "cup" }],
    ["1 lb 4 oz ground beef", { name: "ground beef", amount: 1.25, unit: "lb" }],
    ["1 cup plus 2 tbsp sugar", { name: "sugar", amount: 1.13, unit: "cup" }],
    ["1 cup + 100 g butter", { name: "100 g butter", amount: 1, unit: "cup" }],
    ["1 cup 2% milk", { name: "2% milk", amount: 1, unit: "cup" }],
    ["salt", { name: "salt", amount: "", unit: undefined }],
  ];
  for (const [input, expected] of cases) {
    test(input, () => assert.deepEqual(parseIngredientLine(input), expected));
  }

  test("blank lines are skipped", () => {
    assert.equal(parseIngredientLine("   "), null);
    assert.equal(parseIngredientText("1 cup rice\n\n2 onions\n").length, 2);
  });
});

describe("mergeDuplicateItems", () => {
  test("sums identical units for the same name", () => {
    const out = mergeDuplicateItems(
      group(item("1", "Flour", 1, "cup"), item("2", "flour", 2, "cup")),
    );
    assert.equal(out[0].items.length, 1);
    assert.equal(out[0].items[0].ingredient.amount, 3);
    assert.equal(out[0].items[0].ingredient.unit, "cup");
  });

  test("converts within a family and uses the largest item's unit", () => {
    const out = mergeDuplicateItems(
      group(item("1", "milk", 1, "cup"), item("2", "milk", 8, "tbsp")),
    );
    assert.equal(out[0].items.length, 1);
    assert.equal(out[0].items[0].ingredient.unit, "cup");
    assert.equal(out[0].items[0].ingredient.amount, 1.5);
  });

  test("does not merge across volume and weight", () => {
    const out = mergeDuplicateItems(
      group(item("1", "butter", 1, "cup"), item("2", "butter", 100, "g")),
    );
    assert.equal(out[0].items.length, 2);
  });

  test("leaves free-text amounts alone", () => {
    const out = mergeDuplicateItems(
      group(item("1", "salt", "a pinch"), item("2", "salt", 1, "tsp")),
    );
    assert.equal(out[0].items.length, 2);
  });

  test("uses model-suggested clusters for different names", () => {
    const items = group(item("1", "tomato", 2), item("2", "tomatoes", 3));
    assert.equal(mergeDuplicateItems(items)[0].items.length, 2);
    const out = mergeDuplicateItems(items, [["1", "2"]]);
    assert.equal(out[0].items.length, 1);
    assert.equal(out[0].items[0].ingredient.amount, 5);
  });

  test("ignores hallucinated ids and never merges checked items", () => {
    const items = group(item("1", "egg", 1), item("2", "egg", 1, undefined, true));
    const out = mergeDuplicateItems(items, [["1", "nope"]]);
    assert.equal(out[0].items.length, 2);
  });

  test("merges across groups into the first member's position", () => {
    const groups = [
      { name: "Dairy", items: [item("1", "milk", 1, "cup")] },
      { name: "Pantry", items: [item("2", "milk", 1, "cup")] },
    ];
    const out = mergeDuplicateItems(groups);
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "Dairy");
    assert.equal(out[0].items[0].ingredient.amount, 2);
  });
});

describe("parseQuantity", () => {
  test("accepts a quantity exactly as written", () => {
    assert.equal(parseQuantity("2"), 2);
    assert.equal(parseQuantity(" 1 1/2 "), 1.5);
    assert.equal(parseQuantity("½"), 0.5);
    assert.equal(parseQuantity("2-3"), 3);
  });

  test("rejects anything that is not a bare number", () => {
    assert.equal(parseQuantity("a dozen"), null);
    assert.equal(parseQuantity("2 cups"), null);
    assert.equal(parseQuantity("two"), null);
    assert.equal(parseQuantity(""), null);
    assert.equal(parseQuantity(undefined), null);
  });
});
