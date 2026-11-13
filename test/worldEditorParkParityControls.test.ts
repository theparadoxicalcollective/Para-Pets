import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_EDITOR_ZOOM_MIN, worldEditorMinZoom, worldEditorClampCamera,
  worldEditorCameraGeometry } from "../client/src/lib/worldEditorCamera";

const read=(p: string)=>readFileSync(p,"utf8");
test("World Editor keeps Pet Park's clean header and a single settings entry", () => {
  const page=read("client/src/pages/WorldSceneEditorPage.tsx");
  const controls=read("client/src/components/world-editor/WorldSceneControls.tsx");
  assert.match(page, /button-world-draft-back/);
  assert.match(page, /aria-label="Expand Ground"/);
  assert.doesNotMatch(page, /button-world-options|showWorldOptions/);
  assert.match(controls, /button-world-settings/);
  assert.match(controls, /input-world-editor-zoom/);
  assert.match(controls, /button-world-fit/);
  assert.match(controls, /select-world-draft-ground-theme/);
  assert.match(controls, /button-save-world-draft/);
  assert.match(controls, /world-settings-clear-terrain/);
  // Clearing terrain stays accessible but is not a primary creation action.
  const quick=controls.split('data-testid="world-scene-controls"')[1]
    ?.split('{!expanded && selectedItem')[0];
  assert.ok(quick);
  assert.doesNotMatch(quick, /Clear all world terrain|Clear terrain/);
  for (const label of ['+ Building','+ NPC','+ Decor','+ Effects','Paint terrain','World Settings'])
    assert.ok(quick.includes(label), label+" remains in the editor toolbar");
  assert.doesNotMatch(controls,/onClick=\{props\.onExit\}/);
  assert.doesNotMatch(controls,/type Panel =[^;]*"terrain"/);
});
test("Being a shop changes functionality, not an on-map badge or label", () => {
  const page=read("client/src/pages/WorldSceneEditorPage.tsx");
  const controls=read("client/src/components/world-editor/WorldSceneControls.tsx");
  assert.doesNotMatch(page, /<span[^>]*>Shop<\/span>/);
  assert.match(controls, /aria-label="Is Shop building"/);
  assert.match(controls, /openCreator\("shop"\)/);
  // The shelf itself is rendered by the entered-building page, not the toolbar.
  assert.match(page, /<WorldShopShelf/);
});
test("World Editor Fit keeps ground behind every pixel of the viewport", () => {
  assert.equal(WORLD_EDITOR_ZOOM_MIN,0.6);
  const wide=worldEditorCameraGeometry(390,844,4,worldEditorMinZoom(390,844,4));
  const pan=worldEditorClampCamera({x:0,y:0},wide,{width:390,height:844});
  assert.ok(wide.sceneWidth>=390 && wide.sceneHeight>=844);
  assert.deepEqual(pan,{x:0,y:0});
  const controls=read("client/src/components/world-editor/WorldSceneControls.tsx");
  assert.match(controls,/props\.onZoom\(props\.minZoom\)/);
  assert.match(controls,/max=\{1\.6\}/);
  assert.match(controls,/step=\{0\.01\}/);
});
