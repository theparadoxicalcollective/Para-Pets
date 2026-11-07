import test from "node:test";
import assert from "node:assert/strict";
import {
  validWorldArtwork, validPlacementTransform, validDecorEffects,
  validShopIds, worldTerrainCell, belongsToWorld, isWorldTerrainType,
} from "../shared/worlds/worldSceneContent";
import { parkGroundSize } from "../shared/petParkGround";

test("world scene assets are accepted only as bounded uploaded artwork", () => {
  assert.equal(validWorldArtwork("data:image/png;base64,YWJj"), true);
  assert.equal(validWorldArtwork("/api/media/another-world"), false);
  assert.equal(validWorldArtwork("data:image/svg+xml;base64,YWJj"), false);
  assert.equal(validWorldArtwork("data:text/html;base64,YWJj"), false);
});

test("world scene transforms and effect payloads are validated", () => {
  assert.equal(validPlacementTransform({ xPct: 0.2, yPct: 0.3, size: 150, flipped: false, layer: 0 }), true);
  assert.equal(validPlacementTransform({ xPct: 1.1, yPct: 0.3, size: 150, flipped: false, layer: 0 }), false);
  assert.equal(validPlacementTransform({ xPct: 0.2, yPct: 0.3, size: "150", flipped: false, layer: 0 }), false);
  assert.equal(validDecorEffects([]), true);
  assert.equal(validShopIds([]), true);
  assert.equal(validShopIds(["not-uuid"]), false);
  assert.equal(isWorldTerrainType("garden_plot"), true);
  assert.equal(isWorldTerrainType("sleep_spot"), false);
});

test("world IDs isolate the same kind of asset across realms", () => {
  assert.equal(belongsToWorld({ worldId: "haunted_woods" }, "haunted_woods"), true);
  assert.equal(belongsToWorld({ worldId: "haunted_woods" }, "swamp"), false);
});

test("2:1 diamond terrain cells stay consistent at each ground level", () => {
  const world = parkGroundSize(1);
  const center = worldTerrainCell({ xPct: 0.5, yPct: 0.5 }, world, "dirt_path", 150);
  assert.ok(center);
  assert.deepEqual(worldTerrainCell(center, world, "dirt_path", 150), center);
  assert.notEqual(worldTerrainCell(center, world, "stone_path", 150)?.key, center.key);
  assert.equal(worldTerrainCell({ xPct: 0, yPct: 0 }, world, "dirt_path", 150), null);
  assert.equal(worldTerrainCell({ xPct: 0.5, yPct: 0.5 }, world, "dirt_path", 200), null);
});
