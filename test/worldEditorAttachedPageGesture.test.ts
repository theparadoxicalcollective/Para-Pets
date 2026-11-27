import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isWorldEditorDoubleTap, worldEditorAttachedPage, worldEditorLegacyPagePath } from "../client/src/lib/worldEditorPageGesture";
import type { WorldSceneAsset, WorldScenePlacement } from "../shared/worlds/worldSceneContent";

const worldId = "haunted_woods";
const decor: WorldSceneAsset = { id: "art", worldId, name: "Haunted Spin", kind: "decor",
  imageUrl: "/world-assets/uploads/HauntedSpinDecor.png", tapImageUrl: null, interiorImageUrl: null, nightInteriorImageUrl: null };
const placement: WorldScenePlacement = {
  id: "spin", worldId, kind: "decor", assetId: decor.id, npcId: null, terrainKey: null,
  effectType: null, effectColor: null, interiorDarkness: 35, interiorNightDarkness: null,
  xPct: .5, yPct: .5, size: 100, flipped: false, layer: 0,
  decorEffects: [], isWaterSource: false, decorSurface: "barrier", isShop: false,
  legacyLocationId: null, shopItemIds: [], shopItemPlacements: [],
};

test("a pair of completed selected-object taps must match identity, pointer type, time and location", () => {
  const first = { itemId: "spin", pointerType: "touch", x: 150, y: 200, time: 1000 };
  const second = { ...first, x: 157, y: 208, time: 1280 };
  assert.equal(isWorldEditorDoubleTap(null, second), false);
  assert.equal(isWorldEditorDoubleTap(first, second), true);
  assert.equal(isWorldEditorDoubleTap(first, { ...second, time: 1451 }), false);
  assert.equal(isWorldEditorDoubleTap(first, { ...second, time: 999 }), false);
  assert.equal(isWorldEditorDoubleTap(first, { ...second, itemId: "other" }), false);
  assert.equal(isWorldEditorDoubleTap(first, { ...second, pointerType: "mouse" }), false);
  assert.equal(isWorldEditorDoubleTap(first, { ...second, x: 180 }), false);
});

test("only real attached pages open, with shared Haunted Spin identity and linked building precedence", () => {
  assert.deepEqual(worldEditorAttachedPage(worldId, placement, decor), { kind: "beau-prize-wheel" });
  assert.deepEqual(worldEditorAttachedPage(worldId, placement, { ...decor, name: "Renamed" }), { kind: "beau-prize-wheel" });
  assert.equal(worldEditorAttachedPage(worldId, placement, { ...decor, name: "Ordinary decor", imageUrl: "ordinary" }), null);
  assert.equal(worldEditorAttachedPage("swamp", { ...placement, worldId: "swamp" }, { ...decor, worldId: "swamp" }), null);
  assert.equal(worldEditorAttachedPage(worldId, { ...placement, kind: "npc" }, decor), null);
  assert.equal(worldEditorAttachedPage(worldId, placement, { ...decor, id: "unrelated" }), null);
  const building = { ...placement, kind: "building" as const };
  const buildingAsset = { ...decor, name: "Building", kind: "building" as const, interiorImageUrl: "room" };
  assert.deepEqual(worldEditorAttachedPage(worldId, building, buildingAsset), { kind: "room" });
  assert.equal(worldEditorAttachedPage(worldId, building, { ...buildingAsset, interiorImageUrl: null }), null);
  assert.deepEqual(worldEditorAttachedPage(worldId, { ...building, legacyLocationId: "old-id" }, buildingAsset),
    { kind: "legacy", locationId: "old-id" });
});

test("legacy destinations are verified by catalog ID and known world; only verified admins get a return to editor", () => {
  assert.equal(worldEditorLegacyPagePath(worldId, "old&name", { id: "old&name", worldId: "swamp" }),
    "/world/swamp?legacyLocationId=old%26name&returnEditor=haunted_woods");
  assert.equal(worldEditorLegacyPagePath(worldId, "old", { id: "other", worldId: "swamp" }), null);
  assert.equal(worldEditorLegacyPagePath(worldId, "old", { id: "old", worldId: "bad" }), null);
  assert.equal(worldEditorLegacyPagePath("bad", "old", { id: "old", worldId: "swamp" }), null);
  assert.equal(worldEditorLegacyPagePath(worldId, "old", undefined), null);
  const app = readFileSync("client/src/App.tsx", "utf8");
  assert.match(app, /canReturnToEditor = !!legacyLocationId && user\?\.isAdmin && user\?\.emailVerified/);
  assert.match(app, /screenDone && canReturnToEditor/);
  assert.match(app, /button-return-to-world-editor/);
});

test("editor uses the existing admin wheel dialog, without spin or publication writes", () => {
  const page = readFileSync("client/src/pages/WorldSceneEditorPage.tsx", "utf8");
  assert.match(page, /!drag\.moved && !pinch\.current/);
  assert.match(page, /touchPoints\.current\.size === 1 && event\.isPrimary/);
  assert.match(page, /isWorldEditorDoubleTap\(selectedPageTap\.current, tap\)/);
  assert.match(page, /pollStatus: false, adminOnly: true/);
  assert.match(page, /await beauWheel\.open\(\)/);
  assert.match(page, /<BeauPrizeWheelDialog/);
  assert.doesNotMatch(page, /\/api\/beau-prize-wheel\/spin/);
  const hook = readFileSync("client/src/components/world/useWorldSceneBeauWheel.ts", "utf8");
  assert.match(hook, /pollStatus = true, adminOnly = false/);
  assert.match(hook, /adminOnly && !next\.isAdmin/);
  assert.match(hook, /enabled: enabled && pollStatus/);
});
