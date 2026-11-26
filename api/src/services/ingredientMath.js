// Deterministic ingredient maths: parsing pasted text and summing duplicates.
//
// The LLM is only ever asked *which* list items are the same ingredient. It never
// sees an amount and never produces one — every quantity that ends up on the list
// comes from the arithmetic in this file.

// Each family has a base unit; `factor` converts one of the unit into the base.
const UNITS = {
  tsp: { family: "volume", factor: 4.92892, aliases: ["tsp", "tsps", "teaspoon", "teaspoons"] },
  tbsp: {
    family: "volume",
    factor: 14.7868,
    aliases: ["tbsp", "tbsps", "tbs", "tablespoon", "tablespoons"],
  },
  "fl oz": {
    family: "volume",
    factor: 29.5735,
    aliases: ["fl oz", "fl. oz", "floz", "fluid ounce", "fluid ounces"],
  },
  cup: { family: "volume", factor: 236.588, aliases: ["cup", "cups", "c"] },
  pint: { family: "volume", factor: 473.176, aliases: ["pint", "pints", "pt", "pts"] },
  quart: { family: "volume", factor: 946.353, aliases: ["quart", "quarts", "qt", "qts"] },
  gallon: { family: "volume", factor: 3785.41, aliases: ["gallon", "gallons", "gal"] },
  ml: {
    family: "volume",
    factor: 1,
    aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  },
  l: { family: "volume", factor: 1000, aliases: ["l", "liter", "liters", "litre", "litres"] },
  g: { family: "weight", factor: 1, aliases: ["g", "gram", "grams", "gm"] },
  kg: { family: "weight", factor: 1000, aliases: ["kg", "kgs", "kilogram", "kilograms"] },
  oz: { family: "weight", factor: 28.3495, aliases: ["oz", "ounce", "ounces"] },
  lb: { family: "weight", factor: 453.592, aliases: ["lb", "lbs", "pound", "pounds"] },
};

// Units that are recognised when parsing but have no conversion: they only merge
// with the identical unit.
const OPAQUE_UNITS = [
  "clove",
  "can",
  "pinch",
  "dash",
  "bunch",
  "package",
  "stick",
  "slice",
  "head",
  "sprig",
  "bag",
  "jar",
  "bottle",
  "box",
];

const ALIAS_TO_UNIT = new Map();
for (const [canonical, { aliases }] of Object.entries(UNITS)) {
  for (const alias of aliases) ALIAS_TO_UNIT.set(alias, canonical);
}
for (const unit of OPAQUE_UNITS) {
  ALIAS_TO_UNIT.set(unit, unit);
  ALIAS_TO_UNIT.set(`${unit}s`, unit);
  ALIAS_TO_UNIT.set(`${unit}es`, unit);
}

// Longest first so "fl oz" wins over "oz" and "tbsp" over "t...".
const UNIT_PATTERN = [...ALIAS_TO_UNIT.keys()]
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.\s]/g, (ch) => (ch === "." ? "\\." : "\\s+")))
  .join("|");

const UNICODE_FRACTIONS = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};
const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

// "1 1/2", "1½", "½", "1/2", "1.5", "2" — and a range like "2-3" (takes the upper
// bound, since a shopping list should cover the larger need).
const NUMBER = `(?:\\d+\\s+\\d+/\\d+|\\d+\\s*[${FRACTION_CHARS}]|[${FRACTION_CHARS}]|\\d+/\\d+|\\d*\\.\\d+|\\d+)`;
const QUANTITY = `${NUMBER}(?:\\s*(?:-|–|to)\\s*${NUMBER})?`;
const LEADING = new RegExp(
  `^(${QUANTITY})(?=\\s|[a-zA-Z]|$)\\s*(?:(${UNIT_PATTERN})(?=\\s|\\.|,|$)\\.?)?\\s*(?:of\\s+)?(.*)$`,
  "i",
);
const TRAILING = new RegExp(
  `^(.*?)(?:\\s*[:,\\-–]\\s*|\\s+[x×]\\s*|\\s+)(${QUANTITY})\\s*(?:(${UNIT_PATTERN})\\.?)?$`,
  "i",
);

