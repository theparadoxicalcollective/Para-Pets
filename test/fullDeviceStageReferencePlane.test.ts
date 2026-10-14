import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const root = readFileSync("client/src/RootEntry.tsx", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");

test("larger devices use a full-device stage around a centered authored reference plane", () => {
  assert.match(app, /const expandedStage = layout\.coordinateOwner === "stage"/);
  assert.match(app, /width: expandedStage \? sceneRect\.width : layout\.designWidth/);
  assert.match(app, /height: expandedStage \? sceneRect\.height : layout\.designHeight/);
  assert.match(app, /left: referenceLeft/);
  assert.match(app, /top: referenceTop/);
  assert.match(app, /width: layout\.designWidth/);
  assert.match(app, /height: layout\.designHeight/);
});

test("auth loading and verification root use a native viewport without a reference plane", () => {
  assert.match(root, /useStageViewportLayout\("\/"\)/);
  assert.match(root, /data-coordinate-owner="viewport"/);
  assert.match(root, /data-reference-portrait="false"/);
  assert.match(root, /width: layout\.viewportWidth/);
  assert.match(root, /height: layout\.viewportHeight/);
  assert.doesNotMatch(root, /root-stage-reference-plane/);
  assert.doesNotMatch(root, /scale\(\$\{layout\.scale\}\)/);
});

test("input math remains based on the authored reference plane", () => {
  assert.match(stage, /document\.getElementById\("game-stage-content"\)/);
  assert.match(stage, /root-stage-reference-plane/);
  assert.match(stage, /clientX - referenceRect\.left/);
  assert.match(stage, /clientY - referenceRect\.top/);
});

test("iPhone 12 reference constants are unchanged", () => {
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /if \(Math\.round\(viewportWidth\) === DESIGN_W\) return false/);
});
