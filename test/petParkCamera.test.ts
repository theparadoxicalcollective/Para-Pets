import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parkCameraGeometry, parkClampCamera, parkImageAspect, parkWorldHeight, PARK_FALLBACK_ASPECT } from "../client/src/lib/petParkCamera";

test("camera preserves landscape, portrait and fallback source ratios", () => {
  assert.equal(parkImageAspect(2048, 3072), 1.5);
  assert.equal(parkImageAspect(3000, 1500), 0.5);
  assert.equal(parkImageAspect(0, 0), PARK_FALLBACK_ASPECT);
  assert.equal(parkWorldHeight(1.5), 1650);
  for (const aspect of [0.5, 1.5, 2.1]) {
    for (const [width, height] of [[390, 844], [820, 1180], [900, 1300], [1440, 900]]) {
      const scene = parkCameraGeometry(width, height, aspect);
      assert.ok(scene.sceneWidth >= width);
      assert.ok(scene.sceneHeight >= height);
      assert.ok(Math.abs(scene.sceneHeight / scene.sceneWidth - aspect) < 0.000001);
      assert.deepEqual(parkClampCamera({ x: 100, y: 100 }, scene), { x: 0, y: 0 });
      assert.deepEqual(parkClampCamera({ x: -1e6, y: -1e6 }, scene), { x: -scene.limitX, y: -scene.limitY });
    }
  }
});

test("player and admin use one aspect-preserving world coordinate system", () => {
  const player = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const editor = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
  const room = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
  assert.match(player, /parkCameraGeometry\(viewportSize.width, viewportSize.height, backgroundAspect\)/);
  assert.match(player, /parkImageAspect\(image.naturalWidth, image.naturalHeight\)/);
  assert.match(room, /naturalWidth \/ naturalHeight/);
  assert.match(room, /imgWidth=\{dimensions.width\} sceneHeight=\{dimensions.height\}/);
  assert.ok(player.includes('left: `${shownPosition("item", item).xPct * 100}%`'), 'park objects keep normalized X coordinates while dragging');
  assert.ok(player.includes('top: `${shownPosition("item", item).yPct * 100}%`'), 'park objects keep normalized Y coordinates while dragging');
  assert.match(player, /Fine-tune exact placement/);
  assert.doesNotMatch(player, /const SCENE_H = 1700/);
  assert.doesNotMatch(editor, /aspect-\[11\/17\]|Pet Park — Scene Editor/);
});
