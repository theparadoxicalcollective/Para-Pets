import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("server/petEvolution.ts", "utf8");
const routes = readFileSync("server/routes/petEvolution.routes.ts", "utf8");
const panel = readFileSync("client/src/components/powerup/PowerUpEvolutionPanel.tsx", "utf8");
const animator = readFileSync("client/src/components/PetAnimator.tsx", "utf8");
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
  assert.doesNotMatch(panel, /Evolution Coming Soon/);
});

test("inventory-backed animated pets automatically use evolution parts", () => {
  assert.match(costumes, /isEvolved:/);
  assert.match(animator, /costumeData\?\.isEvolved \? "evolution" : "base"/);
  assert.match(animator, /petTemplateQuery\(petTemplateId, resolvedArtworkForm\)/);
  assert.match(animator, /artworkForm=\{resolvedArtworkForm\}/);
});

test("evolution nodes require 5,000 points while completed nodes remain stored", () => {
  for (const rarity of [1, 2, 3, 4, 5]) assert.match(rules, new RegExp(`${rarity}: 5000`));
  assert.match(server, /completed_slots/);
});
