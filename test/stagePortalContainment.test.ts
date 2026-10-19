import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("gameplay battle portals use viewport ownership while other consumers remain protected", () => {
  const pvp = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");
  const raid = readFileSync("client/src/pages/RaidBattlePage.tsx", "utf8");
  const petCare = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.match(pvp, /data-testid="pvp-battle-stage-overlay"/);
  assert.match(pvp, /document\.body,\s*\);/);
  assert.doesNotMatch(pvp, /getStagePortalTarget/);

  assert.match(raid, /const ghost = \{ x: draggingPotion\.screenX, y: draggingPotion\.screenY \}/);
  assert.match(raid, /document\.body/);
  assert.doesNotMatch(raid, /clientToStagePortal|getStagePortalTarget/);
  assert.match(petCare, /dragPositionRef\.current = careGhostPoint\(x, y\)/);
  assert.match(petCare, /const careGhostTarget = \(\) => document\.body/);
});

test("Clearing ground input converts rendered pointer geometry to logical stage geometry", () => {
  const clearing = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
  assert.match(clearing, /const scaleX = rect\.width \/ Math\.max\(1, logicalWidth\)/);
  assert.match(clearing, /\(e\.clientX - rect\.left\) \/ scaleX/);
  assert.match(clearing, /rect\.left \+ x \* scaleX/);
  assert.match(clearing, /!e\.isPrimary/);
  assert.match(clearing, /e\.pointerType === "mouse" && e\.button !== 0/);
  assert.match(clearing, /onPointerCancel=\{onJoystickPointerUp\}/);
});


test("player-facing overlays use their respective viewport or stage coordinate owners", () => {
  const stage = readFileSync("client/src/lib/stage.ts", "utf8");
  const guides = readFileSync("client/src/lib/questGuideViewport.ts", "utf8");
  const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
  const petCare = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.match(stage, /export function getStageSurface\(\): StageSurface/);
  assert.match(stage, /export function clientRectPointToStage/);
  assert.match(stage, /export function getStageLogicalCenter/);

  assert.match(guides, /const surface = getStageSurface\(\)/);
  assert.doesNotMatch(guides, /window\.innerWidth|window\.innerHeight/);

  assert.match(nav, /getElementById\("game-viewport-hud"\)/);
  assert.match(nav, /getBoundingClientRect\(\)\.width/);
  assert.match(nav, /ResizeObserver\(measure\)/);
  assert.doesNotMatch(nav, /getStageSurface/);

  assert.match(petCare, /careRectPoint\(box, 0\.5, 0\.3\)/);
  assert.match(petCare, /const feedbackSurface = \(\) => overlayRef\.current/);
  assert.doesNotMatch(petCare, /getStageLogicalCenter\(\)/);
  assert.doesNotMatch(petCare, /const cx = box \? box\.left \+ box\.width \/ 2 : window\.innerWidth \/ 2/);
  assert.doesNotMatch(petCare, /const cy = box \? box\.top \+ box\.height \* 0\.3 : window\.innerHeight \/ 2/);
});

test("battle drag ghosts use their respective coordinate owners and Clearing keeps its input contract", () => {
  const pvp = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");
  const raid = readFileSync("client/src/pages/RaidBattlePage.tsx", "utf8");
  const petCare = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  const clearing = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");

  assert.match(pvp, /document\.body,\s*\);/);
  assert.doesNotMatch(pvp, /getStagePortalTarget/);
  assert.match(raid, /const ghost = \{ x: draggingPotion\.screenX, y: draggingPotion\.screenY \}/);
  assert.match(raid, /document\.body/);
  assert.doesNotMatch(raid, /clientToStagePortal|getStagePortalTarget/);
  assert.match(petCare, /dragPositionRef\.current = careGhostPoint\(x, y\)/);
  assert.match(petCare, /const careGhostTarget = \(\) => document\.body/);
  assert.match(clearing, /const scaleX = rect\.width \/ Math\.max\(1, logicalWidth\)/);
  assert.match(clearing, /\(e\.clientX - rect\.left\) \/ scaleX/);
});

test("portal target honors native viewport ownership across screen sizes and mount transitions", async () => {
  const { getStagePortalTarget } = await import("../client/src/lib/stage");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const body = { id: "body" };
  const stage = { dataset: {} as Record<string, string>, id: "game-stage" };
  const content = { id: "game-stage-content" };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body,
      getElementById(id: string) {
        return id === "game-stage" ? stage : id === "game-stage-content" ? content : null;
      },
    },
  });
  try {
    // The native root can be mounting before its coordinate-owner attribute exists.
    assert.equal(getStagePortalTarget(), body);
    stage.dataset.coordinateOwner = "viewport";
    assert.equal(getStagePortalTarget(), body);
    // Keep the explicit stage-owner branch for any audited legacy consumer.
    stage.dataset.coordinateOwner = "stage";
    assert.equal(getStagePortalTarget(), content);
    delete stage.dataset.coordinateOwner;
    assert.equal(getStagePortalTarget(), body);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
