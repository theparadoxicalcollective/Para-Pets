import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PET_PRESENTATION, defaultXEyes, parsePetPresentation, petPresentationSchema } from "../shared/petPresentation";

test("unconfigured pets retain their existing placement", () => {
  assert.deepEqual(parsePetPresentation(undefined), DEFAULT_PET_PRESENTATION);
  assert.deepEqual(parsePetPresentation({}), DEFAULT_PET_PRESENTATION);
});
test("saved placement validates whole-pet scale and per-head eye positions", () => {
  const placement = { x: -12, y: 5, scale: .7, eyes: { h2_head: { x: 420, y: 315, size: 35 } } };
  assert.deepEqual(parsePetPresentation(placement), placement);
  for (const invalid of [{ ...placement, scale: 0 }, { ...placement, scale: Infinity }, { ...placement, y: 101 }, { ...placement, eyes: { head: { x: 0, y: 0, size: -1 } } }]) {
    assert.equal(petPresentationSchema.safeParse(invalid).success, false);
  }
});
test("automatic X eyes use the matching head's eyes instead of another head", () => {
  const head = { partType: "h2_head", posX: 100, posY: 200, width: 300, height: 250 };
  const parts = [head, { partType: "eyes", posX: 0, posY: 0, width: 100, height: 100 }, { partType: "h2_eyes", posX: 150, posY: 240, width: 100, height: 50 }];
  assert.deepEqual(defaultXEyes(head, parts), { x: 200, y: 265, size: 30 });
  assert.deepEqual(defaultXEyes(head, [head]), { x: 250, y: 312.5, size: 36 });
});
