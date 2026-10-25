import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { encodeSceneBackground, SCENE_BACKGROUND_MAX_SIZE } from "../server/sceneBackgroundImage";

test("scenery encoding preserves full-colour pixels and transparency without enlarging artwork", async () => {
  const width = 320;
  const height = 240;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    pixels[offset] = x % 256;
    pixels[offset + 1] = y;
    pixels[offset + 2] = (x + y) % 256;
    pixels[offset + 3] = 64 + (x % 192);
  }
  const input = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const output = await encodeSceneBackground(input);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, "webp");
  assert.deepEqual([metadata.width, metadata.height], [width, height]);
  assert.equal(metadata.hasAlpha, true);
  assert.deepEqual(await sharp(output).ensureAlpha().raw().toBuffer(), pixels);

  // Demonstrate why preserving PNG dimensions alone was insufficient.
  const legacy = await sharp(input).png({ quality: 90 }).toBuffer();
  assert.equal((await sharp(legacy).metadata()).isPalette, true);
  assert.notDeepEqual(await sharp(legacy).ensureAlpha().raw().toBuffer(), pixels);
});

test("larger source backgrounds retain detail beyond the former world/interior limit", async () => {
  const input = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "#ad803a" } }).png().toBuffer();
  const output = await encodeSceneBackground(input);
  const metadata = await sharp(output).metadata();
  assert.deepEqual([metadata.width, metadata.height], [2400, 3200]);
});

test("oversized backgrounds are bounded proportionally without cropping", async () => {
  assert.equal(SCENE_BACKGROUND_MAX_SIZE, 4096);
  const input = await sharp({ create: { width: 4608, height: 2304, channels: 3, background: "#294625" } }).png().toBuffer();
  const metadata = await sharp(await encodeSceneBackground(input)).metadata();
  assert.deepEqual([metadata.width, metadata.height], [4096, 2048]);
});
