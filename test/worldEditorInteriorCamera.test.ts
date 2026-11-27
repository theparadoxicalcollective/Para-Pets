import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { worldEditorInteriorCamera, interiorCameraCenterX } from "../client/src/lib/worldEditorInteriorCamera";

const viewports = [
  { width: 390, height: 844 }, { width: 360, height: 640 },
  { width: 834, height: 1194 }, { width: 1194, height: 834 },
];

test("room artwork fills the actual phone/tablet height, at its native ratio", () => {
  for (const viewport of viewports) {
    const camera = worldEditorInteriorCamera(viewport, 16 / 9);
    assert.equal(camera.height, viewport.height);
    assert.ok(Math.abs(camera.width / camera.height - 16 / 9) < .00001);
    assert.ok(camera.width >= viewport.width);
    assert.equal(camera.pan.x, (viewport.width - camera.width) / 2);
    assert.equal(camera.pan.y, 0);
    assert.equal(camera.center.y, .5);
  }
});

test("horizontal room camera clamps to the actual artwork and never exposes top/bottom gaps", () => {
  for (const viewport of viewports) {
    for (const aspect of [1.6, 16 / 9, 2.4, 3]) {
      const full = worldEditorInteriorCamera(viewport, aspect);
      for (const center of [-10, 0, .18, .5, .85, 1, 10]) {
        const camera = worldEditorInteriorCamera(viewport, aspect, center);
        assert.equal(camera.height, full.height);
        assert.equal(camera.width, full.width);
        assert.ok(camera.pan.x <= 0);
        assert.ok(camera.pan.x + camera.width >= viewport.width - .00001);
        assert.equal(camera.pan.y, 0);
        assert.equal(camera.center.y, .5);
        assert.ok(Math.abs(camera.center.x - interiorCameraCenterX(viewport.width, camera.width, camera.pan.x)) < .00001);
      }
      assert.equal(worldEditorInteriorCamera(viewport, aspect, -10).pan.x, 0);
      assert.equal(worldEditorInteriorCamera(viewport, aspect, 10).pan.x, viewport.width - full.width);
    }
  }
});

test("narrow artwork is centered at full height rather than enlarged, distorted, or made into a thumbnail", () => {
  for (const viewport of viewports) {
    const aspect = .35;
    for (const center of [.05, .5, .95]) {
      const camera = worldEditorInteriorCamera(viewport, aspect, center);
      assert.equal(camera.height, viewport.height);
      assert.ok(Math.abs(camera.width / camera.height - aspect) < .00001);
      assert.ok(camera.width < viewport.width);
      assert.equal(camera.pan.x, (viewport.width - camera.width) / 2);
      assert.equal(camera.pan.y, 0);
      assert.ok(Math.abs(camera.center.x - .5) < .00001);
    }
  }
});

test("normalized horizontal focal position survives viewport resizing whenever within the new edges", () => {
  const phone = worldEditorInteriorCamera(viewports[0], 2.4, .63);
  const tablet = worldEditorInteriorCamera(viewports[2], 2.4, phone.center.x);
  assert.ok(Math.abs(tablet.center.x - phone.center.x) < .00001);
  assert.equal(phone.pan.y, 0);
  assert.equal(tablet.pan.y, 0);
  assert.equal(tablet.height, viewports[2].height);
  const right = worldEditorInteriorCamera(viewports[0], 2.4, 1);
  const resized = worldEditorInteriorCamera(viewports[3], 2.4, right.center.x);
  assert.ok(resized.pan.x + resized.width >= viewports[3].width - .00001);
  assert.equal(resized.pan.y, 0);
});

test("room camera and toolbar controls do not add a floating-picture mode", () => {
  const editor = readFileSync("client/src/pages/WorldSceneEditorPage.tsx", "utf8");
  const controls = readFileSync("client/src/components/world-editor/WorldSceneControls.tsx", "utf8");
  assert.doesNotMatch(editor, /interiorZoom|changeRoomZoom|Fit room|Full room|Zoom room (?:in|out)/);
  assert.match(editor, /left: roomCamera\.pan\.x, top: 0/);
  assert.match(editor, /if \(activeBuilding\) return;[\s\S]*?changeZoom\(zoom \*/);
  const roomDrag = editor.slice(editor.indexOf("const moveRoomPan"), editor.indexOf("const dirtPatches"));
  assert.match(roomDrag, /requestedPanX/);
  assert.doesNotMatch(roomDrag, /setInteriorCenter\(|pan\.y|requestedPanY/);
  assert.match(editor, /visibility: roomArtworkReady \? "visible" : "hidden"/);
  assert.match(editor, /aria-label=\{roomToolsHidden \? "Show room tools" : "Hide room tools"\}/);
  assert.match(controls, /!props.roomToolsHidden && !selectedItem/);
  assert.match(controls, /selectedItem && !props.roomToolsHidden/);
});
