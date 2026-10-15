import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("client/src/App.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");

test("native root exposes a viewport page host without legacy scaling", () => {
  assert.match(app, /id="game-viewport-page"/);
  assert.match(app, /data-stage-coordinate-owner="viewport"/);
  assert.doesNotMatch(app, /expandedStage|--stage-reference-left|--stage-reference-top/);
});

test("gameplay pages portal to the viewport without a canonical reference plane", () => {
  assert.match(surface, /const VIEWPORT_PAGE_ID = "game-viewport-page"/);
  assert.match(surface, /createPortal\(content, target\)/);
  assert.match(surface, /data-page-presentation="full-viewport"/);
  assert.doesNotMatch(surface, /data-stage-reference-plane="true"/);
  assert.doesNotMatch(surface, /--stage-reference-left/);
  assert.doesNotMatch(surface, /--stage-reference-width/);
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
