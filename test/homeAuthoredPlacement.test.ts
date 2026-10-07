import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_DECOR_PLACEMENT_BOUNDS,
  HOME_INVENTORY_DROP_BOUNDS,
  clampHomePlacementPoint,
  dragHomePlacement,
  homeClientPointToPlacement,
} from "../client/src/lib/homeAuthoredPlacement";

test("Pet Home authored movement is independent of rendered device scale", () => {
  const origin = { xPct: 0.3, yPct: 0.4 };
  const phone = dragHomePlacement(origin, 39, 84.4, 390, 844, HOME_DECOR_PLACEMENT_BOUNDS);
  const tablet = dragHomePlacement(origin, 78, 168.8, 780, 1688, HOME_DECOR_PLACEMENT_BOUNDS);
  const desktop = dragHomePlacement(origin, 144, 311.6307692307692, 1440, 3116.3076923076924, HOME_DECOR_PLACEMENT_BOUNDS);

  assert.ok(Math.abs(phone.xPct - 0.4) < 1e-12);
  assert.ok(Math.abs(phone.yPct - 0.5) < 1e-12);
  assert.ok(Math.abs(tablet.xPct - phone.xPct) < 1e-12);
  assert.ok(Math.abs(tablet.yPct - phone.yPct) < 1e-12);
  assert.ok(Math.abs(desktop.xPct - phone.xPct) < 1e-12);
  assert.ok(Math.abs(desktop.yPct - phone.yPct) < 1e-12);
});

test("Pet Home keeps the existing decor and inventory drop boundaries", () => {
  assert.deepEqual(clampHomePlacementPoint({ xPct: -1, yPct: 2 }, HOME_DECOR_PLACEMENT_BOUNDS), { xPct: 0.02, yPct: 0.98 });
  assert.deepEqual(clampHomePlacementPoint({ xPct: -1, yPct: 2 }, HOME_INVENTORY_DROP_BOUNDS), { xPct: 0.03, yPct: 0.97 });
});

test("inventory drops resolve against the authored home scene instead of device pixels", () => {
  const identity = (x: number, y: number) => ({ x, y });
  const phone = homeClientPointToPlacement(195, 422, { left: 0, top: 0 }, 0, 390, 844, identity);
  const tablet = homeClientPointToPlacement(390, 844, { left: 0, top: 0 }, 0, 780, 1688, identity);
  assert.deepEqual(phone, { xPct: 0.5, yPct: 0.5 });
  assert.deepEqual(tablet, phone);
});

test("invalid home scene geometry cannot corrupt a saved layout", () => {
  const origin = { xPct: 0.25, yPct: 0.75 };
  assert.deepEqual(dragHomePlacement(origin, 100, 100, 0, 844, HOME_DECOR_PLACEMENT_BOUNDS), origin);
  assert.equal(homeClientPointToPlacement(10, 10, { left: 0, top: 0 }, 0, 0, 844, (x, y) => ({ x, y })), null);
});
