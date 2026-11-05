import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkVisibleTerrainBounds, parkTerrainCellWindow } from "../client/src/lib/petParkTerrain";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const ground = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");

test("Pet Park uses one original forest-green ground, not GrassTile or a comparison toggle", () => {
  assert.match(page, /<PetParkTerrain viewportWidth=\{viewportSize\.width\}/);
  assert.doesNotMatch(page, /Compare Pet Park grass|setGrassMode|GrassTile|grassMode/);
  assert.doesNotMatch(ground, /GrassTile|paintGrassTile|grassMode|new window\.Image/);
  assert.match(ground, /paintTerrain\(ctx, view\)/);
  assert.match(ground, /ctx\.fillStyle = "#2c4934"/);
  assert.doesNotMatch(ground, /#6d8754/);
  assert.match(ground, /pointer-events-none/);
  assert.match(ground, /requestAnimationFrame/);
});

test("forest ground stays camera-aligned without altering saved objects across devices", () => {
  assert.match(page, /startPlacement\(e, "item", item\)/);
  assert.match(page, /onWheel=\{e =>/);
  assert.match(page, /parkExpansionCameraPan\(/);
  for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) {
    for (const level of [1, 2, 3, 4]) {
      const g = parkCameraGeometry(width, height, level, 0.7);
      const camera = parkClampCamera({ x: -g.limitX / 2, y: -g.limitY / 2 }, g);
      const bounds = parkVisibleTerrainBounds({
        viewportWidth: width, viewportHeight: height,
        worldWidth: g.worldWidth, worldHeight: g.worldHeight,
        scale: g.scale, panX: camera.x, panY: camera.y,
      });
      const window = parkTerrainCellWindow(bounds, 120, 112, 1);
      const count = (window.maxX - window.minX + 1) * (window.maxY - window.minY + 1);
      assert.ok(count < 10000, "render only visible terrain cells");
    }
  }
});
