import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { optimizeBuiltPngAssets } from "../script/optimize-built-images";

test("large Vite PNGs are replaced by smaller lossless WebP references without changing pixels", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "parapets-images-"));
  const publicDir = path.join(root, "public");
  const assetsDir = path.join(publicDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  try {
    const pngName = "TestArtwork-abc123.png";
    const webpName = "TestArtwork-abc123.webp";
    const pngPath = path.join(assetsDir, pngName);
    const webpPath = path.join(assetsDir, webpName);

    const pixels = Buffer.from([
      255, 0, 0, 255,
      0, 255, 0, 160,
      0, 0, 255, 80,
      240, 200, 20, 1,
    ]);

    await sharp(pixels, { raw: { width: 2, height: 2, channels: 4 } })
      .png({ compressionLevel: 0 })
      .toFile(pngPath);

    await writeFile(path.join(assetsDir, "app.js"), `const art = "/assets/${pngName}";`);
    await writeFile(path.join(assetsDir, "app.css"), `.hero{background-image:url("/assets/${pngName}")}`);
    await writeFile(path.join(publicDir, "index.html"), `<img src="/assets/${pngName}">`);

    const result = await optimizeBuiltPngAssets({
      publicDir,
      minBytes: 1,
      minimumSavingsRatio: -1,
      log: () => {},
    });

    assert.equal(result.optimized, 1);
    assert.equal(result.replacements.get(pngName), webpName);

    const [original, optimized] = await Promise.all([
      sharp(pngPath).raw().toBuffer({ resolveWithObject: true }),
      sharp(webpPath).raw().toBuffer({ resolveWithObject: true }),
    ]);

    assert.equal(optimized.info.width, original.info.width);
    assert.equal(optimized.info.height, original.info.height);
    assert.equal(optimized.info.channels, original.info.channels);
    assert.deepEqual(optimized.data, original.data);

    const [js, css, html] = await Promise.all([
      readFile(path.join(assetsDir, "app.js"), "utf8"),
      readFile(path.join(assetsDir, "app.css"), "utf8"),
      readFile(path.join(publicDir, "index.html"), "utf8"),
    ]);

    assert.match(js, new RegExp(webpName.replace(".", "\\.")));
    assert.match(css, new RegExp(webpName.replace(".", "\\.")));
    assert.match(html, new RegExp(webpName.replace(".", "\\.")));
    assert.doesNotMatch(js, new RegExp(pngName.replace(".", "\\.")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
