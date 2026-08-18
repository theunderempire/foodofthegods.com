import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderSharePreviewHtml, toIso8601Duration } from "../../src/services/sharePreview.js";

const recipe = {
  _id: "recipe-1",
  name: "Ambrosia Salad",
  prepDuration: "30 min",
  cookDuration: "1 hr 30 min",
  servings: "4",
  imageUrl: "https://example.com/thumbnails/recipe-1.jpg?v=123",
  ingredients: [
    { id: 1, name: "flour", amount: 1.5, unit: "cup" },
    { id: 2, name: "salt", amount: "", unit: "" },
  ],
  directions: [
    { id: 1, text: "Mix everything.", duration: "" },
    { id: 2, text: "Bake.", duration: "45 min" },
  ],
};

describe("toIso8601Duration", () => {
  test("converts hours and minutes", () => {
    assert.equal(toIso8601Duration("1 hr 30 min"), "PT1H30M");
    assert.equal(toIso8601Duration("30 min"), "PT30M");
    assert.equal(toIso8601Duration("2 hrs"), "PT2H");
    assert.equal(toIso8601Duration("45 minutes"), "PT45M");
  });

  test("returns null for shapes it cannot parse", () => {
    assert.equal(toIso8601Duration("overnight"), null);
    assert.equal(toIso8601Duration(""), null);
    assert.equal(toIso8601Duration(null), null);
    assert.equal(toIso8601Duration(30), null);
  });
});

describe("renderSharePreviewHtml", () => {
  test("renders Open Graph and Twitter tags with recipe data", () => {
    const html = renderSharePreviewHtml(recipe, "recipe-1");
    assert.match(html, /<meta property="og:title" content="Ambrosia Salad">/);
    assert.match(
      html,
      /<meta property="og:description" content="Prep 30 min · Cook 1 hr 30 min · Serves 4 · 2 ingredients">/,
    );
    assert.match(html, /<meta property="og:type" content="article">/);
    assert.match(
      html,
      /<meta property="og:image" content="https:\/\/example.com\/thumbnails\/recipe-1.jpg\?v=123">/,
    );
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<meta name="twitter:title" content="Ambrosia Salad">/);
    assert.match(html, /<title>Ambrosia Salad · Food of the Gods<\/title>/);
  });

  test("points og:url, canonical, and the human redirect at the SPA share page", () => {
    const html = renderSharePreviewHtml(recipe, "recipe-1");
    const shareUrl = "https://theunderempire.com/foodofthegods/recipes/recipe-1/share";
    assert.ok(html.includes(`<meta property="og:url" content="${shareUrl}">`));
    assert.ok(html.includes(`<link rel="canonical" href="${shareUrl}">`));
    assert.ok(html.includes(`<meta http-equiv="refresh" content="0;url=${shareUrl}">`));
    assert.ok(html.includes(`window.location.replace("${shareUrl}")`));
  });

  test("embeds schema.org Recipe JSON-LD", () => {
    const html = renderSharePreviewHtml(recipe, "recipe-1");
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(match, "expected a JSON-LD block");
    const jsonLd = JSON.parse(match[1]);
    assert.equal(jsonLd["@type"], "Recipe");
    assert.equal(jsonLd.name, "Ambrosia Salad");
    assert.equal(jsonLd.prepTime, "PT30M");
    assert.equal(jsonLd.cookTime, "PT1H30M");
    assert.equal(jsonLd.recipeYield, "4");
    assert.deepEqual(jsonLd.recipeIngredient, ["1.5 cup flour", "salt"]);
    assert.deepEqual(jsonLd.recipeInstructions, [
      { "@type": "HowToStep", text: "Mix everything." },
      { "@type": "HowToStep", text: "Bake." },
    ]);
  });

  test("escapes recipe content in tags and JSON-LD", () => {
    const html = renderSharePreviewHtml(
      {
        ...recipe,
        name: `"><script>alert(1)</script>`,
        directions: [{ id: 1, text: "</script><script>alert(2)</script>" }],
      },
      "recipe-1",
    );
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(!html.includes("</script><script>alert(2)"));
    assert.match(html, /content="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  });

  test("skips image tags and downgrades the card when imageUrl is not absolute", () => {
    const html = renderSharePreviewHtml({ ...recipe, imageUrl: "/thumbnails/x.jpg" }, "recipe-1");
    assert.ok(!html.includes("og:image"));
    assert.ok(!html.includes("twitter:image"));
    assert.match(html, /<meta name="twitter:card" content="summary">/);
  });

  test("renders a generic page for a missing recipe", () => {
    const html = renderSharePreviewHtml(null, "nope");
    assert.match(html, /<meta property="og:title" content="Recipe">/);
    assert.match(html, /A recipe shared on Food of the Gods\./);
    assert.ok(!html.includes("ld+json"));
    assert.ok(
      html.includes("https://theunderempire.com/foodofthegods/recipes/nope/share"),
      "still redirects humans to the SPA",
    );
  });

  test("URL-encodes the share id in generated URLs", () => {
    const html = renderSharePreviewHtml(null, "a/b?c");
    assert.ok(html.includes("/recipes/a%2Fb%3Fc/share"));
  });
});
