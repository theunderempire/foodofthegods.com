import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import IngredientService from "../../src/services/ingredients.service.js";
import { makeRes, makeReq, makeCollection } from "../helpers/mocks.js";

const service = new IngredientService();
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const item = (id, name, amount, unit) => ({
  ingredient: { id, name, amount, unit },
  completed: false,
});
const geminiReply = (json) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] }),
  });

function setup(storedGroups, extraStored) {
  const updates = [];
  let reads = 0;
  const req = makeReq({
    username: "user-1",
    params: { userId: "user-1" },
    collections: {
      users: makeCollection({ findOne: () => Promise.resolve({ geminiApiKey: "k" }) }),
      ingredientlist: makeCollection({
        findOne: () => {
          reads += 1;
          const groups = reads > 1 && extraStored ? extraStored : storedGroups;
          return Promise.resolve({ userId: "user-1", ingredientList: { groups } });
        },
        update: (_q, u) => {
          updates.push(u.$set);
          return Promise.resolve();
        },
      }),
    },
  });
  return { req, updates };
}

describe("groupIngredientList duplicate merging", () => {
  test("sums duplicates server-side and groups the merged list", async () => {
    const groups = [
      { name: "ungrouped", items: [item("1", "Flour", 1, "cup"), item("2", "flour", 2, "cup")] },
    ];
    const { req, updates } = setup(groups);
    let call = 0;
    globalThis.fetch = () => {
      call += 1;
      return call === 1 ? geminiReply([]) : geminiReply([{ name: "Pantry", itemIds: ["1"] }]);
    };

    const res = makeRes();
    await service.groupIngredientList(req, res);

    const items = res._body.data.ingredientList.groups[0].items;
    assert.equal(items.length, 1);
    assert.equal(items[0].ingredient.amount, 3);
    assert.equal(res._body.data.ingredientList.groups[0].name, "Pantry");
    assert.ok(updates.some((u) => u["ingredientList.groups"]));
  });

  test("a failed grouping call never persists the merge", async () => {
    const groups = [
      { name: "ungrouped", items: [item("1", "Flour", 1, "cup"), item("2", "flour", 2, "cup")] },
    ];
    const { req, updates } = setup(groups);
    let call = 0;
    globalThis.fetch = () => {
      call += 1;
      return call === 1
        ? geminiReply([])
        : Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve("slow down") });
    };

    const res = makeRes();
    await service.groupIngredientList(req, res);

    assert.equal(res._body.success, false);
    assert.ok(!updates.some((u) => "ingredientList.groups" in u));
  });

  test("an item added during the Gemini calls is kept", async () => {
    const before = [{ name: "ungrouped", items: [item("1", "milk", 1, "cup")] }];
    const after = [
      { name: "ungrouped", items: [item("1", "milk", 1, "cup"), item("3", "eggs", 6)] },
    ];
    const { req } = setup(before, after);
    let call = 0;
    globalThis.fetch = () => {
      call += 1;
      return call === 1 ? geminiReply([]) : geminiReply([{ name: "Dairy", itemIds: ["1"] }]);
    };

    const res = makeRes();
    await service.groupIngredientList(req, res);

    const names = res._body.data.ingredientList.groups.flatMap((g) =>
      g.items.map((i) => i.ingredient.name),
    );
    assert.deepEqual(names.sort(), ["eggs", "milk"]);
  });
});

describe("addIngredientsFromText AI unit extraction", () => {
  function pasteSetup({ text, apiKey = "k" }) {
    const stored = [];
    const req = makeReq({
      username: "user-1",
      params: { userId: "user-1" },
      body: { text },
      collections: {
        users: makeCollection({
          findOne: () => Promise.resolve(apiKey ? { geminiApiKey: apiKey } : {}),
        }),
        ingredientlist: makeCollection({
          findOne: () => Promise.resolve(null),
          insert: (doc) => {
            stored.push(doc);
            return Promise.resolve(doc);
          },
        }),
      },
    });
    return { req, stored };
  }
  const ingredientsOf = (res) =>
    res._body.data.ingredientList.groups[0].items.map((i) => i.ingredient);

  test("splits unit and name for lines the parser could not", async () => {
    const { req } = pasteSetup({
      text: "2 cups flour\n2 14-oz cans diced tomatoes\n1 bunch cilantro",
    });
    let prompted = "";
    globalThis.fetch = (_url, init) => {
      prompted = JSON.parse(init.body).contents[0].parts[0].text;
      return geminiReply([
        { i: 1, name: "diced tomatoes (14-oz)", quantity: "2", unit: "cans" },
        { i: 2, name: "cilantro", quantity: "1", unit: "bunch" },
      ]);
    };

    const res = makeRes();
    await service.addIngredientsFromText(req, res);

    const [flour, tomatoes, cilantro] = ingredientsOf(res);
    assert.deepEqual([flour.name, flour.amount, flour.unit], ["flour", 2, "cup"]);
    assert.deepEqual(
      [tomatoes.name, tomatoes.amount, tomatoes.unit],
      ["diced tomatoes (14-oz)", 2, "can"],
    );
    assert.equal(cilantro.unit, "bunch");
    // Only lines the parser had no unit for are sent; the resolved line is not.
    assert.ok(!prompted.includes("2 cups flour"));
  });

  test("never lets the model change a number the parser already found", async () => {
    const { req } = pasteSetup({ text: "3 large onions" });
    globalThis.fetch = () => geminiReply([{ i: 0, name: "onion", quantity: "30", unit: "" }]);

    const res = makeRes();
    await service.addIngredientsFromText(req, res);

    const [onion] = ingredientsOf(res);
    assert.equal(onion.amount, 3);
    assert.equal(onion.name, "large onions");
  });

  test("falls back to the parser when Gemini fails or there is no key", async () => {
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("boom") });
    };
    const failing = makeRes();
    await service.addIngredientsFromText(pasteSetup({ text: "3 large onions" }).req, failing);
    assert.equal(ingredientsOf(failing)[0].name, "large onions");

    calls = 0;
    const keyless = makeRes();
    await service.addIngredientsFromText(
      pasteSetup({ text: "3 large onions", apiKey: null }).req,
      keyless,
    );
    assert.equal(calls, 0);
    assert.equal(ingredientsOf(keyless)[0].amount, 3);
  });

  test("makes no AI call when every line already has a unit", async () => {
    let calls = 0;
    globalThis.fetch = () => {
      calls += 1;
      return geminiReply([]);
    };
    const res = makeRes();
    await service.addIngredientsFromText(
      pasteSetup({ text: "2 cups flour\n1 lb butter" }).req,
      res,
    );
    assert.equal(calls, 0);
    assert.equal(ingredientsOf(res).length, 2);
  });
});
