import { describe, test, before } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import recipesRouter from "../../src/routes/recipes.js";
import { makeRes, makeReq } from "../helpers/mocks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const THUMBNAILS_DIR = path.join(__dirname, "../../public/thumbnails");

// The POST /upload-image handler is an inline arrow function registered on the
// router, not an exported symbol. Rather than add an export purely for tests,
// pull the handler back out of the router's own route table and call it
// directly. The route registers two handlers — multer's upload.single("image")
// and then the request handler — so the last layer is the one under test; the
// multer layer is deliberately skipped, which is also what lets these tests set
// req.file by hand instead of building a multipart body.
function getUploadImageHandler() {
  const layer = recipesRouter.stack.find((l) => l.route?.path === "/upload-image");
  assert.ok(layer, "POST /upload-image should be registered on the recipes router");
  const handlers = layer.route.stack;
  assert.equal(handlers.length, 2, "expected upload.single('image') plus one request handler");
  return handlers[handlers.length - 1].handle;
}

describe("POST /recipes/upload-image", () => {
  let handler;
  let tinyJpeg;

  before(async () => {
    handler = getUploadImageHandler();
    // Generated in-process by sharp: no network, no fixture file on disk.
    tinyJpeg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
  });

  test("returns 400 when no file was uploaded", async () => {
    const req = makeReq();
    const res = makeRes();

    await handler(req, res);

    assert.equal(res._status, 400);
    assert.deepEqual(res._body, { success: false, data: "No image file provided" });
  });

  test("returns 500 when the image cannot be processed", async () => {
    // saveUploadedImage is imported directly by the route, so it is not
    // stubbable without editing src. Driving it with a buffer sharp cannot
    // decode makes it return null for real, which exercises the same branch
    // (and still touches nothing but local CPU).
    const req = makeReq();
    req.file = { buffer: Buffer.from("this is definitely not an image") };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res._status, 500);
    assert.deepEqual(res._body, { success: false, data: "Failed to process image" });
  });

  test("returns the saved imageUrl on success", async () => {
    const req = makeReq();
    req.file = { buffer: tinyJpeg };
    const res = makeRes();

    await handler(req, res);

    assert.equal(res._status, 200, "success path leaves the default status");
    assert.equal(res._body.success, true);
    const { imageUrl } = res._body.data;
    assert.match(imageUrl, /\/thumbnails\/upload-[0-9a-f-]+\.jpg\?v=\d+$/);

    const filename = imageUrl.split("/thumbnails/")[1].split("?")[0];
    const filePath = path.join(THUMBNAILS_DIR, filename);
    try {
      const stat = await fs.stat(filePath);
      assert.ok(stat.size > 0, "the uploaded image should have been written to disk");
    } finally {
      await fs.unlink(filePath).catch(() => {});
    }
  });
});
