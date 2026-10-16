import assert from "node:assert/strict";
import test from "node:test";
import { getPetCareDragGhostCenter, getPetCareDragGhostTransform, pointInsideExpandedPetDropZone } from "../client/src/lib/petCareInteractions";

test("drag ghost center follows the visible item above the finger", () => {
  assert.deepEqual(getPetCareDragGhostCenter(120, 200), { x: 120, y: 160 });
  assert.equal(getPetCareDragGhostTransform(120, 200), "translate3d(92px, 132px, 0)");
});

test("visible gift over pet is accepted even when finger lands below pet", () => {
  const pet = { left: 100, right: 200, top: 100, bottom: 160 };
  const finger = { x: 150, y: 205 };
  assert.equal(pointInsideExpandedPetDropZone(finger, pet), false);
  assert.equal(pointInsideExpandedPetDropZone(getPetCareDragGhostCenter(finger.x, finger.y), pet), true);
});
