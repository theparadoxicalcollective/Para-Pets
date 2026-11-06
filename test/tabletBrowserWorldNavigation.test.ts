import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveMobileBrowserHeight } from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

test("ordinary touch-tablet browser chrome uses the stable layout height just like phone Safari", () => {
  assert.equal(resolveMobileBrowserHeight(1024, 900), 1024);
  assert.equal(resolveMobileBrowserHeight(1194, 1070), 1194);

  const stage = read("client/src/lib/stage.ts");
  assert.match(stage, /const touchFirst = isTouchFirstDevice\(\)/);
  assert.match(stage, /if \(touchFirst && !standalone\)/);
  assert.doesNotMatch(stage, /if \(narrow && !standalone\)/);
  assert.match(stage, /height: resolvedHeight/);
});

test("software keyboard still owns the reduced browser viewport on touch tablets", () => {
  assert.equal(resolveMobileBrowserHeight(1024, 600), 600);
  assert.equal(resolveMobileBrowserHeight(1194, 650), 650);
});

test("expanded World NPC quest spotlight follows the full-device HUD surface", () => {
  const viewport = read("client/src/lib/questGuideViewport.ts");
  const spotlight = read("client/src/components/QuestGuideSpotlight.tsx");
  assert.match(viewport, /anchor\.closest\("#game-viewport-scene, #game-viewport-hud"\)/);
  assert.match(viewport, /document\.getElementById\("game-viewport-hud"\)/);
  assert.match(viewport, /const rect = target\.getBoundingClientRect\(\)/);
  assert.match(spotlight, /const targetNode = document\.querySelector<HTMLElement>\(selector\)/);
  assert.match(spotlight, /const surface = getQuestGuideSurface\(targetNode\)/);
  assert.doesNotMatch(read("client/src/App.tsx"), /NpcQuestDiscoveryGuide/);
});

test("World camera rebases an active drag after a camera resize instead of snapping back", () => {
  const controller = read("client/src/worlds/useWorldViewportController.ts");

  assert.match(controller, /cameraInitializedRef/);
  assert.match(controller, /cameraFrameRef/);
  assert.match(controller, /cameraWorldRef/);
  assert.match(controller, /const previousFrame = cameraFrameRef\.current/);
  assert.match(controller, /const resetForWorld =/);
  assert.match(controller, /const \[pointer\] = Array\.from\(mapPanPointersRef\.current\.values\(\)\)/);
  assert.match(controller, /x: pointer\.x/);
  assert.match(controller, /y: pointer\.y/);
  assert.match(controller, /mapX: clamped\.x/);
  assert.match(controller, /mapY: clamped\.y/);
});
