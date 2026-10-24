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
  assert.match(player, /backgroundColor: "#61864a"/);
  assert.match(player, /Expand Ground/);
  assert.doesNotMatch(player, /backgroundImage: scene.backgroundUrl/);
  assert.match(room, /naturalWidth \/ naturalHeight/);
  assert.match(room, /imgWidth=\{dimensions.width\} sceneHeight=\{dimensions.height\}/);
  assert.ok(player.includes('left: `${shownPosition("item", item).xPct * 100}%`'));
  assert.ok(player.includes('top: `${shownPosition("item", item).yPct * 100}%`'));
  assert.match(player, /Fine-tune exact placement/);
  assert.doesNotMatch(editor, /aspect-\[11\/17\]|Pet Park — Scene Editor/);
});