// A further quantity glued onto the first: "1 cup + 2 tbsp", "1 lb 4 oz", "1 cup plus 2 tbsp".
// The unit is mandatory so "1 cup 2% milk" is not misread.
const COMPOUND = new RegExp(
  `^(?:\\+|&|and|plus)?\\s*(${QUANTITY})\\s*(${UNIT_PATTERN})(?=\\s|\\.|,|$)\\.?\\s*(?:of\\s+)?(.*)$`,
  "i",
);

export function parseNumber(text) {
  const s = text.trim();
  const range = s.split(/\s*(?:-|–|\bto\b)\s*/i);
  if (range.length > 1 && range.every(Boolean)) {
    return Math.max(...range.map(parseNumber));
  }

  let total = 0;
  for (const part of s
    .replace(new RegExp(`(\\d)([${FRACTION_CHARS}])`, "g"), "$1 $2")
    .split(/\s+/)) {
    if (UNICODE_FRACTIONS[part] != null) total += UNICODE_FRACTIONS[part];
    else if (part.includes("/")) {
      const [n, d] = part.split("/").map(Number);
      total += n / d;
    } else total += Number(part);
  }
  return total;
}

export function normalizeUnit(unit) {
  if (typeof unit !== "string") return "";
  const cleaned = unit.trim().toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ");
  if (!cleaned) return "";
  return ALIAS_TO_UNIT.get(cleaned) ?? cleaned.replace(/s$/, "");
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function cleanName(name) {
  return name
    .trim()
    .replace(/^[\s,:;+\-–]+|[\s,:;+\-–]+$/g, "")
    .replace(/\s+/g, " ");
}

// Returns { name, amount, unit } or null for a blank / bullet-only line. A line
// with no recognisable quantity is kept whole as a name with an empty amount, so
// nothing the user pasted is silently dropped.
export function parseIngredientLine(rawLine) {
  const line = rawLine
    .replace(/^\s*(?:[-*•▪◦·]|\[[ xX]?\]|\d+[.)])\s+/, "")
    .replace(/^\s*[-*•▪◦·]\s*/, "")
    .trim();
  if (!line) return null;

  let match = line.match(LEADING);
  if (match && cleanName(match[3])) {
    let amount = parseNumber(match[1]);
    let unit = normalizeUnit(match[2]);
    let rest = match[3];

    // Fold in extra convertible quantities ("1 cup + 2 tbsp" -> 1.13 cup). If the
    // units cannot be added, stop and leave the remainder in the name.
    for (let extra = rest.match(COMPOUND); extra; extra = rest.match(COMPOUND)) {
      const extraUnit = normalizeUnit(extra[2]);
      if (!UNITS[unit] || !UNITS[extraUnit] || UNITS[unit].family !== UNITS[extraUnit].family) {
        break;
      }
      const extraAmount = parseNumber(extra[1]);
      const larger = toBase(extraAmount, extraUnit) > toBase(amount, unit) ? extraUnit : unit;
      amount = fromBase(toBase(amount, unit) + toBase(extraAmount, extraUnit), larger);
      unit = larger;
      rest = extra[3];
    }

    if (cleanName(rest)) {
      return { name: cleanName(rest), amount: round(amount), unit: unit || undefined };
    }
  }

  match = line.match(TRAILING);
  if (match && cleanName(match[1])) {
    return {
      name: cleanName(match[1]),
      amount: round(parseNumber(match[2])),
      unit: normalizeUnit(match[3]) || undefined,
    };
  }

  return { name: cleanName(line), amount: "", unit: undefined };
}

// Every non-blank line paired with its deterministic parse, so a caller can
// decide which lines are worth a second opinion.
export function parseIngredientLines(text) {
  return text
    .split(/\r?\n/)
    .map((raw) => ({ raw: raw.trim(), parsed: parseIngredientLine(raw) }))
    .filter(
      ({ parsed }) =>
        parsed && parsed.name && Number.isFinite(parsed.amount === "" ? 0 : parsed.amount),
    );
}

export function parseIngredientText(text) {
  return parseIngredientLines(text).map(({ parsed }) => parsed);
}

