import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateThumbnail,
  deleteThumbnail,
  saveUploadedImage,
} from "../../src/services/thumbnail.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBNAILS_DIR = path.join(__dirname, "../../public/thumbnails");

function makeFetchWithJpeg(jpeg) {
  return async () => ({
    ok: true,
    headers: { get: () => null },
    arrayBuffer: async () => {
      const ab = new ArrayBuffer(jpeg.byteLength);
      new Uint8Array(ab).set(jpeg);
      return ab;
    },
  });
}

describe("thumbnail.service", () => {
  let tinyJpeg;

  before(async () => {
    tinyJpeg = await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .jpeg()
      .toBuffer();
  });

  describe("generateThumbnail", () => {
    test("returns null when imageUrl is falsy", async () => {
      assert.equal(await generateThumbnail("r1", null), null);
      assert.equal(await generateThumbnail("r1", ""), null);
      assert.equal(await generateThumbnail("r1", undefined), null);
    });

    test("returns null when fetch returns a non-ok response", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: false, status: 404 });
      try {
        assert.equal(await generateThumbnail("r-404", "https://example.com/img.jpg"), null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns null when fetch throws", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Network error");
      };
      try {
        assert.equal(await generateThumbnail("r-throw", "https://example.com/img.jpg"), null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("returns null when content-length exceeds 20MB", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: (h) => (h === "content-length" ? String(21 * 1024 * 1024) : null) },
      });
      try {
        assert.equal(await generateThumbnail("r-oversize", "https://example.com/img.jpg"), null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("writes resized file to disk and returns URL on success", async () => {
      const originalFetch = globalThis.fetch;
      const recipeId = "r-thumb-success";
      globalThis.fetch = makeFetchWithJpeg(tinyJpeg);
      try {
        const result = await generateThumbnail(recipeId, "https://example.com/img.jpg");
        assert.ok(result, "should return a URL");
        assert.match(result, /\/thumbnails\/r-thumb-success\.jpg\?v=\d+$/);
        const stat = await fs.stat(path.join(THUMBNAILS_DIR, `${recipeId}.jpg`));
        assert.ok(stat.size > 0, "thumbnail file should exist and have content");
      } finally {
        globalThis.fetch = originalFetch;
        await fs.unlink(path.join(THUMBNAILS_DIR, `${recipeId}.jpg`)).catch(() => {});
      }
    });
  });

  describe("deleteThumbnail", () => {
    test("removes the file if it exists", async () => {
      const recipeId = "r-thumb-delete";
      const filePath = path.join(THUMBNAILS_DIR, `${recipeId}.jpg`);
      await fs.writeFile(filePath, "fake content");
      await deleteThumbnail(recipeId);
      await assert.rejects(() => fs.access(filePath), "file should no longer exist");
    });

    test("does not throw when file does not exist", async () => {
      await assert.doesNotReject(() => deleteThumbnail("r-thumb-nonexistent"));
    });
  });

  describe("saveUploadedImage", () => {
    test("returns a URL with upload- prefix and writes file to disk with non-zero size", async () => {
      const result = await saveUploadedImage(tinyJpeg);
      assert.ok(result, "should return a URL");
      assert.match(result, /\/thumbnails\/upload-[0-9a-f-]+\.jpg\?v=\d+$/);
      const filename = result.split("/thumbnails/")[1].split("?")[0];
      const filePath = path.join(THUMBNAILS_DIR, filename);
      try {
        const stat = await fs.stat(filePath);
        assert.ok(stat.size > 0, "thumbnail file should have content");
      } finally {
        await fs.unlink(filePath).catch(() => {});
      }
    });

    test("returns null for an invalid buffer", async () => {
      const result = await saveUploadedImage(Buffer.from("not-an-image"));
      assert.equal(result, null);
    });

    test("generates a unique filename on each call", async () => {
      const [url1, url2] = await Promise.all([
        saveUploadedImage(tinyJpeg),
        saveUploadedImage(tinyJpeg),
      ]);
      assert.ok(url1 && url2, "both calls should return a URL");
      assert.notEqual(url1, url2, "URLs should be unique");
      for (const url of [url1, url2]) {
        const filename = url.split("/thumbnails/")[1].split("?")[0];
        await fs.unlink(path.join(THUMBNAILS_DIR, filename)).catch(() => {});
      }
    });
  });
});
