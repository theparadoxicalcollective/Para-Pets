import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("server/petEvolution.ts", "utf8");
const routes = readFileSync("server/routes/petEvolution.routes.ts", "utf8");
const panel = readFileSync("client/src/components/powerup/PowerUpEvolutionPanel.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const animator = readFileSync("client/src/components/PetAnimator.tsx", "utf8");
const animatorCore = readFileSync("client/src/components/PetAnimatorCore.tsx", "utf8");
const costumes = readFileSync("server/routes/costumePlayer.routes.ts", "utf8");
const rules = readFileSync("shared/evolution.ts", "utf8");

test("six completed nodes unlock an atomic server-owned evolution", () => {
  assert.match(routes, /\/api\/pet-evolution\/active\/evolve/);
  assert.match(server, /completedSlots < EVOLUTION_SLOT_COUNT/);
  assert.match(server, /SET is_evolved = true/);
  assert.match(server, /evolution_artwork_missing/);
  assert.match(server, /ep\.form = 'evolution'/);
});

test("Power Up confirms and reveals the authored evolution form", () => {
  assert.match(panel, /Evolve \{state\.target\.name\}\?/);
  assert.match(panel, /Confirm Evolution/);
  assert.match(panel, /reveal-blackout/);
  assert.match(panel, /reveal-evolved-blackout/);
  assert.match(panel, /reveal-revealed/);
  assert.match(panel, /artworkForm="evolution"/);
  assert.match(panel, /PetAnimatorCore/);
  assert.match(panel, /mode="static"[\s\S]*performanceStatic lowMemory/);
  assert.doesNotMatch(panel, /pupevo-final-backdrop\{[^}]*backdrop-filter/);
  assert.doesNotMatch(panel, /pupevoFinalRing 1\.25s ease-out infinite/);
  assert.match(panel, /pupevo-slot\.evolution-ready::before/);
  assert.match(panel, /pupevoEvolutionSparkles/);
  assert.doesNotMatch(panel, /pupevoEvolutionReady/);
  assert.doesNotMatch(panel, /Evolution Coming Soon/);
});

test("inventory-backed animated pets automatically use evolution parts", () => {
  assert.match(costumes, /isEvolved:/);
  assert.match(animator, /costumeData\?\.isEvolved \? "evolution" : "base"/);
  assert.match(animator, /petTemplateQuery\(petTemplateId, resolvedArtworkForm\)/);
  assert.match(animator, /artworkDecisionReady = artworkForm !== undefined \|\| !resolvedPetInventoryId \|\| costumeData !== undefined/);
  assert.match(animator, /enabled: artworkDecisionReady && templateQuery\.enabled/);
  assert.match(animator, /artworkDecisionReady \? \(/);
  assert.match(animator, /lowMemory=\{evolvedLowMemory\}/);
  assert.match(animator, /artworkForm=\{resolvedArtworkForm\}/);
});

test("evolution nodes require 5,000 points while completed nodes remain stored", () => {
  for (const rarity of [1, 2, 3, 4, 5]) assert.match(rules, new RegExp(`${rarity}: 5000`));
  assert.match(server, /completed_slots/);
});


test("evolution Tail 1 stays visibly subtle while rear-layer ears follow their head", () => {
  assert.match(animatorCore, /@keyframes petIdleEvolutionTail[\s\S]*rotate\(-1\.5deg\)[\s\S]*rotate\( 1\.5deg\)/);
  assert.match(animatorCore, /isEvolutionTailOne \? "5\.5s"/);
  assert.match(animatorCore, /artworkForm === "evolution"[\s\S]*EAR_PART_TYPES\.has\(basePetPartType\(part\.partType\)\)/);
  assert.match(animatorCore, /const evolutionForegroundLimbZ = artworkForm === "evolution"/);
  assert.match(animatorCore, /EAR_PART_TYPES\.has\(basePetPartType\(part\.partType\)\)[\s\S]*?evolutionForegroundLimbZ - 0\.5/);
  assert.match(animatorCore, /const sortedBodyByZ = \[\.\.\.bodyParts\]\.sort\(\(a, b\) => a\.zIndex - b\.zIndex\)/);
  assert.match(animatorCore, /evolutionRearEarHeadGroups\.set\(part\.id, \{ head: group\.head, groupIndex \}\)/);
  assert.match(animatorCore, /data-evolution-ear-head-sync=\{evolutionEarHeadGroup\.head\.partType\}/);
  assert.match(animatorCore, /animation: headMotion\.animation[\s\S]*zIndex: partZ/);
});

test("Power Up tray stacks duplicate inventory rows by catalog item", () => {
  assert.match(home, /const stacks = new Map<string, PowerUpItem>\(\)/);
  assert.match(home, /const existing = stacks\.get\(item\.shopItemId\)/);
  assert.match(home, /existing\.quantity \+= item\.quantity/);
  assert.match(home, /stacks\.set\(item\.shopItemId, \{ \.\.\.item \}\)/);
});
