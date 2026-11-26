import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mergeDuplicateItems, nameKey } from "../../src/services/ingredientMath.js";

const item = (id, name, amount, unit, sources) => ({
  ingredient: { id, name, amount, unit, ...(sources ? { sources } : {}) },
  completed: false,
});

describe("nameKey", () => {
  test("ignores case, punctuation, whitespace and plurals", () => {
    assert.equal(nameKey("  Onions "), nameKey("onion"));
    assert.equal(nameKey("Cherry  Tomatoes"), nameKey("cherry tomato"));
    assert.equal(nameKey("Berries"), nameKey("berry"));
    assert.equal(nameKey("Peaches"), nameKey("peach"));
  });

  test("leaves -ss/-us/-is words and different ingredients apart", () => {
    assert.equal(nameKey("hummus"), "hummus");
    assert.equal(nameKey("asparagus"), "asparagus");
    assert.notEqual(nameKey("egg"), nameKey("eggplant"));
  });
});

describe("mergeDuplicateItems", () => {
  test("sums plural/singular duplicates and keeps both recipes' sources", () => {
    const groups = [
      {
        name: "ungrouped",
        items: [
          item("a", "onion", 1, undefined, ["r1:1"]),
          item("b", "Onions", 2, undefined, ["r2:4"]),
        ],
      },
    ];
    const [group] = mergeDuplicateItems(groups);
    assert.equal(group.items.length, 1);
    assert.equal(group.items[0].ingredient.amount, 3);
    assert.deepEqual(group.items[0].ingredient.sources, ["r1:1", "r2:4"]);
  });
});
