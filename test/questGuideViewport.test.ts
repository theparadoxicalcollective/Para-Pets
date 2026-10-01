import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { guideBoundsInSurface, guideCardShouldMoveUp, guideDialogMaxHeight, guideFocusPoint, guideSpotlightCircle, guideTargetOnScreen } from "../client/src/lib/questGuideViewport";
import { calculateStageLayout } from "../client/src/lib/stage";

test("quest guides distinguish visible targets from panned-off targets on phone and desktop", () => {
  for (const [width, height] of [[390, 844], [360, 740], [740, 360], [1440, 900], [1024, 600]]) {
    assert.equal(guideTargetOnScreen({ left: width / 2 - 40, right: width / 2 + 40, top: height - 180, bottom: height - 80 }, width, height), true);
    assert.equal(guideTargetOnScreen({ left: width / 2 - 40, right: width / 2 + 40, top: height + 5, bottom: height + 105 }, width, height), false);
    assert.equal(guideTargetOnScreen({ left: width + 5, right: width + 105, top: 100, bottom: 200 }, width, height), false);
    assert.equal(guideTargetOnScreen({ left: 100, right: 200, top: height - 40, bottom: height + 80 }, width, height), false);
  }
});

test("the guide card moves away from a lower world without moving for an upper target", () => {
  assert.equal(guideCardShouldMoveUp({ left: 100, right: 220, top: 620, bottom: 760 }, 844, 130), true);
  assert.equal(guideCardShouldMoveUp({ left: 100, right: 220, top: 200, bottom: 330 }, 844, 130), false);
});

test("quest dialogs use the logical game-frame height on phone and short landscape screens", () => {
  assert.equal(guideDialogMaxHeight(844), 812);
  assert.equal(guideDialogMaxHeight(740), 708);
  const landscape = calculateStageLayout(768, 360);
  const renderedDialogHeight = guideDialogMaxHeight(landscape.designHeight) * landscape.scale;
  assert.ok(renderedDialogHeight > 330 && renderedDialogHeight < landscape.viewportHeight);
});

test("desktop stage scaling returns the same guide coordinates as the iPhone 12 layout", () => {
  const phone = { left: 240, right: 320, top: 600, bottom: 680 };
  for (const [width, height] of [[768, 900], [1024, 768], [1440, 1100]]) {
    const stage = calculateStageLayout(width, height);
    const desktop = { left: stage.left + phone.left * stage.scale, right: stage.left + phone.right * stage.scale,
      top: stage.top + phone.top * stage.scale, bottom: stage.top + phone.bottom * stage.scale };
    const converted = guideBoundsInSurface(desktop, stage);
    for (const side of ["left", "right", "top", "bottom"] as const) assert.ok(Math.abs(converted[side] - phone[side]) < 0.0001);
    assert.equal(guideTargetOnScreen(converted, stage.designWidth, stage.designHeight), true);
  }
});

test("Lonelle's pet and closet highlights remain compact on the iPhone 12 reference", () => {
  const pet = guideFocusPoint({ left: 8, right: 382, top: 270, bottom: 735 }, 390, 844, "pet");
  assert.deepEqual(pet, { x: 195, y: 479.25, size: 108 });
  const closet = guideFocusPoint({ left: 139, right: 248, top: 606, bottom: 678 }, 390, 844, "control");
  assert.deepEqual(closet, { x: 193.5, y: 642, size: 66 });
  assert.ok(pet.size < 382 - 8);
});

test("generic quest spotlights stay compact instead of inheriting oversized world or pet wrappers", () => {
  assert.deepEqual(guideSpotlightCircle({ left: 100, right: 200, top: 200, bottom: 260 }, 390, 844), { x: 150, y: 230, size: 88 });
  assert.equal(guideSpotlightCircle({ left: -50, right: 350, top: 100, bottom: 700 }, 390, 844).size, 108);
});

test("quest guide interaction guard supports target-only, pan, and read-only tour behavior", () => {
  const spotlightSource = readFileSync("client/src/components/QuestGuideSpotlight.tsx", "utf8");
  assert.match(spotlightSource, /mode === "pan"/);
  assert.match(spotlightSource, /document\.addEventListener\("pointerdown", onPointerBoundary, true\)/);
  assert.match(spotlightSource, /document\.addEventListener\("pointerup", onPointerBoundary, true\)/);
  assert.match(spotlightSource, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(spotlightSource, /element\?\.closest\(INTERACTIVE_SELECTOR\)/);
  assert.match(spotlightSource, /blockingGuide = false/);
  assert.match(spotlightSource, /const tourInteractive = blockingGuide && mode === "tour"/);
  assert.match(spotlightSource, /pointerEvents: tourInteractive \? "auto" : "none"/);
  assert.match(spotlightSource, /!blockingGuide[\s\S]*?"transparent"/);
  assert.match(spotlightSource, /radial-gradient\(circle/);
  assert.match(spotlightSource, /\[aria-modal="true"\], \[data-quest-guide-blocker="true"\]/);
  assert.match(spotlightSource, /selector\.startsWith\('\[data-testid="button-location-'/);
  assert.match(spotlightSource, /panNodePrefix/);

  const lonelleSource = readFileSync("client/src/components/LonelleQuestOverlay.tsx", "utf8");
  assert.match(lonelleSource, /<QuestGuideSpotlight/);
  assert.match(lonelleSource, /mode=\{guideMode\}/);
  assert.match(lonelleSource, /blockingGuide=\{false\}/);

  const npcSource = readFileSync("client/src/components/NpcQuestDiscoveryGuide.tsx", "utf8");
  assert.match(npcSource, /targetOnScreen && npcElement \? "tour"/);
  assert.match(npcSource, /: atMap \? "pan"/);
  assert.match(npcSource, /button-skip-npc-guide/);
  assert.match(npcSource, /blockingGuide/);
  assert.match(npcSource, /const shouldLoadTour = eligible;/);
  assert.match(npcSource, /blockingOverlay/);

  const appSource = readFileSync("client/src/App.tsx", "utf8");
  assert.match(appSource, /data-testid="modal-haunted-world-welcome"/);
  assert.match(appSource, /data-quest-guide-blocker="true"/);
});
