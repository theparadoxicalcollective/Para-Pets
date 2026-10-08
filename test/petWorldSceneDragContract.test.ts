import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dragScenePercentage } from "../client/src/lib/coordinateContracts";

const source = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");

test("Pet World admin locations decor and doors use scene-relative drags", () => {
  assert.match(source, /dragScenePercentage/);
  assert.match(source, /x: locDragRef\.current\.origPosX/);
  assert.match(source, /x: decorDragRef\.current\.origPosX/);
  assert.match(source, /x: doorDragRef\.current\.origPosX/);
  assert.match(source, /minX: -10, maxX: 110, minY: -10, maxY: 110/);
  assert.match(source, /minX: 0, maxX: 100, minY: 0, maxY: 100/);
  assert.match(source, /minX: 2, maxX: 98, minY: 2, maxY: 98/);
});

test("admin drag saves equivalent positions on proportionally scaled backgrounds", () => {
  const bounds = { minX: -10, maxX: 110, minY: -10, maxY: 110 };
  for (const [width, height] of [[390, 844], [780, 1688], [1200, 2600]]) {
    const result = dragScenePercentage({ x: 32, y: 58 }, { x: width * 0.15, y: height * -0.1 }, { width, height }, bounds);
    assert.ok(Math.abs(result.x - 47) < 1e-9);
    assert.ok(Math.abs(result.y - 48) < 1e-9);
  }
});
