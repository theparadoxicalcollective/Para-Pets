import test from "node:test";
import assert from "node:assert/strict";
import {
  scenePointToPlacement, scenePlacementToPoint, hudCornerPoint, popupCenter, popupMaxSize,
} from "../client/src/lib/coordinateContracts";

const zero = { top: 0, right: 0, bottom: 0, left: 0 };

test("authored scene placement survives different device camera rectangles", () => {
  const saved = { xPct: 0.3, yPct: 0.72 };
  for (const scene of [
    { left: 0, top: 0, width: 390, height: 844 },
    { left: 100, top: 30, width: 780, height: 1688 },
    { left: -240, top: 70, width: 1440, height: 3116 },
  ]) {
    const point = scenePlacementToPoint(saved, scene);
    const roundTrip = scenePointToPlacement(point, scene);
    assert.ok(roundTrip);
    assert.ok(Math.abs(roundTrip.xPct - saved.xPct) < 1e-12);
    assert.ok(Math.abs(roundTrip.yPct - saved.yPct) < 1e-12);
  }
});

test("invalid scene dimensions cannot create corrupt saved positions", () => {
  assert.equal(scenePointToPlacement({ x: 12, y: 20 }, { left: 0, top: 0, width: 0, height: 844 }), null);
});

test("HUD corners use visible device bounds and safe areas", () => {
  const viewport = { left: 0, top: 0, width: 1024, height: 1366 };
  const safe = { top: 24, right: 12, bottom: 34, left: 10 };
  assert.deepEqual(hudCornerPoint(viewport, "top-left", safe, 8), { x: 18, y: 32 });
  assert.deepEqual(hudCornerPoint(viewport, "bottom-right", safe, 8), { x: 1004, y: 1324 });
});

test("popup center is the visible viewport center on phones tablets and desktops", () => {
  for (const [width, height] of [[390, 844], [412, 915], [1024, 1366], [1440, 900]]) {
    assert.deepEqual(popupCenter({ left: 0, top: 0, width, height }), { x: width / 2, y: height / 2 });
  }
  assert.deepEqual(popupCenter({ left: 20, top: 40, width: 400, height: 800 }), { x: 220, y: 440 });
});

test("popup size respects safe areas and small screens", () => {
  assert.deepEqual(popupMaxSize({ left: 0, top: 0, width: 390, height: 844 }, zero), { width: 358, height: 812 });
  assert.deepEqual(popupMaxSize({ left: 0, top: 0, width: 100, height: 100 }, { top: 50, bottom: 50, left: 50, right: 50 }), { width: 0, height: 0 });
});
