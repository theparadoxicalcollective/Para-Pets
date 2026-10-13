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

test("expanded World guide targets use the full-device HUD coordinate surface", () => {
  const viewport = read("client/src/lib/questGuideViewport.ts");
  const npcGuide = read("client/src/components/NpcQuestDiscoveryGuide.tsx");
  const spotlight = read("client/src/components/QuestGuideSpotlight.tsx");

  assert.match(viewport, /anchor\.closest\("#game-viewport-scene, #game-viewport-hud"\)/);
  assert.match(viewport, /document\.getElementById\("game-viewport-hud"\)/);
  assert.match(viewport, /const rect = target\.getBoundingClientRect\(\)/);
  assert.match(viewport, /const logicalWidth = target\.clientWidth \|\| rect\.width/);
  assert.match(viewport, /const logicalHeight = target\.clientHeight \|\| rect\.height/);
  assert.match(viewport, /const scale = Math\.max\(rect\.width \/ Math\.max\(1, logicalWidth\), 0\.0001\)/);

  assert.match(npcGuide, /const targetElement = document\.querySelector<HTMLElement>\(selector\)/);
  assert.match(npcGuide, /const surface = getQuestGuideSurface\(targetElement\)/);
  assert.match(spotlight, /const targetNode = document\.querySelector<HTMLElement>\(selector\)/);
  assert.match(spotlight, /const surface = getQuestGuideSurface\(targetNode\)/);
});

test("Ginny being visible in an expanded World can transition the discovery guide out of pan mode", () => {
  const npcGuide = read("client/src/components/NpcQuestDiscoveryGuide.tsx");

  assert.match(npcGuide, /const targetOnScreen = guideTargetOnScreen\(guideRect, surface\.width, surface\.height\)/);
  assert.match(npcGuide, /atWorld && targetOnScreen \? `This is \$\{current\?\.name\}\. Click to continue\.`/);
  assert.match(npcGuide, /const guideMode = atWorld \? \(targetOnScreen && npcElement \? "tour" as const : "pan" as const\)/);
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
