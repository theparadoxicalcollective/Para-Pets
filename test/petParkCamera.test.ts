import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parkCameraGeometry, parkClampCamera, parkClampZoom, parkZoomAnchorPan, parkExpansionCameraPan,
  PARK_ZOOM_MAX, PARK_ZOOM_MIN,
} from "../client/src/lib/petParkCamera";
import {
  isParkGroundLevel, parkGroundSize, parkExpandPoint, PET_PARK_MAX_GROUND_LEVEL,
} from "../shared/petParkGround";

test("fixed camera scale stays constant across expanding ground on phones, tablets and desktop", () => {
  for (const [width, height] of [[390, 844], [820, 1180], [900, 1300], [1440, 900]]) {
    const first = parkCameraGeometry(width, height, 1);
    for (let level = 1; level <= PET_PARK_MAX_GROUND_LEVEL; level++) {
      const scene = parkCameraGeometry(width, height, level);
      assert.equal(scene.worldWidth, parkGroundSize(level).width);
      assert.equal(scene.worldHeight, parkGroundSize(level).height);
      assert.equal(scene.scale, first.scale, "expanding ground must not shrink objects");
      assert.ok(scene.sceneWidth >= width && scene.sceneHeight >= height);
      assert.deepEqual(parkClampCamera({ x: 100, y: 100 }, scene), { x: 0, y: 0 });
      assert.deepEqual(parkClampCamera({ x: -1e6, y: -1e6 }, scene),
        { x: -scene.limitX, y: -scene.limitY });
    }
  }
});

test("new minimum zoom expands the view without blank ground or changing saved item size", () => {
  assert.equal(PARK_ZOOM_MIN, 0.6);
  assert.equal(parkClampZoom(0.4), 0.6);
  assert.equal(parkClampZoom(0.65), 0.65);
  // The world is still larger than the viewport at the least zoomed-in
  // setting, including tall phones, tablets and the gated desktop preview.
  for (const [width, height] of [[360, 800], [390, 844], [430, 932], [768, 1024], [834, 1194], [900, 1300], [1440, 900]]) {
    const prior = parkCameraGeometry(width, height, 1, 0.7);
    const expanded = parkCameraGeometry(width, height, 1, PARK_ZOOM_MIN);
    assert.ok(expanded.sceneWidth >= width && expanded.sceneHeight >= height,
      `No empty margins at minimum zoom on ${width}×${height}`);
    assert.ok(expanded.sceneWidth < prior.sceneWidth && expanded.sceneHeight < prior.sceneHeight);
    const bounds = parkClampCamera({ x: -1e7, y: 1e7 }, expanded);
    assert.deepEqual(bounds, { x: -expanded.limitX, y: 0 },
      "camera stays on the available grass");
    assert.equal(expanded.worldWidth, prior.worldWidth);
    assert.equal(expanded.worldHeight, prior.worldHeight);
    const anchor = { x: width * .4, y: height * .62 };
    const pan = { x: -prior.limitX / 2, y: -prior.limitY / 2 };
    const zoomed = parkZoomAnchorPan(pan, prior.scale, expanded.scale, anchor, expanded);
    for (const axis of ["x", "y"] as const) {
      const oldWorld = (anchor[axis] - pan[axis]) / prior.scale;
      const newWorld = (anchor[axis] - zoomed[axis]) / expanded.scale;
      assert.ok(Math.abs(oldWorld - newWorld) < .001,
        "zoom must preserve the point under the pinch center when not edge-clamped");
    }
  }
});

test("expansion preserves placed object positions relative to scene center", () => {
  assert.equal(isParkGroundLevel(1), true);
  assert.equal(isParkGroundLevel(4), true);
  for (const invalid of [0, 5, 1.5, "2", null]) assert.equal(isParkGroundLevel(invalid), false);
  for (let level = 1; level < PET_PARK_MAX_GROUND_LEVEL; level++) {
    const previous = parkGroundSize(level);
    const next = parkGroundSize(level + 1);
    for (const point of [{ xPct: 0, yPct: 0 }, { xPct: 0.5, yPct: 0.5 }, { xPct: 0.82, yPct: 0.71 }]) {
      const p = parkExpandPoint(point, level, level + 1);
      assert.ok(Math.abs((p.xPct - 0.5) * next.width - (point.xPct - 0.5) * previous.width) < 0.000001);
      assert.ok(Math.abs((p.yPct - 0.5) * next.height - (point.yPct - 0.5) * previous.height) < 0.000001);
      assert.ok(p.xPct >= 0 && p.xPct <= 1 && p.yPct >= 0 && p.yPct <= 1);
    }
  }
});

