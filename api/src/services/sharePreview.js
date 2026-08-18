import { escapeHtml, appUrl } from "../html.js";

// Social crawlers (Facebook, Slack, WhatsApp, X, Discord, ...) don't execute
// JavaScript, so the SPA can never show them a recipe preview. The reverse
// proxy rewrites crawler requests for /recipes/:shareId/share to this
// server-rendered page instead (see docs/social-share-previews.md). A human who
// lands here anyway is redirected back to the SPA share page.

const SITE_NAME = "Food of the Gods";

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

// "1 hr 30 min" → "PT1H30M", for schema.org Recipe (the inverse of
// parseIso8601Duration in recipes.service.js). Returns null when the string
// doesn't fit that shape rather than guessing.
export function toIso8601Duration(str) {
  if (typeof str !== "string") return null;
  const match = str.trim().match(/^(?:(\d+)\s*(?:hr|hour)s?)?\s*(?:(\d+)\s*(?:min|minute)s?)?$/i);
  if (!match || (!match[1] && !match[2])) return null;
  return `PT${match[1] ? `${match[1]}H` : ""}${match[2] ? `${match[2]}M` : ""}`;
}

function buildDescription(recipe) {
  const parts = [];
  if (recipe.prepDuration) parts.push(`Prep ${recipe.prepDuration}`);
  if (recipe.cookDuration) parts.push(`Cook ${recipe.cookDuration}`);
  if (recipe.servings) parts.push(`Serves ${recipe.servings}`);
  const count = recipe.ingredients?.length;
  if (count) parts.push(`${count} ingredient${count === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : `A recipe shared on ${SITE_NAME}.`;
}

// schema.org Recipe structured data — this is what Google rich results and
// Pinterest rich pins read, and this app's own URL importer prefers it too.
function buildRecipeJsonLd(recipe, pageUrl) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.name,
    url: pageUrl,
  };
  if (isHttpUrl(recipe.imageUrl)) jsonLd.image = recipe.imageUrl;
  const prepTime = toIso8601Duration(recipe.prepDuration);
  const cookTime = toIso8601Duration(recipe.cookDuration);
  if (prepTime) jsonLd.prepTime = prepTime;
  if (cookTime) jsonLd.cookTime = cookTime;
  if (recipe.servings) jsonLd.recipeYield = String(recipe.servings);
  const ingredients = (recipe.ingredients ?? [])
    .map((i) =>
      [i.amount, i.unit, i.name]
        .filter((part) => part !== "" && part != null)
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  if (ingredients.length) jsonLd.recipeIngredient = ingredients;
  const steps = (recipe.directions ?? [])
    .map((d) => d.text)
    .filter(Boolean)
    .map((text) => ({ "@type": "HowToStep", text }));
  if (steps.length) jsonLd.recipeInstructions = steps;
  return jsonLd;
}

// `</script>` inside a JSON string would terminate the ld+json block and let
// recipe content inject markup; escaping `<` inside string values closes that
// while remaining valid JSON.
function jsonForScriptTag(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderSharePreviewHtml(recipe, shareId) {
  const pageUrl = appUrl(`/recipes/${encodeURIComponent(shareId)}/share`);
  const name = recipe?.name || "Recipe";
  const title = `${name} · ${SITE_NAME}`;
  const description = recipe ? buildDescription(recipe) : `A recipe shared on ${SITE_NAME}.`;
  const imageUrl = recipe && isHttpUrl(recipe.imageUrl) ? recipe.imageUrl : null;

  const head = [
    `<meta charset="utf-8">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(pageUrl)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${escapeHtml(name)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
  ];
  if (imageUrl) {
    head.push(
      `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
      `<meta property="og:image:alt" content="${escapeHtml(name)}">`,
    );
  }
  head.push(
    `<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeHtml(name)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
  );
  if (imageUrl) head.push(`<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`);
  if (recipe) {
    head.push(
      `<script type="application/ld+json">${jsonForScriptTag(buildRecipeJsonLd(recipe, pageUrl))}</script>`,
    );
  }
  head.push(`<meta http-equiv="refresh" content="0;url=${escapeHtml(pageUrl)}">`);

  return `<!doctype html>
<html lang="en">
<head>
${head.join("\n")}
</head>
<body>
<p>Redirecting to <a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a>&hellip;</p>
<script>window.location.replace(${jsonForScriptTag(pageUrl)});</script>
</body>
</html>
`;
}
