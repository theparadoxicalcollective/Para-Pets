import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_DECOR_PLACEMENT_BOUNDS,
  HOME_INVENTORY_DROP_BOUNDS,
  clampHomePlacementPoint,
  dragHomePlacement,
  homeClientPointToPlacement,
  homeCameraDropToPlacement,
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


test("Pet Home pet movement keeps existing outdoor bounds across device scales", () => {
  const bounds = { minX: 0.05, maxX: 0.95, minY: 0.05, maxY: 0.82 };
  const origin = { xPct: 0.4, yPct: 0.45 };
  const phone = dragHomePlacement(origin, 39, 84.4, 390, 844, bounds);
  const tablet = dragHomePlacement(origin, 78, 168.8, 780, 1688, bounds);
  const desktop = dragHomePlacement(origin, 144, 311.6307692307692, 1440, 3116.3076923076924, bounds);

  assert.deepEqual(phone, { xPct: 0.5, yPct: 0.55 });
  assert.deepEqual(tablet, phone);
  assert.ok(Math.abs(desktop.xPct - phone.xPct) < 1e-12);
  assert.ok(Math.abs(desktop.yPct - phone.yPct) < 1e-12);
});

test("panned Pet Home inventory drops resolve to the same authored point at each device scale", () => {
  const identity = (x: number, y: number) => ({ x, y });
  const phone = homeClientPointToPlacement(234, 422, { left: 0, top: 0 }, 39, 390, 844, identity);
  const tablet = homeClientPointToPlacement(468, 844, { left: 0, top: 0 }, 78, 780, 1688, identity);

  assert.deepEqual(phone, { xPct: 0.5, yPct: 0.5 });
  assert.deepEqual(tablet, phone);
});

test("Pet Home pet drop bounds preserve the existing outdoor toolbar reserve", () => {
  const identity = (x: number, y: number) => ({ x, y });
  const outdoorPetBounds = { minX: 0.05, maxX: 0.95, minY: 0.05, maxY: 0.82 };
  const result = homeClientPointToPlacement(999, 999, { left: 0, top: 0 }, 0, 390, 844, identity, outdoorPetBounds);
  assert.deepEqual(result, { xPct: 0.95, yPct: 0.82 });
});


test("inventory drops resolve against the rendered camera on phones and scaled tablets", () => {
  const camera = (left: number, top: number, width: number, height: number, logicalWidth: number, logicalHeight: number) => ({
    clientWidth: logicalWidth, clientHeight: logicalHeight,
    getBoundingClientRect: () => ({ left, top, width, height }),
  }) as unknown as HTMLElement;
  const phone = homeCameraDropToPlacement(234, 422, camera(0, 0, 390, 844, 390, 844), 39, 390, 844);
  const tablet = homeCameraDropToPlacement(254, 231, camera(20, 20, 390, 422, 780, 844), 78, 780, 844);
  assert.deepEqual(phone, { xPct: 0.5, yPct: 0.5 });
  assert.deepEqual(tablet, phone);
  assert.deepEqual(homeCameraDropToPlacement(999, 999, camera(0, 0, 390, 844, 390, 844), 0, 390, 844), { xPct: 0.97, yPct: 0.97 });
  assert.equal(homeCameraDropToPlacement(10, 10, camera(0, 0, 0, 0, 390, 844), 0, 390, 844), null);
});
