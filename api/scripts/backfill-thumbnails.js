#!/usr/bin/env node
/**
 * Backfill thumbnails for all recipes that have an imageUrl but no local thumbnail.
 * Run after seeding or to retroactively cache images for existing recipes.
 *
 * Usage (inside the API container):
 *   npm run backfill-thumbnails           # skips recipes already using a local URL
 *   npm run backfill-thumbnails -- --force  # reprocesses all recipes
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import monk from "monk";
import { generateThumbnail } from "../src/services/thumbnail.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../.env") });

const { DB_USERNAME, DB_PASSWORD, DB_HOST_NAME, DB_NAME, VITE_API_BASE_URL } = process.env;
const force = process.argv.includes("--force");

async function main() {
  const db = monk(
    `${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST_NAME}:27017/${DB_NAME}?authSource=admin`,
  );
  const recipes = db.get("recipelist");

  try {
    await db.executeWhenOpened();
    console.log("Connected to database.");

    const query = force
      ? { imageUrl: { $exists: true, $ne: "" } }
      : {
          imageUrl: { $exists: true, $ne: "" },
          $nor: [{ imageUrl: { $regex: `^${VITE_API_BASE_URL}/thumbnails/` } }],
        };

    const toProcess = await recipes.find(query);
    console.log(`Found ${toProcess.length} recipe(s) to backfill${force ? " (--force)" : ""}.`);

    let success = 0;
    let failed = 0;

    for (const recipe of toProcess) {
      process.stdout.write(`  "${recipe.name}" (${recipe._id}) ... `);
      const thumbnailUrl = await generateThumbnail(recipe._id, recipe.imageUrl);
      if (thumbnailUrl) {
        await recipes.update({ _id: recipe._id }, { $set: { imageUrl: thumbnailUrl } });
        console.log("done");
        success++;
      } else {
        console.log("skipped (download failed)");
        failed++;
      }
    }

    console.log(`\nBackfill complete: ${success} succeeded, ${failed} skipped.`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
