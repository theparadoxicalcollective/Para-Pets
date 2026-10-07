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

test("auth and loading root use the same full-device/reference-plane split", () => {
  assert.match(root, /calculateViewportSurfaceRect/);
  assert.match(root, /data-testid="root-stage-reference-plane"/);
  assert.match(root, /width: expandedStage \? surface\.width : layout\.designWidth/);
  assert.match(root, /left: -surface\.left/);
  assert.match(root, /top: -surface\.top/);
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
