import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const MAP_ASSETS = {
  haunted_woods: "ShadowfenMap.png",
  volcanic: "EmbercraftPeakMap.png",
  swamp: "ElysianBayouMap.png",
} as const;

function pngDimensions(filename: string): { width: number; height: number } {
  const file = path.join(process.cwd(), "attached_assets", "uploads", filename);
  assert.ok(fs.existsSync(file), `${filename} should exist in attached_assets/uploads`);
  const fd = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(24);
    assert.equal(fs.readSync(fd, header, 0, header.length, 0), 24);
    assert.equal(header.toString("ascii", 1, 4), "PNG");
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

test("new canonical world map assets exist and are valid PNGs", () => {
  for (const filename of Object.values(MAP_ASSETS)) {
    const { width, height } = pngDimensions(filename);
    assert.ok(width > 0 && height > 0);
  }
});

test("startup reconciliation maps requested worlds and placeholders", () => {
  const source = fs.readFileSync("server/worlds/canonicalWorldMaps.ts", "utf8");
  assert.match(source, /worldId: "haunted_woods", assetPath: "uploads\/ShadowfenMap\.png"/);
  assert.match(source, /worldId: "swamp", assetPath: "uploads\/ElysianBayouMap\.png"/);
  assert.match(source, /worldId: "volcanic"[\s\S]*assetPath: "uploads\/EmbercraftPeakMap\.png"/);
  for (const worldId of ["snowy_mountain", "sky_realm", "enchanted_grove", "island", "desert"]) {
    assert.match(source, new RegExp(`worldId: "${worldId}", assetPath: "uploads/ShadowfenMap\\.png"`));
  }
  assert.match(source, /volcanic_bg_embercraft_peak_2026_08/);
  assert.match(source, /storage\.updateWorld\(worldId, \{ bgUrl \}/);
});

test("Vite standardizes every WorldPage map canvas to 924x1703", () => {
  const source = fs.readFileSync("vite.config.ts", "utf8");
  assert.match(source, /WORLD_MAP_DESIGN_W = 924/);
  assert.match(source, /WORLD_MAP_DESIGN_H = 1703/);
  assert.match(source, /const MAP_W = \$\{WORLD_MAP_DESIGN_W\}/);
  assert.match(source, /const MAP_H_DEFAULT = \$\{WORLD_MAP_DESIGN_H\}/);
  assert.match(source, /WORLD_FIXED_MAP_H/);
});

test("main world-selection artwork is not replaced by inside-world maps", () => {
  const mapPage = fs.readFileSync("client/src/pages/MapPage.tsx", "utf8");
  for (const filename of Object.values(MAP_ASSETS)) {
    assert.doesNotMatch(mapPage, new RegExp(filename.replace(".", "\\.")));
  }
});
