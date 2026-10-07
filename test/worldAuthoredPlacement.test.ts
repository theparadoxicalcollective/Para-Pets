import assert from "node:assert/strict";
import test from "node:test";
import {
  WORLD_PLACEMENT_BOUNDS,
  clientPointToWorldPlacementPercent,
  dragWorldPlacementPercent,
  pointInWorldPlacementSurface,
} from "../client/src/worlds/worldAuthoredPlacement";

test("world admin movement is stable across rendered device sizes", () => {
  const origin = { x: 30, y: 40 };
  const phone = dragWorldPlacementPercent(origin, 39, 84.4, 390, 844, WORLD_PLACEMENT_BOUNDS.location);
  const tablet = dragWorldPlacementPercent(origin, 78, 168.8, 780, 1688, WORLD_PLACEMENT_BOUNDS.location);
  const desktop = dragWorldPlacementPercent(origin, 144, 311.6307692307692, 1440, 3116.3076923076924, WORLD_PLACEMENT_BOUNDS.location);

  assert.ok(Math.abs(phone.x - 40) < 1e-12);
  assert.ok(Math.abs(phone.y - 50) < 1e-12);
  assert.ok(Math.abs(tablet.x - phone.x) < 1e-12);
  assert.ok(Math.abs(tablet.y - phone.y) < 1e-12);
  assert.ok(Math.abs(desktop.x - phone.x) < 1e-12);
  assert.ok(Math.abs(desktop.y - phone.y) < 1e-12);
});

test("world placement preserves each existing system's authored bounds", () => {
  assert.deepEqual(
    dragWorldPlacementPercent({ x: 99, y: 1 }, 1000, -1000, 390, 844, WORLD_PLACEMENT_BOUNDS.decor),
    { x: 100, y: 0 },
  );
  assert.deepEqual(
    dragWorldPlacementPercent({ x: 109, y: -9 }, 1000, -1000, 390, 844, WORLD_PLACEMENT_BOUNDS.location),
    { x: 110, y: -10 },
  );
});

test("panel drops resolve into the same authored percent plane", () => {
  const rect = { left: 100, top: 200, width: 800, height: 1200 };
  assert.equal(pointInWorldPlacementSurface(500, 800, { ...rect, right: 900, bottom: 1400 }), true);
  assert.deepEqual(clientPointToWorldPlacementPercent(500, 800, rect), { x: 50, y: 50 });
});

test("invalid rendered geometry cannot corrupt saved authored coordinates", () => {
  const origin = { x: 17, y: 23 };
  assert.deepEqual(dragWorldPlacementPercent(origin, 20, 30, 0, 844, WORLD_PLACEMENT_BOUNDS.location), origin);
  assert.equal(clientPointToWorldPlacementPercent(100, 100, { left: 0, top: 0, width: 0, height: 844 }), null);
});
