import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { sceneCameraPointerDelta } from "../client/src/lib/sceneCameraCoordinates";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";

const source = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("Pet Park reuses Pet House touch, viewport and pointer primitives", () => {
  assert.match(source, /HOME_TOUCH_SURFACE_STYLE/);
  assert.match(source, /observeHomeViewport\(element, measure, "artwork-scene"\)/);
  assert.match(source, /homeCameraPointerDelta\(e.clientX - drag.x, e.clientY - drag.y, viewport.current\)/);
  assert.match(source, /safeSetPointerCapture\(e.currentTarget, e.pointerId\)/);
  assert.match(source, /onLostPointerCapture/);
  assert.match(source, /drag.id !== e.pointerId/);
  assert.match(source, /Math.hypot\(delta.x, delta.y\) > 7/);
  assert.match(source, /closest\("button, input, select, textarea, a"\)/);
  assert.doesNotMatch(source, /new ResizeObserver/);
});

test("scaled ancestor touch movement is converted into local camera pixels", () => {
  const delta = sceneCameraPointerDelta(30, -50, {
    clientWidth: 400, clientHeight: 600,
    getBoundingClientRect: () => ({ width: 200, height: 300 }),
  });
  assert.deepEqual(delta, { x: 60, y: -100 });
  const camera = parkCameraGeometry(400, 600, 1.5);
  const pan = parkClampCamera({ x: -camera.limitX / 2 + delta.x, y: -camera.limitY / 2 + delta.y }, camera);
  assert.ok(pan.x <= 0 && pan.x >= -camera.limitX);
  assert.ok(pan.y <= 0 && pan.y >= -camera.limitY);
});

test("existing pet, effect and admin scene remain unchanged", () => {
  assert.match(source, /<ParkEffectVisual type=\{item.effectType\}/);
  assert.match(source, /<PetAnimator petTemplateId=\{pet.petTemplateId\}/);
  assert.match(source, /<PetParkAdminPanel key=\{editorMode\} initialMode=/);
  assert.match(source, /scene\?\.canEditPark && showCreator/);
  assert.match(source, /startPlacement\(e, "building"/);
  assert.doesNotMatch(source, /Advanced edit/);
  assert.match(source, /parkCameraGeometry\(viewportSize.width, viewportSize.height, backgroundAspect\)/);
});
