import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("native root no longer owns a scaled 390 by 844 rendering plane", () => {
  const app = read("client/src/App.tsx");
  const viewport = read("client/src/lib/stageViewport.ts");
  assert.doesNotMatch(app, /expandedStage|layout\.coordinateOwner === "stage"|getStageTransform\(layout\)/);
  assert.match(app, /id="game-viewport-hud"/);
  assert.match(app, /id="game-viewport-scene"/);
  assert.match(viewport, /\{ viewportSurface: true \}/);
  assert.doesNotMatch(viewport, /shouldFitPortraitReference/);
});

test("feeding gestures and walk-around scene no longer import root stage scaling", () => {
  const feeding = read("client/src/features/pet-care/FeedingOverlay.tsx");
  const walk = read("client/src/components/WalkAroundScene.tsx");
  assert.match(feeding, /clientPointInRenderedElement/);
  assert.match(feeding, /ViewportScenePortal/);
  assert.doesNotMatch(feeding, /\b(getStageScale|clientToStage|DESIGN_H)\b/);
  assert.doesNotMatch(walk, /\bgetStageScale\b/);
});

test("legacy helpers remain explicitly inventoried before deletion", () => {
  const stage = read("client/src/lib/stage.ts");
  const guide = read("client/src/lib/questGuideViewport.ts");
  const audit = read("docs/root-stage-dependency-audit-after-813.md");
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /export function getStageSurface\(/);
  assert.match(guide, /getStageSurface\(/);
  assert.match(audit, /#815/);
  assert.match(audit, /#818/);
});
