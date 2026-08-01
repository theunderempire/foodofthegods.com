// The collections had no indexes beyond _id, so the hottest queries in the app
// were full collection scans: every authenticated request looks a user up by
// apiKeyHash or username, and every shopping-list operation looks up by userId.
const INDEXES = [
  { collection: "users", fields: { username: 1 }, options: { unique: true } },
  // Sparse: most users have no API key, and a non-sparse unique index would
  // collide on all the missing values.
  { collection: "users", fields: { apiKeyHash: 1 }, options: { unique: true, sparse: true } },
  // Multikey, used by deleteRecipe to find any remaining owners of a recipe.
  { collection: "users", fields: { recipeList: 1 }, options: {} },
  { collection: "ingredientlist", fields: { userId: 1 }, options: {} },
];

// Index creation is idempotent, but a unique index fails to build if existing
// data already violates it. That is worth shouting about, and it is not worth
// refusing to serve traffic over — so each index is attempted independently and
// a failure is logged rather than thrown.
export async function ensureIndexes(db) {
  const failures = [];

  for (const { collection, fields, options } of INDEXES) {
    const name = `${collection}.${Object.keys(fields).join("_")}`;
    try {
      await db.get(collection).createIndex(fields, options);
    } catch (err) {
      failures.push(name);
      console.error(`[indexes] failed to create ${name}: ${err.message}`);
    }
  }

  if (failures.length) {
    console.error(
      `[indexes] ${failures.length} index(es) missing — queries will fall back to collection scans: ${failures.join(", ")}`,
    );
  } else {
    console.log(`[indexes] ${INDEXES.length} indexes ensured`);
  }

  return { failures };
}
