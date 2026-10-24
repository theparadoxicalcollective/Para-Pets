import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkGroundContactY, parkDepthIndex, PARK_SELECTED_DEPTH_Z } from "../client/src/lib/petParkDepth";
import { parkExpandPoint, parkGroundSize } from "../shared/petParkGround";

test("far ground contacts render behind near ones across every park expansion tier", () => {
  for (const level of [1, 2, 3, 4]) {
    const { height } = parkGroundSize(level);
    const far = { yPct: 0.24, worldHeight: height, size: 130, kind: "building" as const };
    const near = { yPct: 0.73, worldHeight: height, size: 130, kind: "building" as const };
    assert.ok(parkGroundContactY(far) < parkGroundContactY(near));
    assert.ok(parkDepthIndex(far) < parkDepthIndex(near));
    assert.ok(parkDepthIndex(near) < PARK_SELECTED_DEPTH_Z);
  }
});

test("ground contact respects existing visual transforms without moving saved coordinates", () => {
  const worldHeight = 2700;
  assert.equal(parkGroundContactY({ yPct: 0.5, worldHeight, size: 100, kind: "item" }), 1400);
  assert.equal(parkGroundContactY({ yPct: 0.5, worldHeight, size: 100, kind: "building" }), 1400);
  assert.ok(Math.abs(parkGroundContactY({ yPct: 0.5, worldHeight, size: 165, kind: "pet" }) - 1358.25) < 1e-8);

  const fartherPet = { yPct: 0.5, worldHeight, size: 165, kind: "pet" as const };
  const frontTree = { yPct: 0.5, worldHeight, size: 250, kind: "item" as const };
  assert.ok(parkDepthIndex(fartherPet) < parkDepthIndex(frontTree), "tree should cover pet behind its ground contact");
  const nearPet = { ...fartherPet, yPct: 0.62 };
  assert.ok(parkDepthIndex(nearPet) > parkDepthIndex(frontTree), "pet moving in front should cover tree");
});

test("existing admin layers still allow deliberate local overlap adjustment", () => {
  const sprite = { yPct: 0.5, worldHeight: 2700, size: 120, kind: "item" as const };
  assert.ok(parkDepthIndex({ ...sprite, layer: 2 }) > parkDepthIndex({ ...sprite, layer: 1 }));
  assert.ok(parkDepthIndex({ ...sprite, layer: -5 }) < parkDepthIndex({ ...sprite, layer: 0 }));
  // The admin can also lift a nearby object above a slightly closer one.
  assert.ok(parkDepthIndex({ ...sprite, layer: 4 }) > parkDepthIndex({ ...sprite, yPct: 0.505 }));
  // Even the API's maximum permitted values remain below the editor selection.
  assert.ok(parkDepthIndex({ ...sprite, worldHeight: 8100, yPct: 1, size: 1000, layer: 10000 }) < PARK_SELECTED_DEPTH_Z);
});

test("center expansion remapping preserves ground-contact order", () => {
  for (const [oldLevel, nextLevel] of [[1, 2], [2, 3], [3, 4]]) {
    const oldHeight = parkGroundSize(oldLevel).height;
    const nextHeight = parkGroundSize(nextLevel).height;
    const back = { xPct: 0.34, yPct: 0.25 };
    const front = { xPct: 0.62, yPct: 0.7 };
    const a = parkExpandPoint(back, oldLevel, nextLevel);
    const b = parkExpandPoint(front, oldLevel, nextLevel);
    assert.ok(parkDepthIndex({ yPct: back.yPct, worldHeight: oldHeight, size: 150, kind: "building" }) <
      parkDepthIndex({ yPct: front.yPct, worldHeight: oldHeight, size: 150, kind: "building" }));
    assert.ok(parkDepthIndex({ yPct: a.yPct, worldHeight: nextHeight, size: 150, kind: "building" }) <
      parkDepthIndex({ yPct: b.yPct, worldHeight: nextHeight, size: 150, kind: "building" }));
  }
});

test("park shares one renderer for depth, shadows and original interactions", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const shadow = readFileSync("client/src/components/PetParkGroundShadow.tsx", "utf8");
  assert.equal((page.match(/parkDepthIndex\(\{/g) ?? []).length, 3, "buildings, items and pets each use shared depth order");
  assert.match(page, /PARK_SELECTED_DEPTH_Z/);
  assert.equal((page.match(/<PetParkGroundShadow /g) ?? []).length, 3);
  assert.match(page, /kind="pet"/);
  assert.match(page, /kind="building"/);
  assert.match(page, /<PetParkTerrain/);
  assert.match(page, /<ParkEffectVisual type=\{item.effectType\}/);
  assert.match(page, /startPlacement\(e, "building"/);
  assert.match(page, /startPlacement\(e, "item"/);
  assert.match(page, /<PetAnimator petTemplateId=\{pet.petTemplateId\}/);
  assert.match(page, /setInspectedPet\(pet\)/);
  assert.match(page, /setEnteredBuilding\(building\)/);
  assert.match(shadow, /pointer-events-none/);
  assert.match(shadow, /aria-hidden="true"/);
  assert.doesNotMatch(page, /zIndex: 11000 \+ index/);
});
