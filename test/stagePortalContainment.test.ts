import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("gameplay portals preserve legacy consumers while Raid Battle uses viewport pointer coordinates", () => {
  const pvp = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");
  const raid = readFileSync("client/src/pages/RaidBattlePage.tsx", "utf8");
  const petCare = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.match(pvp, /data-testid="pvp-battle-stage-overlay"/);
  assert.match(pvp, /getStagePortalTarget\(\)/);
  assert.doesNotMatch(pvp, /<div data-testid="pvp-battle-stage-overlay"[\s\S]*?document\.body/);

  assert.match(raid, /const ghost = \{ x: draggingPotion\.screenX, y: draggingPotion\.screenY \}/);
  assert.match(raid, /document\.body/);
  assert.doesNotMatch(raid, /clientToStagePortal|getStagePortalTarget/);
  assert.match(petCare, /dragPositionRef\.current = careGhostPoint\(x, y\)/);
  assert.match(petCare, /careGhostTarget\(\)/);
});

test("Clearing ground input converts rendered pointer geometry to logical stage geometry", () => {
  const clearing = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
  assert.match(clearing, /const stageScale = getStageScale\(\)/);
  assert.match(clearing, /\(e\.clientX - rect\.left\) \/ stageScale/);
  assert.match(clearing, /rect\.left \+ x \* stageScale/);
  assert.match(clearing, /!e\.isPrimary/);
  assert.match(clearing, /e\.pointerType === "mouse" && e\.button !== 0/);
  assert.match(clearing, /onPointerCancel=\{onJoystickPointerUp\}/);
});


test("player-facing overlays share the stage coordinate contract instead of physical window geometry", () => {
  const stage = readFileSync("client/src/lib/stage.ts", "utf8");
  const guides = readFileSync("client/src/lib/questGuideViewport.ts", "utf8");
  const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
  const petCare = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.match(stage, /export function getStageSurface\(\): StageSurface/);
  assert.match(stage, /export function clientRectPointToStage/);
  assert.match(stage, /export function getStageLogicalCenter/);

  assert.match(guides, /const surface = getStageSurface\(\)/);
  assert.doesNotMatch(guides, /window\.innerWidth|window\.innerHeight/);

  assert.match(nav, /getStageSurface\(\)\.logicalWidth/);
  assert.doesNotMatch(nav, /const available = window\.innerWidth/);

  assert.match(petCare, /careRectPoint\(box, 0\.5, 0\.3\)/);
  assert.match(petCare, /getStageLogicalCenter\(\)/);
  assert.doesNotMatch(petCare, /const cx = box \? box\.left \+ box\.width \/ 2 : window\.innerWidth \/ 2/);
  assert.doesNotMatch(petCare, /const cy = box \? box\.top \+ box\.height \* 0\.3 : window\.innerHeight \/ 2/);
});

test("battle drag ghosts use their respective coordinate owners and Clearing keeps its input contract", () => {
  const pvp = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");
  const raid = readFileSync("client/src/pages/RaidBattlePage.tsx", "utf8");
  const petCare = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const clearing = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");

  assert.match(pvp, /getStagePortalTarget\(\)/);
  assert.match(raid, /const ghost = \{ x: draggingPotion\.screenX, y: draggingPotion\.screenY \}/);
  assert.match(raid, /document\.body/);
  assert.doesNotMatch(raid, /clientToStagePortal|getStagePortalTarget/);
  assert.match(petCare, /dragPositionRef\.current = careGhostPoint\(x, y\)/);
  assert.match(petCare, /careGhostTarget\(\)/);
  assert.match(clearing, /const stageScale = getStageScale\(\)/);
  assert.match(clearing, /\(e\.clientX - rect\.left\) \/ stageScale/);
});
