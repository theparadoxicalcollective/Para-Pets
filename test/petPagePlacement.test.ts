import assert from "node:assert/strict";
import test from "node:test";
import { composePetPagePlacement, resolvePetPagePlacement } from "../shared/petPagePlacement";

test("legacy pages default to neutral offsets and unchanged pet size", () => {
  assert.deepEqual(resolvePetPagePlacement(undefined, "active"), { x: 0, y: 0, scale: 1 });
  assert.deepEqual(resolvePetPagePlacement({}, "closet"), { x: 0, y: 0, scale: 1 });
});

test("Level Up and Closet inherit Active Pet scale unless explicitly overridden", () => {
  const config = { active: { x: 8, y: -4, scale: 1.4 }, powerUp: { x: -5, y: 3, scale: 0.9 } };
  assert.deepEqual(resolvePetPagePlacement(config, "levelUp"), { x: 0, y: 0, scale: 1.4 });
  assert.deepEqual(resolvePetPagePlacement(config, "closet"), { x: 0, y: 0, scale: 1.4 });
  assert.deepEqual(resolvePetPagePlacement(config, "powerUp"), { x: -5, y: 3, scale: 0.9 });
});

test("page adjustments retain pet-specific authored placement and eye coordinates", () => {
  const pet = { x: 12, y: -8, scale: 1.2, eyes: { front: { x: 5, y: 6, size: 30, rotation: 0 } } };
  assert.deepEqual(composePetPagePlacement(pet, { x: 3, y: 5, scale: 1.25 }), {
    x: 15, y: -3, scale: 1.5, eyes: pet.eyes,
  });
  assert.deepEqual(pet, { x: 12, y: -8, scale: 1.2, eyes: pet.eyes });
});

test("invalid placement configuration safely falls back without changing existing layouts", () => {
  assert.deepEqual(resolvePetPagePlacement({ active: { x: 900, y: 0, scale: 1 } }, "active"), { x: 0, y: 0, scale: 1 });
});