// A quantity exactly as written ("1 1/2", "½", "2-3"); null if it is anything else.
const QUANTITY_ONLY = new RegExp(`^${QUANTITY}$`, "i");
export function parseQuantity(text) {
  if (typeof text !== "string" || !QUANTITY_ONLY.test(text.trim())) return null;
  const n = parseNumber(text);
  return Number.isFinite(n) ? round(n) : null;
}

export function cleanIngredientName(name) {
  return typeof name === "string" ? cleanName(name) : "";
}

export function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Key under which two amounts can be added: convertible units share a family,
// everything else must match its unit exactly.
function additionKey(unit) {
  const normalized = normalizeUnit(unit);
  return UNITS[normalized] ? UNITS[normalized].family : `unit:${normalized}`;
}

function toBase(amount, unit) {
  const def = UNITS[normalizeUnit(unit)];
  return def ? amount * def.factor : amount;
}

function fromBase(base, unit) {
  const def = UNITS[normalizeUnit(unit)];
  return def ? base / def.factor : base;
}

function isNumeric(amount) {
  return typeof amount === "number" && Number.isFinite(amount);
}

// Sums a set of list items that are all the same ingredient. Items whose amounts
// cannot be added (free-text amounts, or a volume next to a weight) are returned
// untouched rather than guessed at.
function sumItems(items) {
  const buckets = new Map();
  const untouched = [];

  for (const item of items) {
    const { amount, unit } = item.ingredient;
    if (!isNumeric(amount)) {
      untouched.push(item);
      continue;
    }
    const key = additionKey(unit);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }

  const merged = [];
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      merged.push(bucket[0]);
      continue;
    }
    const totalBase = bucket.reduce(
      (sum, { ingredient }) => sum + toBase(ingredient.amount, ingredient.unit),
      0,
    );
    // Report in the unit of the largest contribution, so 2 cups + 1 tbsp stays in cups.
    const largest = bucket.reduce((a, b) =>
      toBase(b.ingredient.amount, b.ingredient.unit) >
      toBase(a.ingredient.amount, a.ingredient.unit)
        ? b
        : a,
    );
    const unit = largest.ingredient.unit;
    merged.push({
      ...bucket[0],
      ingredient: {
        ...bucket[0].ingredient,
        amount: round(fromBase(totalBase, unit)),
        unit: unit || undefined,
      },
    });
  }
  return [...merged, ...untouched];
}

// Union-find over item ids: exact-name matches plus the model's suggested
// clusters are joined into one set of "same ingredient" groups.
function clusterIds(ids, suggestedClusters) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  };

  for (const cluster of suggestedClusters) {
    if (!Array.isArray(cluster)) continue;
    const valid = cluster.map(String).filter((id) => parent.has(id));
    valid.slice(1).forEach((id) => union(valid[0], id));
  }
  return find;
}

// groups: [{ name, items: [{ ingredient, completed }] }]
// suggestedClusters: arrays of item ids the model believes are the same ingredient.
// Only unchecked items are merged — a checked item is already in the basket.
// Returns new groups; the position of a merged item is where its first member was.
export function mergeDuplicateItems(groups, suggestedClusters = []) {
  const candidates = groups.flatMap((g) => g.items).filter((item) => !item.completed);
  const ids = candidates.map((item) => String(item.ingredient.id));
  // Exact (normalised) name matches always merge, with or without the model.
  const byName = new Map();
  candidates.forEach((item) => {
    const name = normalizeName(item.ingredient.name);
    if (!name) return;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(String(item.ingredient.id));
  });
  const find = clusterIds(ids, [...suggestedClusters, ...byName.values()]);

  const rootOf = new Map();
  candidates.forEach((item) => {
    const id = String(item.ingredient.id);
    rootOf.set(id, find(id));
  });

  const members = new Map();
  candidates.forEach((item) => {
    const root = rootOf.get(String(item.ingredient.id));
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(item);
  });

  const replacement = new Map(); // first member's object -> merged items
  const dropped = new Set();
  for (const items of members.values()) {
    if (items.length < 2) continue;
    const merged = sumItems(items);
    if (merged.length === items.length) continue;
    replacement.set(items[0], merged);
    items.slice(1).forEach((i) => dropped.add(i));
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.flatMap((item) => {
        if (dropped.has(item)) return [];
        return replacement.get(item) ?? [item];
      }),
    }))
    .filter((group) => group.items.length > 0);
}
