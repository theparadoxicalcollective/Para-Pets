import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORED_SCENE_HEIGHT,
  AUTHORED_SCENE_WIDTH,
  authoredPointToPercent,
  dragAuthoredPercentOffset,
} from "../client/src/lib/authoredScenePlacement";
import { dragActivePetAnchor, dragPetPlacement } from "../client/src/lib/petGroundPlacement";

test("authored scene uses a stable square coordinate plane", () => {
  assert.equal(AUTHORED_SCENE_WIDTH, 1000);
  assert.equal(AUTHORED_SCENE_HEIGHT, 1000);
  assert.deepEqual(authoredPointToPercent({ x: 500, y: 900 }), { x: 50, y: 90 });
});

test("same proportional drag produces same authored movement on every rendered size", () => {
  const start = { x: 4, y: -3 };
  assert.deepEqual(dragAuthoredPercentOffset(start, 39, 84.4, 390), { x: 14, y: 18.641025641025642 });
  assert.deepEqual(dragAuthoredPercentOffset(start, 78, 168.8, 780), { x: 14, y: 18.641025641025642 });
  assert.deepEqual(dragAuthoredPercentOffset(start, 144, 311.6307692307692, 1440), { x: 14, y: 18.641025641025642 });
});

test("pet and shared active-pet anchor use the authored placement converter", () => {
  const pet = { x: 0, y: 0, scale: 1, eyes: {} };
  assert.deepEqual(dragPetPlacement(pet, 39, 39, 390), { ...pet, x: 10, y: 10 });
  assert.deepEqual(dragPetPlacement(pet, 78, 78, 780), { ...pet, x: 10, y: 10 });
  assert.deepEqual(dragActivePetAnchor({ x: 0, y: 0 }, 39, 39, 390), { x: 10, y: 10 });
  assert.deepEqual(dragActivePetAnchor({ x: 0, y: 0 }, 78, 78, 780), { x: 10, y: 10 });
});

test("authored drag remains bounded and ignores invalid rendered geometry", () => {
  assert.deepEqual(dragAuthoredPercentOffset({ x: 99, y: -99 }, 1000, -1000, 390), { x: 100, y: -100 });
  assert.deepEqual(dragAuthoredPercentOffset({ x: 7, y: 8 }, 10, 10, 0), { x: 7, y: 8 });
});
