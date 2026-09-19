import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCostumePlacements } from "../shared/costumeFeature";
import { normalizePetParts, shouldUseLowMemoryPetRenderer } from "../client/src/lib/petRenderSafety";
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
    view: "front", depth: "back", anchorPart: "head", width: 120, height: 80,
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

test("mobile Home renders flattened active-pet artwork without raid boss", () => {
  const mobileFlatArt = home.indexOf("lowMemoryPetRenderer && (activePet.hatchedImageUrl || activePet.imageUrl)");
  const layeredActivePet = home.indexOf("activePet.petTemplateId ? (", mobileFlatArt);
  assert.ok(mobileFlatArt >= 0);
  assert.ok(layeredActivePet > mobileFlatArt);
  assert.doesNotMatch(home, /raidBossData/);
  assert.doesNotMatch(home, /data-testid="display-raid-boss"/);
  assert.match(home, /decoding="async"/);
  assert.match(routes, /hatched_image_url AS "hatchedImageUrl"/);
  assert.match(routes, /hatchedImageUrl: _raidBossCache\.hatchedImageUrl/);
});

test("full-screen routes do not retain the complete Home scene", () => {
  assert.match(app, /location === "\/" && \(/);
  assert.doesNotMatch(app, /visibility: location !== "\/"/);
  assert.match(home, /activePetModal === "power_up" \? null : lowMemoryPetRenderer/);
  assert.match(home, /activePet\.petTemplateId \? \(/);
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
