import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("gameplay portals remain contained by the portrait stage", () => {
  const pvp = readFileSync("client/src/pages/PvpBattlePage.tsx", "utf8");
  const raid = readFileSync("client/src/pages/RaidBattlePage.tsx", "utf8");
  const petCare = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

  assert.match(pvp, /data-testid="pvp-battle-stage-overlay"/);
  assert.match(pvp, /getStagePortalTarget\(\)/);
  assert.doesNotMatch(pvp, /<div data-testid="pvp-battle-stage-overlay"[\s\S]*?document\.body/);

  assert.match(raid, /const ghost = clientToStage\(draggingPotion\.screenX, draggingPotion\.screenY\)/);
  assert.match(raid, /getStagePortalTarget\(\)/);
  assert.match(petCare, /dragPositionRef\.current = clientToStage\(x, y\)/);
  assert.match(petCare, /getStagePortalTarget\(\)/);
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
