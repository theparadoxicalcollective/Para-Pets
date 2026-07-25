import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

const ENTER_ASSETS = [
  "Photoroom_20260705_50251_PM_1783290164113.png",
  "Photoroom_20260705_50531_PM_1783290164113.png",
  "Photoroom_20260705_50328_PM_1783290164113.png",
  "Photoroom_20260705_50615_PM_1783290164113.png",
  "Photoroom_20260705_50445_PM_1783290164113.png",
  "Photoroom_20260705_50251_PM_1783290164113.png",
  "Photoroom_20260705_50531_PM_1783290164113.png",
  "Photoroom_20260705_50328_PM_1783290164113.png",
  "Photoroom_20260705_50615_PM_1783290164113.png",
  "Photoroom_20260705_50445_PM_1783290164113.png",
] as const;

for (const [index, filename] of ENTER_ASSETS.entries()) {
  test(`Tier ${index + 1} Enter binary decodes to visible, tightly bounded PNG artwork`, async () => {
    const path = `attached_assets/${filename}`;
    await access(path);
    const input = await readFile(path);
    const metadata = await sharp(input).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.hasAlpha, true);
    assert.ok(metadata.width && metadata.height);

    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        if (data[(y * info.width + x) * 4 + 3] > 0) {
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
    }
    assert.ok(maxX >= minX && maxY >= minY, "asset must contain visible pixels");
    const bboxCoverage = ((maxX - minX + 1) * (maxY - minY + 1)) / (info.width * info.height);
    assert.ok(bboxCoverage >= 0.9, `transparent padding is excessive (${bboxCoverage})`);
  });
}
