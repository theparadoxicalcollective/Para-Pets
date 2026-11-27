import assert from "node:assert/strict";
import test from "node:test";
import { worldEditorInteriorCamera, interiorCameraCenter } from "../client/src/lib/worldEditorInteriorCamera";

test("wide building interiors fill the phone and tablet height without stretching artwork", () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 834, height: 1194 }]) {
    const camera = worldEditorInteriorCamera(viewport, 16 / 9, 1, { x: .5, y: .5 });
    assert.equal(camera.height, viewport.height);
    assert.equal(camera.width / camera.height, 16 / 9);
    assert.ok(camera.width > viewport.width);
    assert.equal(camera.pan.x, (viewport.width - camera.width) / 2);
    assert.equal(camera.pan.y, 0);
    const left = worldEditorInteriorCamera(viewport, 16 / 9, 1, { x: 0, y: .5 });
    const right = worldEditorInteriorCamera(viewport, 16 / 9, 1, { x: 1, y: .5 });
    assert.equal(left.pan.x, 0);
    assert.equal(right.pan.x, viewport.width - camera.width);
    assert.deepEqual(left.center, interiorCameraCenter(viewport, left, left.pan));
  }
});

test("fit shows all artwork, including portrait and landscape rooms", () => {
  for (const aspect of [0.6, 1, 16 / 9, 3]) {
    const viewport = { width: 390, height: 844 };
    const fit = worldEditorInteriorCamera(viewport, aspect, 0, { x: .1, y: .9 });
    assert.ok(fit.width <= viewport.width + .00001);
    assert.ok(fit.height <= viewport.height + .00001);
    assert.ok(Math.abs(fit.width / fit.height - aspect) < .00001);
    assert.ok(Math.abs(fit.center.x - .5) < .00001);
    assert.ok(Math.abs(fit.center.y - .5) < .00001);
  }
});

test("room zoom preserves the visible artwork point where possible and allows vertical panning", () => {
  const viewport = { width: 390, height: 844 };
  const center = { x: .66, y: .5 };
  const full = worldEditorInteriorCamera(viewport, 16 / 9, 1, center);
  const enlarged = worldEditorInteriorCamera(viewport, 16 / 9, 1.5, full.center);
  assert.ok(Math.abs(enlarged.center.x - center.x) < .00001);
  assert.equal(enlarged.height, 1.5 * viewport.height);
  const bottom = worldEditorInteriorCamera(viewport, 16 / 9, 1.5, { x: .5, y: 1 });
  assert.ok(bottom.pan.y < viewport.height - bottom.height,
    "bottom edge can be moved above fixed editing controls");
  const top = worldEditorInteriorCamera(viewport, 16 / 9, 1, { x: .5, y: 0 });
  assert.ok(top.pan.y > 0, "top edge can be moved below fixed editing controls");
  const bottomAtFull = worldEditorInteriorCamera(viewport, 16 / 9, 1, { x: .5, y: 1 });
  assert.ok(bottomAtFull.pan.y < 0);
  const rotated = worldEditorInteriorCamera({ width: 844, height: 390 }, 16 / 9, 1, full.center);
  assert.equal(rotated.height, 390);
  assert.equal(rotated.pan.x, (844 - rotated.width) / 2);
});
