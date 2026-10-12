import assert from "node:assert/strict";
import test from "node:test";
import { sceneCameraPointerDelta } from "../client/src/lib/sceneCameraCoordinates";

const camera = (width: number, height: number, renderedWidth: number, renderedHeight: number) => ({
  clientWidth: width, clientHeight: height,
  getBoundingClientRect: () => ({ width: renderedWidth, height: renderedHeight }),
});

test("authored scene pointer movement uses actual camera dimensions on every device", () => {
  for (const [width, height, scale] of [[390, 844, 1], [768, 1024, .8], [1366, 768, 1.5], [1920, 1080, .65]]) {
    const scene = camera(width, height, width * scale, height * scale);
    const delta = sceneCameraPointerDelta(20 * scale, -35 * scale, scene);
    assert.ok(Math.abs(delta.x - 20) < 1e-9);
    assert.ok(Math.abs(delta.y + 35) < 1e-9);
  }
});

test("missing and invalid camera measurements fail closed", () => {
  assert.deepEqual(sceneCameraPointerDelta(10, 20, null), { x: 0, y: 0 });
  assert.deepEqual(sceneCameraPointerDelta(10, 20, camera(0, 0, 0, 0)), { x: 0, y: 0 });
  assert.deepEqual(sceneCameraPointerDelta(Number.NaN, Infinity, camera(800, 600, 800, 600)), { x: 0, y: 0 });
});
