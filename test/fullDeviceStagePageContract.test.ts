import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");

test("stage-owned larger devices expose a physical viewport page surface", () => {
  assert.match(app, /const expandedStage = layout\.coordinateOwner === "stage"/);
  assert.match(app, /left: expandedStage \? 0 : layout\.left/);
  assert.match(app, /top: expandedStage \? 0 : layout\.top/);
  assert.match(app, /width: expandedStage \? sceneRect\.width : layout\.designWidth/);
  assert.match(app, /height: expandedStage \? sceneRect\.height : layout\.designHeight/);
  assert.match(app, /id="game-viewport-page"[\s\S]{0,700}left: 0[\s\S]{0,200}top: 0[\s\S]{0,200}width: "100%"[\s\S]{0,200}height: "100%"/);
  assert.match(app, /"--stage-reference-left": `\$\{referenceLeft\}px`/);
  assert.match(app, /"--stage-reference-top": `\$\{referenceTop\}px`/);
});

test("normal stage pages portal to that viewport while retaining a canonical reference plane", () => {
  assert.match(surface, /const VIEWPORT_PAGE_ID = "game-viewport-page"/);
  assert.match(surface, /createPortal\(content, target\)/);
  assert.match(surface, /data-page-presentation=\{fullViewport \? "full-viewport" : target \? "viewport" : "stage"\}/);
  assert.match(surface, /data-stage-reference-plane="true"/);
  assert.match(surface, /left: "var\(--stage-reference-left, 0px\)"/);
  assert.match(surface, /width: "var\(--stage-reference-width, 100%\)"/);
});

test("native iPhone reference remains the existing inline path", () => {
  assert.match(surface, /return target \? createPortal\(content, target\) : content/);
  assert.match(stage, /if \(Math\.round\(viewportWidth\) === DESIGN_W\) return false/);
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
});

test("saved coordinate geometry is not rewritten", () => {
  assert.match(stage, /export function clientToStage/);
  assert.match(stage, /export function clientDeltaToStage/);
  assert.match(stage, /export function calculateViewportSurfaceRect/);
});
