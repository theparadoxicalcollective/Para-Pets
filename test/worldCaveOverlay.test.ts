import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
const overlaySource = readFileSync("client/src/components/world/WorldCaveOverlay.tsx", "utf8");
const arenaSource = readFileSync("client/src/components/BattleArena.tsx", "utf8");
const routesSource = readFileSync("server/routes.ts", "utf8");
const storageSource = readFileSync("server/storage.ts", "utf8");

test("Murk Cave entry and battle render through one typed overlay boundary", () => {
  assert.equal((pageSource.match(/<WorldCaveOverlay/g) ?? []).length, 1);
  assert.match(overlaySource, /export interface WorldCaveOverlayProps/);
  assert.equal((overlaySource.match(/<BattleArena/g) ?? []).length, 1);
  assert.equal((pageSource.match(/<BattleArena/g) ?? []).length, 1);
  assert.match(pageSource, /battleLocationId !== MURK_CAVE_ID/);
});

test("all ten cave tiers retain their paired banner and entrance art", () => {
  for (let tier = 1; tier <= 10; tier += 1) {
    const enterArt = tier <= 5 ? tier : tier - 5;
    assert.match(overlaySource, new RegExp(`tier: ${tier}, banner: caveBanner${tier}, enterBtn: caveEnter${enterArt}`));
    assert.match(overlaySource, new RegExp(`caveBanner${tier}`));
    assert.match(overlaySource, new RegExp(`caveEnter${enterArt}`));
  }
  assert.match(overlaySource, /button-cave-enter-tier-\$\{tier\}/);
});

test("all ten tiers share one fixed Enter-button layout contract", () => {
  assert.match(overlaySource, /export const CAVE_ENTER_LAYOUT = \{/);
  assert.match(overlaySource, /height: "24%"/);
  assert.match(overlaySource, /\.\.\.CAVE_ENTER_LAYOUT/);
  assert.match(overlaySource, /w-full h-full object-contain object-bottom/);
  assert.equal((overlaySource.match(/CAVE_ENTER_LAYOUT/g) ?? []).length, 2);
});

test("the selected cave tier is preserved from entry through the six-wave battle", () => {
  assert.match(pageSource, /onEnterTier=\{\(tier\) => \{[\s\S]*?setCaveBattleTier\(tier\)/);
  assert.match(overlaySource, /caveTier=\{props\.caveTier\}/);
  assert.match(arenaSource, /encounterBody\.caveTier = caveTier/);
  assert.match(arenaSource, /WAVE \{\(allEnemies\[waveIndex\]\?\.waveGroup \?\? waveIndex\) \+ 1\} \/ 6/);
});

test("six-wave victory reports cave completion exactly once", () => {
  assert.match(arenaSource, /caveCompletionReportedRef = useRef\(false\)/);
  assert.match(arenaSource, /isCave && phase === "victory" && !caveCompletionReportedRef\.current/);
  assert.match(arenaSource, /caveCompletionReportedRef\.current = true/);
  assert.equal((arenaSource.match(/onCaveTierComplete\?\.\(\)/g) ?? []).length, 1);
});

test("server completion persistence and rewards are retry-safe", () => {
  assert.match(routesSource, /completePetCaveTier\(petInventoryId, tier\)/);
  assert.match(routesSource, /progress\.newlyCompleted \? tier \* 100 : 0/);
  assert.match(storageSource, /pg_advisory_xact_lock/);
  assert.match(storageSource, /previousCompleted\.includes\(tier\)/);
  assert.match(storageSource, /ON CONFLICT \(pet_inventory_id\) DO UPDATE/);
});

test("cleared state and the following tier use refreshed persisted progress", () => {
  assert.match(overlaySource, /completedTiers\.includes\(tier\)/);
  assert.match(overlaySource, /✓ CLEARED/);
  assert.match(overlaySource, /completedTiers\.includes\(tier - 1\)/);
  assert.match(pageSource, /invalidateQueries\(\{ queryKey: \["\/api\/cave\/progress", currentUser\.activePetId\] \}\)/);
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

test("each tier 1-10 follows the exact tier-number and six-wave lifecycle", () => {
  assert.match(arenaSource, /useState\(0\)/, "every remounted BattleArena starts at wave index zero");
  assert.match(routesSource, /const caveEncounters = \[/);
  for (let tier = 1; tier <= 10; tier += 1) {
    const enterArt = tier <= 5 ? tier : tier - 5;
    assert.match(overlaySource, new RegExp(`tier: ${tier}, banner: caveBanner${tier}, enterBtn: caveEnter${enterArt}`));
    assert.match(overlaySource, /onClick=\{\(\) => props\.onEnterTier\(tier\)\}/,
      `Tier ${tier} must pass its mapped tier value`);
    assert.match(overlaySource, /caveTier=\{props\.caveTier\}/);
  }
  for (let wave = 0; wave < 6; wave += 1) {
    assert.match(routesSource, new RegExp(`"(?:normal|miniBoss|boss)", ${wave}\\)`), `wave group ${wave} must exist`);
  }
  assert.doesNotMatch(routesSource, /"(?:normal|miniBoss|boss)", 6\)/);
});

test("server rejects starting or completing a locked cave tier", () => {
  assert.match(routesSource, /isCaveTierAccessible\(caveProgress, reqCaveTier\)/);
  assert.match(routesSource, /Cave tier \$\{reqCaveTier\} is locked/);
  assert.match(storageSource, /completeCaveTier\(\{/);
  assert.match(routesSource, /err instanceof CaveTierLockedError/);
});
