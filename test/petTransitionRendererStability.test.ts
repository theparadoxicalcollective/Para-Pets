import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCostumePlacements } from "../shared/costumeFeature";
import { normalizePetParts, shouldUseLowMemoryPetRenderer, petCanvasScale } from "../client/src/lib/petRenderSafety";
import type { RuntimeMode } from "../client/src/lib/runtimeMode";

const app = readFileSync("client/src/App.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const powerUp = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const levelUp = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
const animator = readFileSync("client/src/components/PetAnimator.tsx", "utf8");
const animatorCore = readFileSync("client/src/components/PetAnimatorCore.tsx", "utf8");
const alphaBounds = readFileSync("client/src/lib/alphaBounds.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");

const runtime = (displayMode: RuntimeMode["displayMode"]): RuntimeMode => ({
  displayMode,
  isStandalone: displayMode === "ios-standalone",
  browserClassification: displayMode,
});

test("shared pet renderer removes malformed authored layers", () => {
  assert.deepEqual(normalizePetParts([
    null,
    { id: "bad", partType: "", view: "front", imageUrl: "/bad.png", width: 20, height: 20 },
    { id: "ok", templateId: "pet", partType: "body", view: "front", imageUrl: "/body.png", posX: "4", posY: null, width: "200", height: 180, zIndex: "3", pivotX: null, pivotY: undefined, rotation: "bad" },
  ]), [{
    id: "ok", templateId: "pet", partType: "body", view: "front", imageUrl: "/body.png",
    posX: 4, posY: 0, width: 200, height: 180, zIndex: 3, pivotX: 0, pivotY: 50, rotation: 0,
  }]);
});

test("legacy costume JSON is normalized before route and renderer use", () => {
  assert.deepEqual(normalizeCostumePlacements([
    undefined,
    { view: "front", depth: "front", anchorPart: "", width: 10, height: 10 },
    { view: "front", depth: "back", anchorPart: "head", width: "120", height: 80, posX: "4", posY: 5, pivotX: null, pivotY: undefined, instance: 99 },
  ]), [{
    form: "base", view: "front", depth: "back", anchorPart: "head", width: 120, height: 80,
    posX: 4, posY: 5, pivotX: 0, pivotY: 50, instance: 4, rotation: 0, flipX: false,
  }]);
});

test("all mobile hosting modes use the animated low-memory renderer", () => {
  assert.equal(shouldUseLowMemoryPetRenderer(runtime("ios-browser")), true);
  assert.equal(shouldUseLowMemoryPetRenderer(runtime("ios-embedded")), true);
  assert.equal(shouldUseLowMemoryPetRenderer(runtime("ios-standalone")), true);
  assert.equal(shouldUseLowMemoryPetRenderer(runtime("android-browser")), true);
  assert.equal(shouldUseLowMemoryPetRenderer(runtime("android-standalone")), true);
  assert.equal(shouldUseLowMemoryPetRenderer(runtime("desktop")), false);
});

test("mobile Home keeps the active pet animated in low-memory mode without raid boss", () => {
  assert.doesNotMatch(home, /lowMemoryPetRenderer && \(activePet\.hatchedImageUrl \|\| activePet\.imageUrl\)/);
  assert.match(home, /activePet\.petTemplateId \? \(/);
  assert.match(home, /<PetAnimator petTemplateId=\{activePet\.petTemplateId\} petInventoryId=\{activePet\.inventoryId\} artworkForm=\{activePet\.isEvolved \? "evolution" : "base"\} mode="idle" view="front" size=\{390\} fillContainer lowMemory=\{lowMemoryPetRenderer\}/);
  assert.doesNotMatch(home, /raidBossData/);
  assert.doesNotMatch(home, /data-testid="display-raid-boss"/);
});

test("full-screen routes do not retain the complete Home scene", () => {
  assert.match(app, /location === "\/" && \(/);
  assert.doesNotMatch(app, /visibility: location !== "\/"/);
  assert.match(home, /activePetModal === "power_up" \? null : activePet\.petTemplateId \? \(/);
  assert.match(home, /lowMemory=\{lowMemoryPetRenderer\}/);
});

test("upgrade and Closet pet trees fail locally instead of closing the game", () => {
  assert.match(powerUp, /context="PetPowerUpPage\.PetAnimator"/);
  assert.match(powerUp, /lowMemory=\{lowMemory\}/);
  assert.match(powerUp, /transientTimers\.current\.forEach/);
  assert.match(levelUp, /lowMemory=\{lowMemory\}/);
  assert.match(animator, /normalizeCostumePlacements/);
  assert.match(animatorCore, /normalizePetParts/);
  assert.match(animatorCore, /performanceStatic \|\| lowMemory/);
});

test("image analysis and pointer gestures have bounded lifecycles", () => {
  assert.match(alphaBounds, /MAX_CONCURRENT_SCANS = 2/);
  assert.match(alphaBounds, /withScanSlot/);
  assert.match(inventory, /pointerGestureAbortRef/);
  assert.ok((inventory.match(/pointercancel/g) ?? []).length >= 2);
  assert.match(home, /homeGestureAbortRef/);
});

test("active-pet API rejects malformed and marketplace-owned transitions", () => {
  assert.match(routes, /activePetId must be a pet inventory id or null/);
  assert.match(routes, /Remove this pet from the Player Market before making it active/);
});

test("Home placement shares the animator's low-memory and malformed-data safeguards", () => {
  const placement = readFileSync("client/src/components/ActivePetPlacement.tsx", "utf8");
  assert.match(home, /admin=\{user.isAdmin\} lowMemory=\{lowMemoryPetRenderer\}/);
  assert.match(placement, /normalizePetParts\(parts \?\? template\?\.parts\)/);
  assert.match(placement, /if \(lowMemory\) return;[\s\S]*?getAlphaBounds\(url\)/);
  assert.match(placement, /lowMemory \? FULL_BOUNDS/);
});


test("mobile full-size pet canvases preserve artwork coordinates without oversized surfaces", () => {
  const size = 390;
  const legacyScale = petCanvasScale(true, true, false);
  const mobileScale = petCanvasScale(true, true, true);
  assert.equal(size / legacyScale, 1300);
  assert.equal(size / mobileScale, size);
  for (const coordinate of [0, 150, 500, 900, 1000]) {
    const displayed = (scale: number) => {
      const inner = size / scale;
      const offset = -(inner - size) / 2;
      return offset + inner / 2 + (coordinate / 1000 * inner - inner / 2) * scale;
    };
    assert.ok(Math.abs(displayed(legacyScale) - displayed(mobileScale)) < 0.0001);
  }
  // Legacy non-fill slots and desktop artwork retain their sizing contract.
  assert.equal(petCanvasScale(true, false, true), .3);
  assert.equal(petCanvasScale(false, true, true), 1);
  const styles = readFileSync("client/src/index.css", "utf8");
  assert.match(styles, /1\.5px \* var\(--pet-motion-pixel-scale, 1\)/);
  assert.match(animatorCore, /"--pet-motion-pixel-scale": \(isLargeStyle \? \.3 : 1\) \/ partScale/);
  assert.match(animator, /petCanvasScale\(isLargeStyle, fillContainer \|\| fitVisible, evolvedLowMemory\)/);
  assert.match(animatorCore, /petCanvasScale\(isLargeStyle, fillContainer \|\| fitVisible, lowMemory\)/);
});

test("mobile startup and costume layers do not request unused image or GPU allocations", () => {
  assert.match(app, /petImageUrl && !lowMemoryPreload/);
  assert.doesNotMatch(animator, /willChange: (?:animName|wrapper\.animation) \?/);
  assert.match(animator, /lowMemory=\{evolvedLowMemory\}/);
});
