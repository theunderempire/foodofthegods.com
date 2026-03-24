import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBNAILS_DIR = path.join(__dirname, "../../public/thumbnails");
const THUMBNAIL_WIDTH = 800;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024; // 20MB

export async function generateThumbnail(recipeId, imageUrl) {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SOURCE_BYTES) {
      console.warn(`[thumbnail] skipping oversized source image for recipe "${recipeId}"`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `${recipeId}.jpg`;
    await sharp(buffer)
      .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(path.join(THUMBNAILS_DIR, filename));

    const apiBase = process.env.VITE_API_BASE_URL ?? "";
    return `${apiBase}/thumbnails/${filename}?v=${Date.now()}`;
  } catch (err) {
    console.warn(
      `[thumbnail] failed to generate thumbnail for recipe "${recipeId}": ${err.message}`,
    );
    return null;
  }
}

export async function deleteThumbnail(recipeId) {
  try {
    await fs.unlink(path.join(THUMBNAILS_DIR, `${recipeId}.jpg`));
  } catch {
    // file may not exist, ignore
  }
}
