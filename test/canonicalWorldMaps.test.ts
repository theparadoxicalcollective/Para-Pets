import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const MAP_ASSETS = {
  haunted_woods: "ShadowfenMap.png",
  volcanic: "EmbercraftPeakMap.png",
  swamp: "ElysianBayouMap.png",
  desert: "SandspireOasis.png",
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

test("startup reconciliation maps requested worlds and placeholders through the shared registry", () => {
  const source = fs.readFileSync("server/worlds/canonicalWorldMaps.ts", "utf8");
  assert.match(source, /worldId: WORLD_IDS\.hauntedWoods, assetPath: "uploads\/ShadowfenMap\.png"/);
  assert.match(source, /worldId: WORLD_IDS\.elysianBayou, assetPath: "uploads\/ElysianBayouMap\.png"/);
  assert.match(source, /worldId: WORLD_IDS\.volcanic[\s\S]*assetPath: "uploads\/EmbercraftPeakMap\.png"/);
  for (const registryKey of ["frostpeak", "skyRealm", "enchantedGrove", "lostIsland"]) {
    assert.match(source, new RegExp(`worldId: WORLD_IDS\\.${registryKey}, assetPath: "uploads/ShadowfenMap\\.png"`));
  }
  assert.match(source, /worldId: WORLD_IDS\.scorchedDesert, assetPath: "uploads\/SandspireOasis\.png"/);
  assert.match(source, /volcanic_bg_embercraft_peak_2026_08/);
  assert.match(source, /storage\.updateWorld\(worldId, \{ bgUrl \}/);
});

test("Vite standardizes every registered world map canvas to 924x1703", () => {
  const source = fs.readFileSync("vite.config.ts", "utf8");
  assert.match(source, /WORLD_MAP_DESIGN_W = 924/);
  assert.match(source, /WORLD_MAP_DESIGN_H = 1703/);
  assert.match(source, /shared\/worlds\/worldRegistry\.ts/);
  assert.match(source, /fixedMapHeight:\\s\*\\d\+/);
  assert.match(source, /Expected 8 fixedMapHeight entries/);
  assert.match(source, /worldDefinition\?\.fixedMapHeight/);
  assert.doesNotMatch(source, /Could not locate WORLD_FIXED_MAP_H/);
});

test("main world-selection artwork is not replaced by inside-world maps", () => {
  const mapPage = fs.readFileSync("client/src/pages/MapPage.tsx", "utf8");
  for (const filename of Object.values(MAP_ASSETS)) {
    assert.doesNotMatch(mapPage, new RegExp(filename.replace(".", "\\.")));
  }
});
