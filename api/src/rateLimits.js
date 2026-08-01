import rateLimit from "express-rate-limit";

const WINDOW_MS = 15 * 60 * 1000;

// Production defaults are the point of the feature. Non-production needs headroom:
// the e2e suite logs in on nearly every test, so a full run spends most of a
// 30-per-15-minutes budget and a second run inside the window cannot authenticate
// at all. That surfaced as unrelated-looking login timeouts rather than as 429s.
const DEFAULTS = {
  auth: { production: 30, development: 2000 },
  publicRecipe: { production: 300, development: 5000 },
};

export function resolveLimit({ override, isProduction, production, development }) {
  const parsed = Number(override);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return isProduction ? production : development;
}

export function createLimiters(env = process.env) {
  const isProduction = env.NODE_ENV === "production";

  const authLimit = resolveLimit({
    override: env.AUTH_RATE_LIMIT,
    isProduction,
    ...DEFAULTS.auth,
  });
  const publicRecipeLimit = resolveLimit({
    override: env.PUBLIC_RECIPE_RATE_LIMIT,
    isProduction,
    ...DEFAULTS.publicRecipe,
  });

  return {
    limits: { authLimit, publicRecipeLimit },

    // /token and /mail are unauthenticated and the ones worth hammering:
    // credentials, an admin-mail flood, and the set-password token oracle.
    authLimiter: rateLimit({
      windowMs: WINDOW_MS,
      limit: authLimit,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, data: { message: "Too many attempts. Try again later." } },
    }),

    // A recipe id doubles as its share capability, so cap how fast ids can be
    // walked. Authenticated recipe viewing shares this path, so the limit sits well
    // above human browsing and only bites bulk enumeration.
    publicRecipeLimiter: rateLimit({
      windowMs: WINDOW_MS,
      limit: publicRecipeLimit,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, data: "Too many requests." },
    }),
  };
}
