/**
 * Migration: assign UUID ingredient and direction IDs within recipes
 *
 * Finds all recipe documents in the database and replaces every
 * ingredient.id and direction.id with a fresh UUID, eliminating
 * the non-unique sequential/timestamp IDs that accumulated over time.
 *
 * Safe to re-run — already-valid UUIDs are left untouched.
 *
 * Usage:
 *   node api/migrate-recipe-ids.js
 *   node api/migrate-recipe-ids.js --dry-run
 */

import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import monk from "monk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const isDryRun = process.argv.includes("--dry-run");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const db = monk(
  `${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@${process.env.DB_HOST_NAME}:27017/${process.env.DB_NAME}?authSource=admin`,
);

async function migrate() {
  const collection = db.get("recipelist");
  const docs = await collection.find({});

  console.log(`Found ${docs.length} recipe document(s).${isDryRun ? " (dry run)" : ""}`);

  let totalRecipes = 0;
  let totalReassigned = 0;

  for (const doc of docs) {
    let reassignedInDoc = 0;

    for (const ingredient of doc.ingredients ?? []) {
      if (!UUID_REGEX.test(String(ingredient.id))) {
        ingredient.id = randomUUID();
        reassignedInDoc++;
      }
    }

    for (const direction of doc.directions ?? []) {
      if (!UUID_REGEX.test(String(direction.id))) {
        direction.id = randomUUID();
        reassignedInDoc++;
      }
    }

    if (reassignedInDoc > 0) {
      totalRecipes++;
      totalReassigned += reassignedInDoc;
      console.log(`  recipe="${doc.name}" (_id=${doc._id}): reassigning ${reassignedInDoc} id(s)`);
      if (!isDryRun) {
        await collection.update(
          { _id: doc._id },
          { $set: { ingredients: doc.ingredients, directions: doc.directions } },
        );
      }
    }
  }

  console.log(
    `\nDone. ${totalReassigned} id(s) reassigned across ${totalRecipes} recipe(s).` +
      (isDryRun ? " (no changes written)" : ""),
  );
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => db.close());
