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
