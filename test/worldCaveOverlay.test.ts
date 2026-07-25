import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
const overlaySource = readFileSync("client/src/components/world/WorldCaveOverlay.tsx", "utf8");

test("Murk Cave entry and battle render through one typed overlay boundary", () => {
  assert.equal((pageSource.match(/<WorldCaveOverlay/g) ?? []).length, 1);
  assert.match(overlaySource, /export interface WorldCaveOverlayProps/);
  assert.equal((overlaySource.match(/<BattleArena/g) ?? []).length, 1);
  assert.equal((pageSource.match(/<BattleArena/g) ?? []).length, 1);
  assert.match(pageSource, /battleLocationId !== MURK_CAVE_ID/);
});

test("all ten cave tiers retain their paired banner and entrance art", () => {
  for (let tier = 1; tier <= 10; tier += 1) {
    assert.match(overlaySource, new RegExp(`tier: ${tier}, banner: caveBanner${tier}, enterBtn: caveEnter${tier}`));
    assert.match(overlaySource, new RegExp(`caveBanner${tier}`));
    assert.match(overlaySource, new RegExp(`caveEnter${tier}`));
  }
  assert.match(overlaySource, /button-cave-enter-tier-\$\{tier\}/);
});

test("BattleArena keeps the cave session boundary", () => {
  for (const prop of [
    "locationId={props.locationId}", "locationName={props.locationName}",
    "bgUrl={props.backgroundUrl}", "accent={props.accent}",
    "battlePotionSlots={props.potionSlots}", "equippedPets={[props.activePet, null, null]}",
    "isCave", "caveTier={props.caveTier}", "onCaveTierComplete={props.onCaveTierComplete}",
    "onClose={props.onExitBattle}", "onBattleEnd={props.onBattleEnd}",
  ]) assert.ok(overlaySource.includes(prop), `missing preserved BattleArena prop: ${prop}`);
});

test("completion request, rewards, and invalidations remain page-owned and unchanged", () => {
  assert.match(pageSource, /apiRequest\("POST", "\/api\/cave\/complete-tier", \{/);
  assert.match(pageSource, /petInventoryId: currentUser\.activePetId/);
  assert.match(pageSource, /tier: caveBattleTier/);
  assert.match(pageSource, /\["\/api\/cave\/progress", currentUser\.activePetId\]/);
  assert.match(pageSource, /queryKey: \["\/api\/auth\/me"\]/);
  assert.match(pageSource, /Tier \$\{caveBattleTier\} clear bonus awarded\./);
  assert.match(pageSource, /Failed to save cave progress/);
  assert.doesNotMatch(overlaySource, /apiRequest|bonusCoins/);
});

test("cave close and battle exit remain explicit without routing or unrelated resets", () => {
  const closeStart = pageSource.indexOf("onCloseEntry={() => {");
  const closeSource = pageSource.slice(closeStart, pageSource.indexOf("onExitBattle", closeStart));
  assert.match(closeSource, /setShowCaveEntry\(false\)/);
  assert.match(closeSource, /setBattleLocationId\(null\)/);
  assert.doesNotMatch(closeSource, /navigate|setFishingLocation|setShowShop/);

  const exitStart = pageSource.indexOf("onExitBattle={() => {");
  const exitSource = pageSource.slice(exitStart, pageSource.indexOf("onBattleEnd", exitStart));
  assert.match(exitSource, /setShowBattle\(false\)/);
  assert.match(exitSource, /setShowCaveEntry\(true\)/);
  assert.doesNotMatch(exitSource, /navigate|setFishingLocation|setShowShop/);
});
