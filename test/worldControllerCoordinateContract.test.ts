import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dragWorldPlacementPercent, WORLD_PLACEMENT_BOUNDS } from "../client/src/worlds/worldAuthoredPlacement";
import { dragScenePercentage } from "../client/src/lib/coordinateContracts";

test("world admin controllers delegate to unified authored scene coordinates", () => {
  const source = readFileSync("client/src/worlds/worldAuthoredPlacement.ts", "utf8");
  assert.match(source, /return dragScenePercentage\(/);
  for (const controller of ["useWorldLocationAdminController", "useWorldDecorAdminController", "useWorldObjectAdminController"]) {
    assert.match(readFileSync(`client/src/worlds/${controller}.ts`, "utf8"), /dragWorldPlacementPercent\(/);
  }
});

test("world placements remain invariant across device-scaled scenes", () => {
  for (const bounds of Object.values(WORLD_PLACEMENT_BOUNDS)) {
    for (const [width, height] of [[390, 844], [780, 1688], [1200, 2600]]) {
      const origin = { x: 30, y: 65 };
      const result = dragWorldPlacementPercent(origin, width * .1, -height * .15, width, height, bounds);
      const unified = dragScenePercentage(origin, { x: width * .1, y: -height * .15 }, { width, height }, { minX: bounds.min, maxX: bounds.max, minY: bounds.min, maxY: bounds.max });
      assert.deepEqual(result, unified);
      assert.ok(Math.abs(result.x - 40) < 1e-9);
      assert.ok(Math.abs(result.y - 50) < 1e-9);
    }
  }
});
