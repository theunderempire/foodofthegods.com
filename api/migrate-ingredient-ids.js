/**
 * Migration: assign UUID ingredient IDs
 *
 * Finds all ingredient list documents in the database and replaces every
 * ingredient.id with a fresh UUID, eliminating any duplicates that
 * accumulated when recipe ingredients (with sequential ids like 1, 2, 3)
 * were added from multiple recipes into the same list.
 *
 * Safe to re-run — already-valid UUIDs are left untouched.
 *
 * Usage:
 *   node api/migrate-ingredient-ids.js
 *   node api/migrate-ingredient-ids.js --dry-run
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
  const collection = db.get("ingredientlist");
  const docs = await collection.find({});

  console.log(`Found ${docs.length} ingredient list document(s).${isDryRun ? " (dry run)" : ""}`);

  let totalLists = 0;
  let totalReassigned = 0;

  for (const doc of docs) {
    const groups = doc.ingredientList?.groups;
    if (!groups) continue;

    let reassignedInDoc = 0;

    for (const group of groups) {
      for (const item of group.items ?? []) {
        if (!UUID_REGEX.test(String(item.ingredient.id))) {
          item.ingredient.id = randomUUID();
          reassignedInDoc++;
        }
      }
    }

    if (reassignedInDoc > 0) {
      totalLists++;
      totalReassigned += reassignedInDoc;
      console.log(`  user="${doc.userId}": reassigning ${reassignedInDoc} ingredient id(s)`);
      if (!isDryRun) {
        await collection.update({ _id: doc._id }, { $set: { ingredientList: doc.ingredientList } });
      }
    }
  }

  console.log(
    `\nDone. ${totalReassigned} id(s) reassigned across ${totalLists} list(s).` +
      (isDryRun ? " (no changes written)" : ""),
  );
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => db.close());
