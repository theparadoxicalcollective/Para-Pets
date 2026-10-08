import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dragScenePercentage } from "../client/src/lib/coordinateContracts";

const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");
const bounds = { minX: 0, maxX: 85, minY: 0, maxY: 105 };

test("World Map and Raid admin drags share background-relative conversion", () => {
  assert.match(map, /dragScenePercentage\(/);
  assert.match(map, /setRaidDragPos\(dragScenePercentage\(/);
  assert.match(map, /setDragPos\(\{ id: dragRef\.current\.worldId, \.\.\.position \}\)/);
  assert.match(map, /ref=\{mapRef\}/);
});

test("same relative drag persists same authored percentages at phone and tablet sizes", () => {
  for (const [width, height] of [[390, 844], [780, 1688], [1200, 2600]]) {
    const next = dragScenePercentage({ x: 40, y: 60 }, { x: width * 0.1, y: height * -0.2 }, { width, height }, bounds);
    assert.ok(Math.abs(next.x - 50) < 1e-10);
    assert.ok(Math.abs(next.y - 40) < 1e-10);
  }
});

test("existing map bounds and invalid geometry are preserved", () => {
  assert.deepEqual(dragScenePercentage({ x: 80, y: 100 }, { x: 1000, y: 1000 }, { width: 390, height: 844 }, bounds), { x: 85, y: 105 });
  assert.deepEqual(dragScenePercentage({ x: 40, y: 60 }, { x: 100, y: 100 }, { width: 0, height: 844 }, bounds), { x: 40, y: 60 });
});
