import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isParkTerrainNearViewport } from "../client/src/lib/petParkTerrainVisibility";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";

test("only onscreen painted stamps and edge-overlapping stamps need DOM artwork", () => {
  const viewport = { width: 390, height: 844 };
  const scene = { width: 1800, height: 2700, scale: 1 };
  const camera = { x: -580, y: -900 };
  const visible = { xPct: 0.4, yPct: 0.5, size: 200 };
  const hidden = { xPct: 0.98, yPct: 0.01, size: 200 };
  assert.equal(isParkTerrainNearViewport(visible, viewport, scene, camera), true);
  assert.equal(isParkTerrainNearViewport(hidden, viewport, scene, camera), false);
  // A patch whose center is just outside the viewport must remain visible if
  // its artwork overlaps the frame. Check both horizontal and vertical edges.
  assert.equal(isParkTerrainNearViewport({ xPct: (camera.x * -1 - 80) / scene.width, yPct: 0.5, size: 200 }, viewport, scene, camera), true);
  assert.equal(isParkTerrainNearViewport({ xPct: 0.4, yPct: (camera.y * -1 - 35) / scene.height, size: 200 }, viewport, scene, camera), true);
  assert.equal(isParkTerrainNearViewport({ xPct: 0.05, yPct: 0.5, size: 20 }, viewport, scene, camera, 0), false);
});

test("culling follows the existing camera for phone, tablet, portrait PC, zoom and every ground tier", () => {
  for (const [width, height] of [[390, 844], [820, 1180], [600, 1024], [1050, 1600]]) {
    for (const level of [1, 2, 3, 4]) {
      for (const zoom of [0.7, 1, 1.6]) {
        const g = parkCameraGeometry(width, height, level, zoom);
        const viewport = { width, height };
        const scene = { width: g.sceneWidth, height: g.sceneHeight, scale: g.scale };
        for (const fraction of [0, 0.5, 1]) {
          const camera = parkClampCamera({ x: -g.limitX * fraction, y: -g.limitY * fraction }, g);
          const focused = {
            xPct: (width / 2 - camera.x) / g.sceneWidth,
            yPct: (height / 2 - camera.y) / g.sceneHeight,
            size: 150,
          };
          assert.equal(isParkTerrainNearViewport(focused, viewport, scene, camera), true);
          // No terrain item gets remapped when camera changes; visibility can
          // change but its coordinates stay exactly those passed by caller.
          assert.ok(focused.xPct >= 0 && focused.xPct <= 1);
          assert.ok(focused.yPct >= 0 && focused.yPct <= 1);
        }
      }
    }
  }
});

test("thousands of faraway painted stamps do not create thousands of scene DOM nodes", () => {
  const viewport = { width: 390, height: 844 };
  const geometry = parkCameraGeometry(viewport.width, viewport.height, 4, 1);
  const scene = { width: geometry.sceneWidth, height: geometry.sceneHeight, scale: geometry.scale };
  const camera = parkClampCamera({ x: -geometry.limitX / 2, y: -geometry.limitY / 2 }, geometry);
  const stamps = Array.from({ length: 5000 }, (_, i) => ({
    xPct: ((i * 173) % 5000) / 5000,
    yPct: ((i * 977) % 5000) / 5000,
    size: 180,
  }));
  const visible = stamps.filter(stamp => isParkTerrainNearViewport(stamp, viewport, scene, camera));
  assert.ok(visible.length > 0);
  assert.ok(visible.length < stamps.length / 3, `only ${visible.length} of 5000 should render near the camera`);
  assert.equal(stamps.length, 5000, "culling must never delete saved terrain");
});

test("culling only skips invisible terrain, preserving decor, effects, pet interactions and editing", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const helper = readFileSync("client/src/lib/petParkTerrainVisibility.ts", "utf8");
  assert.match(page, /item\.kind === "terrain" && !isParkTerrainNearViewport\(/);
  assert.match(page, /return null;/);
  assert.match(page, /scene\.items\.map\(item =>/);
  assert.match(page, /<PetParkTerrainDetail type=\{item.effectType\}/);
  assert.match(page, /onPointerDown=\{e => startPlacement\(e, "item", item\)\}/);
  assert.match(page, /<PetParkTerrainBrush/);
  assert.match(page, /<PetAnimator petTemplateId=\{pet.petTemplateId\}/);
  assert.match(page, /<ParkEffectVisual type=\{item.effectType\}/);
  assert.match(page, /PARK_SELECTED_DEPTH_Z/);
  assert.match(page, /parkDepthIndex\(/);
  assert.match(page, /onWheel=\{e =>/);
  assert.match(page, /parkExpansionCameraPan\(/);
  assert.match(helper, /size \* scene\.scale \* 0\.54 \/ 2/);
});
