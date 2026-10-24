import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";
import { parkVisibleTerrainBounds, parkTerrainCellWindow, parkTerrainNoise } from "../client/src/lib/petParkTerrain";

test("painterly terrain samples only camera-visible world across expansion tiers and devices", () => {
  for (const [width, height] of [[390, 844], [820, 1180], [900, 1300], [1440, 900]]) {
    for (const level of [1, 2, 3, 4]) {
      for (const zoom of [0.7, 1, 1.6]) {
        const g = parkCameraGeometry(width, height, level, zoom);
        for (const pan of [{ x: 0, y: 0 }, { x: -g.limitX / 2, y: -g.limitY / 2 }, { x: -g.limitX, y: -g.limitY }]) {
          const p = parkClampCamera(pan, g);
          const bounds = parkVisibleTerrainBounds({
            viewportWidth: width, viewportHeight: height, worldWidth: g.worldWidth,
            worldHeight: g.worldHeight, scale: g.scale, panX: p.x, panY: p.y,
          });
          assert.ok(bounds.left >= 0 && bounds.top >= 0);
          assert.ok(bounds.right <= g.worldWidth && bounds.bottom <= g.worldHeight);
          assert.ok(bounds.right > bounds.left && bounds.bottom > bounds.top);
          const cells = parkTerrainCellWindow(bounds, 55, 57, 1);
          const count = (cells.maxX - cells.minX + 1) * (cells.maxY - cells.minY + 1);
          // Never allocate/draw the entire four-tier world to fill one screen.
          assert.ok(count < 10000, "terrain sampling should remain viewport-bounded");
        }
      }
    }
  }
});

test("grass pattern is deterministic in world coordinates and not reseeded by panning", () => {
  for (const [x, y] of [[0, 0], [42, 17], [105, 221], [400, 750]]) {
    const sample = parkTerrainNoise(x, y, 23);
    assert.equal(sample, parkTerrainNoise(x, y, 23));
    assert.ok(sample >= 0 && sample < 1);
  }
  assert.notEqual(parkTerrainNoise(42, 17, 23), parkTerrainNoise(43, 17, 23));
  const a = parkTerrainCellWindow({ left: 200, top: 300, right: 600, bottom: 700 }, 55, 57);
  const b = parkTerrainCellWindow({ left: 300, top: 350, right: 800, bottom: 900 }, 55, 57);
  const commonX = Math.max(a.minX, b.minX);
  const commonY = Math.max(a.minY, b.minY);
  assert.ok(commonX <= Math.min(a.maxX, b.maxX));
  assert.ok(commonY <= Math.min(a.maxY, b.maxY));
  assert.equal(parkTerrainNoise(commonX, commonY, 22), parkTerrainNoise(commonX, commonY, 22));
});

test("terrain is visual-only behind the existing interactive world and keeps original gestures", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const painter = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");
  assert.match(page, /<PetParkTerrain/);
  assert.doesNotMatch(page, /radial-gradient\(ellipse at 24% 40%/);
  assert.match(page, /onPointerDown=\{e => startPlacement/);
  assert.match(page, /onWheel=\{e =>/);
  assert.match(page, /parkExpansionCameraPan\(/);
  assert.match(page, /<PetAnimator /);
  assert.match(painter, /pointer-events-none/);
  assert.match(painter, /ctx\.clip\(\)/);
  assert.match(painter, /requestAnimationFrame/);
  assert.match(painter, /Math\.min\(window\.devicePixelRatio \|\| 1, 1\.5\)/);
  assert.doesNotMatch(painter, /document\.createElement\(["']canvas/);
});