test("zoom is bounded and keeps the world point below an anchor unchanged", () => {
  assert.equal(parkClampZoom(-5), PARK_ZOOM_MIN);
  assert.equal(parkClampZoom(99), PARK_ZOOM_MAX);
  assert.equal(parkClampZoom(Number.NaN), 1);
  const old = parkCameraGeometry(390, 844, 2, 1);
  const next = parkCameraGeometry(390, 844, 2, 1.45);
  const pan = { x: -320, y: -600 };
  const anchor = { x: 155, y: 380 };
  const transformed = parkZoomAnchorPan(pan, old.scale, next.scale, anchor, next);
  for (const axis of ["x", "y"] as const) {
    const oldWorld = (anchor[axis] - pan[axis]) / old.scale;
    const newWorld = (anchor[axis] - transformed[axis]) / next.scale;
    assert.ok(Math.abs(oldWorld - newWorld) < 1e-6);
  }
});

test("expansion preserves camera focal position rather than jumping to map origin", () => {
  const old = parkCameraGeometry(390, 844, 1);
  const next = parkCameraGeometry(390, 844, 2);
  const pan = { x: -400, y: -800 };
  const updated = parkExpansionCameraPan(pan, old.scale, parkGroundSize(1), parkGroundSize(2), next);
  assert.equal(updated.x, pan.x - (next.worldWidth - old.worldWidth) * old.scale / 2);
  assert.equal(updated.y, pan.y - (next.worldHeight - old.worldHeight) * old.scale / 2);
});

test("player and admin use world coords, not an old image-sized reference stage", () => {
  const player = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const editor = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
  const room = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
  assert.match(player, /parkCameraGeometry\(viewportSize.width, viewportSize.height, groundLevel, zoom\)/);
  assert.match(player, /touchPoints.current.size === 2/);
  assert.match(player, /onWheel=\{e =>/);
  assert.match(player, /<PetParkTerrain /);
  assert.match(player, /Expand Ground/);
  assert.doesNotMatch(player, /backgroundImage: scene.backgroundUrl/);
  assert.match(room, /naturalWidth \/ naturalHeight/);
  assert.match(room, /imgWidth=\{imageWidth\} sceneHeight=\{dimensions.height\}/);
  assert.ok(player.includes('left: `${shownPosition("item", item).xPct * 100}%`'));
  assert.ok(player.includes('top: `${shownPosition("item", item).yPct * 100}%`'));
  assert.doesNotMatch(player, /Fine-tune exact placement/);
  assert.doesNotMatch(editor, /aspect-\[11\/17\]|Pet Park — Scene Editor/);
});

test("Pet Park uses gesture and wheel zoom without visual zoom controls", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  // Two-finger touch zoom and mouse/trackpad-wheel zoom retain the same
  // viewport-aware camera geometry and bounds after the button removal.
  assert.match(page, /touchPoints\.current\.size === 2/);
  assert.match(page, /parkClampZoom\(pinch\.current\.zoom \* distance \/ Math\.max\(1, pinch\.current\.distance\)\)/);
  assert.match(page, /setZoom\(nextZoom\)/);
  assert.match(page, /onWheel=\{e =>/);
  assert.match(page, /changeZoom\(zoom \* \(e\.deltaY > 0 \? 0\.91 : 1\.09\)/);
  assert.match(page, /parkZoomAnchorPan\(camera, scale, nextGeometry\.scale, anchor, nextGeometry\)/);
  assert.match(page, /onPointerMove=\{movePlacement\}/);
  // No floating controls obscure scenery or overlap the Pet Park editor.
  assert.doesNotMatch(page, /Park camera zoom controls|Zoom in to Pet Park|Zoom out of Pet Park|Current Pet Park zoom/);
  assert.doesNotMatch(page, /<ZoomIn\b|<ZoomOut\b|PARK_ZOOM_STEP/);
});
