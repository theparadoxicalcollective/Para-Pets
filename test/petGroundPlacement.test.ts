import assert from "node:assert/strict";
import test from "node:test";
import { getPetGroundPoint, dragPetPlacement, centerPetPlacement, getPetPlacementTransform, PET_SPOT } from "../client/src/lib/petGroundPlacement";
import { DEFAULT_PET_PRESENTATION } from "../shared/petPresentation";
const full = () => ({ left: 0, top: 0, width: 1, height: 1 });
const part = (partType: string, posX: number, posY: number, width: number, height: number) => ({ partType, posX, posY, width, height, imageUrl: partType });

test("ground follows visible feet, ignoring wings and transparent padding", () => {
  const parts = [part("left_leg", 300, 500, 200, 400), part("right_leg", 500, 500, 200, 400), part("left_wing", -50, 0, 1000, 1000)];
  assert.deepEqual(getPetGroundPoint(parts, () => ({ left: .1, top: .1, width: .8, height: .7 })), { x: 500, y: 820 });
});
test("side legs and rotated feet use their displayed bottom", () => {
  assert.deepEqual(getPetGroundPoint([part("front_leg", 400, 600, 200, 100)], full), { x: 500, y: 700 });
  const point = getPetGroundPoint([{ ...part("right_leg", 400, 600, 200, 100), rotation: 90 }], full);
  assert.equal(point.x, 500);
  assert.equal(point.y, 750);
});
test("legless pets use their body rather than high accessories", () => {
  assert.deepEqual(getPetGroundPoint([part("body", 250, 200, 500, 600), part("tail", 0, 0, 1000, 1000)], full), { x: 500, y: 800 });
});
test("same relative drag produces matching home and editor placements", () => {
  const small = dragPetPlacement(DEFAULT_PET_PRESENTATION, 39, -19.5, 390);
  const large = dragPetPlacement(DEFAULT_PET_PRESENTATION, 100, -50, 1000);
  assert.deepEqual(small, large);
  assert.deepEqual({ x: small.x, y: small.y }, { x: 10, y: -5 });
});
test("movement preserves size and fitted X eyes while clamping coordinates", () => {
  const value = { x: 98, y: -99, scale: 1.2, eyes: { head: { x: 400, y: 200, size: 30 } } };
  assert.deepEqual(dragPetPlacement(value, 100, -100, 390), { ...value, x: 100, y: -100 });
  assert.equal(dragPetPlacement(value, 100, 100, 0), value);
});

test("centering preserves full size and all head eye fittings", () => {
  const value = { x: 23, y: -17, scale: 2.4, eyes: { head: { x: 430, y: 270, size: 35 }, h2_head: { x: 700, y: 300, size: 30 } } };
  assert.deepEqual(centerPetPlacement(value), { ...value, x: 0, y: 0 });
});
test("off-center authored feet stay on the fixed spot at every whole-pet size", () => {
  const ground = { x: 430, y: 780 };
  for (const scale of [.2, 1, 1.5, 3]) {
    const style = getPetPlacementTransform(ground, { ...DEFAULT_PET_PRESENTATION, scale });
    const translation = style.transform.match(/translate\(([-\d.]+)%, ([-\d.]+)%\)/)!;
    // Scaling is around the feet; the anchor itself moves only by translation.
    assert.equal(ground.x + Number(translation[1]) * 10, PET_SPOT.x);
    assert.equal(ground.y + Number(translation[2]) * 10, PET_SPOT.y);
  }
});
