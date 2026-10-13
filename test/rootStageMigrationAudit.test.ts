import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const stage = readFileSync("client/src/lib/stage.ts", "utf8");
const viewport = readFileSync("client/src/lib/stageViewport.ts", "utf8");

test("root-stage audit: gameplay page wrappers are fully migrated", () => {
  const tags = [...app.matchAll(/<StagePageSurface\b[^>]*>/g)].map(m => m[0]);
  assert.ok(tags.length >= 18);
  for (const tag of tags) assert.match(tag, /layout="viewport"/);
  assert.doesNotMatch(surface, /data-stage-reference-plane|stage-page-reference-plane/);
});

test("root-stage audit: legacy root ownership and live consumers remain explicit", () => {
  assert.match(app, /const expandedStage = layout\.coordinateOwner === "stage"/);
  assert.match(app, /id="game-stage-content"/);
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(viewport, /shouldFitPortraitReference/);
  assert.doesNotMatch(readFileSync("client/src/components/WalkAroundScene.tsx", "utf8"), /getStageScale/);
  assert.match(readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8"), /getStagePortalTarget/);
  assert.match(readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8"), /clientToStage/);
});

test("root-stage audit: migrated gameplay routes preserve native viewport geometry", () => {
  for (const route of ["/", "/map", "/pvp", "/raid", "/raid/battle", "/games/lava-crawl", "/games/molten-blocks"]) {
    assert.equal(usesDeviceGameplaySurface(route), true, route);
    for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
      const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
      assert.equal(layout.coordinateOwner, "viewport");
      assert.equal(layout.designWidth, width);
      assert.equal(layout.designHeight, height);
      assert.equal(layout.scale, 1);
    }
  }
});
