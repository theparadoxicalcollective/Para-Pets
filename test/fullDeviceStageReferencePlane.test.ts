import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const root = readFileSync("client/src/RootEntry.tsx", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");

test("gameplay root uses a native viewport without a centered reference plane", () => {
  assert.match(app, /data-coordinate-owner="viewport"/);
  assert.match(app, /id="game-viewport-page"/);
  assert.match(app, /id="game-viewport-hud"/);
  assert.doesNotMatch(app, /expandedStage|referenceLeft|referenceTop|scale\(\$\{layout\.scale\}\)/);
});

test("auth loading and verification root use a native viewport without a reference plane", () => {
  assert.match(root, /useStageViewportLayout\("\/auth"\)/);
  assert.match(root, /data-coordinate-owner="viewport"/);
  assert.match(root, /data-reference-portrait="false"/);
  assert.match(root, /width: layout\.viewportWidth/);
  assert.match(root, /height: layout\.viewportHeight/);
  assert.doesNotMatch(root, /root-stage-reference-plane/);
  assert.doesNotMatch(root, /scale\(\$\{layout\.scale\}\)/);
});

test("input math remains based on the authored reference plane", () => {
  assert.match(stage, /document\.getElementById\("game-stage-content"\)/);
  assert.doesNotMatch(stage, /root-stage-reference-plane/);
  assert.match(stage, /document\.getElementById\("game-stage-content"\)/);
  assert.match(stage, /clientX - referenceRect\.left/);
  assert.match(stage, /clientY - referenceRect\.top/);
});

test("iPhone 12 reference constants are unchanged", () => {
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /if \(Math\.round\(viewportWidth\) === DESIGN_W\) return false/);
});
