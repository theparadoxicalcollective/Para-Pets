import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overlay = readFileSync("client/src/components/BeginJourneyOverlay.tsx", "utf8");

test("starter picker is the first tutorial step and uses the live 3-star catalog", () => {
  assert.match(overlay, /"Choose your 3-star starter pet egg!"/);
  assert.match(overlay, /if \(step === 0\) setShowGrantModal\(true\)/);
  assert.match(overlay, /queryKey: \["\/api\/tutorial\/starter-pets"\]/);
  assert.match(overlay, /starterPets\.map\(\(pet\)/);
  assert.match(overlay, /\/api\/tutorial\/grant-starter-egg", \{ petId \}/);
  assert.match(overlay, /bjSetStarterInventoryId\(String\(result\.inventoryId\)\)/);
  assert.match(overlay, /bjSetStep\(1\)/);
});

test("tutorial selects only the exact granted starter inventory row", () => {
  assert.match(overlay, /const starterInventoryId = bjGetStarterInventoryId\(\)/);
  assert.match(overlay, /i\.inventoryId === starterInventoryId \|\| i\.id === starterInventoryId/);
  assert.match(overlay, /data-inventory-id=/);
  assert.match(overlay, /if \(user\?\.activePetId === starterInventoryId \|\| step3Selecting\) return/);
  assert.match(overlay, /setStep3Selecting\(true\);\s*eggButton\.click\(\);\s*return;/);
  assert.doesNotMatch(overlay, /first UNHATCHED egg/);
});

test("confirmed activation sends the player to the active pet page", () => {
  assert.match(
    overlay,
    /if \(step !== 4 \|\| location !== "\/pets"\) return;[\s\S]*?navigate\("\/"\)/,
  );
  assert.match(overlay, /"Tap your active egg!"/);
  assert.match(overlay, /'\[data-testid="button-egg-tap"\]'/);
});

test("successful hatching completes automatically without a quest-button loop", () => {
  assert.match(
    overlay,
    /activePet\?\.isHatched === true && Number\(activePet\.rarity\) === 3[\s\S]*?completeTutorialMutation\.mutate\(\)/,
  );
  assert.doesNotMatch(overlay, /questEl\?\.click\(\);\s*completeTutorialMutation\.mutate\(\)/);
  assert.doesNotMatch(overlay, /hasAnyPet && !hasUnhatched/);
  assert.match(overlay, /onError:[\s\S]*?bjSetStep\(5\);[\s\S]*?setStep\(5\)/);
});

test("tutorial stays on potion training until the active egg hatches", () => {
  assert.match(overlay, /Use all 3 hatching potions, then tap the egg to hatch it!/);
  assert.match(overlay, /if \(eggReadyToHatch\) \{/);
  assert.match(overlay, /bjSetStep5TapMode\(true\)/);
  assert.doesNotMatch(overlay, /window\.addEventListener\("bj_speedup_used"/);
});
