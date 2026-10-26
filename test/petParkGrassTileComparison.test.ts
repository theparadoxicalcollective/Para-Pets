import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";
import { parkVisibleTerrainBounds, parkTerrainCellWindow } from "../client/src/lib/petParkTerrain";

const canvas = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");
const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const tilePath = "attached_assets/uploads/GrassTile.png";
const tileWorldSize = Number(canvas.match(/GRASS_TILE_WORLD_SIZE = (\d+)/)?.[1]);

test("Pet Park uses the committed GrassTile image asset, not a remote or runtime-upload URL", () => {
  const image = readFileSync(tilePath);
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "GrassTile must be a PNG");
  assert.ok(image.readUInt32BE(16) > 0 && image.readUInt32BE(20) > 0, "GrassTile must have valid dimensions");
  assert.match(canvas, /import grassTileUrl from "@assets\/uploads\/GrassTile\.png"/);
  assert.match(canvas, /image\.src = grassTileUrl/);
  assert.match(canvas, /image\.onload = \(\) => setGrassImage\(image\)/);
  assert.match(canvas, /paintGrassTile\(ctx, view, grassImage\)/);
});

test("tile positions are world anchored, viewport bounded, and consistent across zoom and expansion", () => {
  assert.equal(tileWorldSize, 512);
  assert.match(canvas, /ctx\.translate\(view\.panX, view\.panY\)/);
  assert.match(canvas, /ctx\.scale\(view\.scale, view\.scale\)/);
  assert.match(canvas, /ctx\.drawImage\(image, x \* GRASS_TILE_WORLD_SIZE, y \* GRASS_TILE_WORLD_SIZE/);
  assert.match(canvas, /ctx\.clip\(\)/);
  for (const [width, height] of [[390, 844], [820, 1180], [1100, 1700], [1440, 900]]) {
    for (const level of [1, 2, 3, 4]) {
      for (const zoom of [0.7, 1, 1.6]) {
        const geometry = parkCameraGeometry(width, height, level, zoom);
        const positions = [{ x: 0, y: 0 }, { x: -geometry.limitX / 2, y: -geometry.limitY / 2 }, { x: -geometry.limitX, y: -geometry.limitY }];
        for (const pan of positions) {
          const safe = parkClampCamera(pan, geometry);
          const bounds = parkVisibleTerrainBounds({
            viewportWidth: width, viewportHeight: height,
            worldWidth: geometry.worldWidth, worldHeight: geometry.worldHeight,
            scale: geometry.scale, panX: safe.x, panY: safe.y,
          });
          const cells = parkTerrainCellWindow(bounds, tileWorldSize, tileWorldSize, 0);
          const tileCount = (cells.maxX - cells.minX + 1) * (cells.maxY - cells.minY + 1);
          assert.ok(tileCount > 0 && tileCount < 100, `screen renders bounded tiles: ${tileCount}`);
          assert.equal(cells.minX * tileWorldSize % tileWorldSize, 0);
          assert.equal(cells.minY * tileWorldSize % tileWorldSize, 0);
        }
      }
    }
  }
});

test("admin can compare GrassTile with the unchanged original without moving saved park items", () => {
  assert.match(park, /useState<ParkGrassMode>\("tile"\)/);
  assert.match(park, /<PetParkTerrain viewportWidth=\{viewportSize\.width\} grassMode=\{grassMode\}/);
  assert.match(park, /scene\?\.canEditPark && !activeBuilding && !paintMode && !showCreator/);
  assert.match(park, /aria-label="Compare Pet Park grass"/);
  assert.match(park, /aria-pressed=\{grassMode === "tile"\}/);
  assert.match(park, /aria-pressed=\{grassMode === "procedural"\}/);
  assert.match(park, /setGrassMode\("procedural"\)/);
  assert.match(canvas, /if \(view\.grassMode !== "procedural" && grassImage\)/);
  assert.match(canvas, /paintTerrain\(ctx, view\)/);
  assert.match(canvas, /pointer-events-none/);
  assert.match(park, /parkExpansionCameraPan\(/);
  assert.match(park, /startPlacement\(e, "item", item\)/);
});
