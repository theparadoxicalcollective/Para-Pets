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

test("hatch step renders one guide at a time and recovers interrupted completion", () => {
  assert.match(overlay, /const isHatchCompletionStep = step === 5 \|\| step === 6/);
  assert.match(overlay, /refetchInterval: isHatchCompletionStep \? 1000 : false/);
  assert.match(overlay, /if \(step === 6 && activePet\?\.isHatched !== true\)/);
  assert.match(overlay, /completeTutorialMutation\.isPending \|\| showReward/);
  assert.doesNotMatch(overlay, /Step 5 tap-mode: bouncing arrow above the egg guides the player to hatch/);
  assert.match(overlay, /\{pr && stepNum !== 5 && \(/);
});

test("hatch training visibly moves the potion artwork onto the egg", () => {
  const css = readFileSync("client/src/index.css", "utf8");

  assert.match(overlay, /data-testid="tutorial-potion-drag-demo"/);
  assert.match(overlay, /src=\{tutorialPotion\.imageUrl\}/);
  assert.match(overlay, /\["--bj-drag-dx" as string\]/);
  assert.match(overlay, /\["--bj-drag-dy" as string\]/);
  assert.match(overlay, /data-testid="tutorial-potion-drag-preview"/);
  assert.match(overlay, /document\.addEventListener\("pointermove", onMove/);
  assert.match(overlay, /updatePreview\(ev\.clientX, ev\.clientY\)/);
  assert.doesNotMatch(overlay, /Step 5 drag-ghost animation: arrow sweeps/);

  assert.match(css, /translate\(var\(--bj-drag-dx, 0px\), var\(--bj-drag-dy\)\)/);
});
