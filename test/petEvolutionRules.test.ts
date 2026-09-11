import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EVOLUTION_NODE_COIN_REWARD,
  EVOLUTION_SLOT_COUNT,
  applyEvolutionPoints,
  evolutionFeedPointsForRarity,
  evolutionStatRewardForRarity,
  evolutionTargetForRarity,
} from "../shared/evolution";

test("all evolution nodes require 5000 points regardless of pet rarity", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((rarity) => evolutionTargetForRarity(rarity)),
    [5000, 5000, 5000, 5000, 5000],
  );
});

test("legacy completed nodes stay completed after the node target increase", () => {
  const result = applyEvolutionPoints(3, 0, 0, 1);
  assert.equal(result.completedSlots, 3);
  assert.equal(result.currentPoints, 0);
  assert.equal(result.completedNow, 0);
  assert.equal(result.pointsRequired, 5000);
  assert.equal(result.isComplete, false);
});

test("feeder pets award the requested evolution points by rarity", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((rarity) => evolutionFeedPointsForRarity(rarity)),
    [100, 200, 400, 1000, 1500],
  );
});

test("completed evolution nodes award coins and rarity-scaled all-stat boosts", () => {
  assert.equal(EVOLUTION_NODE_COIN_REWARD, 100);
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((rarity) => evolutionStatRewardForRarity(rarity)),
    [100, 150, 200, 350, 500],
  );
});

test("filling the first evolution icon completes it and unlocks the next", () => {
  const result = applyEvolutionPoints(0, 4900, 100, 1);
  assert.equal(result.completedSlots, 1);
  assert.equal(result.currentPoints, 0);
  assert.equal(result.completedNow, 1);
  assert.equal(result.isComplete, false);
});

test("evolution point overflow carries into the newly unlocked icon", () => {
  const result = applyEvolutionPoints(0, 4950, 100, 1);
  assert.equal(result.completedSlots, 1);
  assert.equal(result.currentPoints, 50);
  assert.equal(result.percent, 1);
});

test("a high-value feeder can fill multiple sequential icons without wasting points", () => {
  const result = applyEvolutionPoints(0, 0, 12500, 1);
  assert.equal(result.completedSlots, 2);
  assert.equal(result.currentPoints, 2500);
  assert.equal(result.completedNow, 2);
});

test("evolution progress caps at six completed icons", () => {
  const result = applyEvolutionPoints(EVOLUTION_SLOT_COUNT - 1, 4900, 5000, 1);
  assert.equal(result.completedSlots, EVOLUTION_SLOT_COUNT);
  assert.equal(result.currentPoints, 0);
  assert.equal(result.percent, 100);
  assert.equal(result.isComplete, true);
});

const evolutionServerSource = readFileSync("server/petEvolution.ts", "utf8");
const evolutionRoutesSource = readFileSync("server/routes/petEvolution.routes.ts", "utf8");
const evolutionClientSource = readFileSync("client/src/components/powerup/PowerUpEvolutionPanel.tsx", "utf8");

test("node rewards are one-time atomic claims and the sixth node remains a future evolution action", () => {
  assert.match(evolutionServerSource, /claimed_slots_mask/);
  assert.match(evolutionServerSource, /SET coins = coins \+ \$\{EVOLUTION_NODE_COIN_REWARD\}/);
  assert.match(evolutionServerSource, /pet_atk = pet_atk \+ \$\{statBoost\}/);
  assert.match(evolutionServerSource, /pet_def = pet_def \+ \$\{statBoost\}/);
  assert.match(evolutionServerSource, /pet_health = pet_health \+ \$\{statBoost\}/);
  assert.match(evolutionRoutesSource, /\/api\/pet-evolution\/active\/claim/);
  assert.match(evolutionClientSource, /pupevo-slot\.claimable/);
  assert.match(evolutionClientSource, /pupevo-slot\.evolution-ready/);
  assert.match(evolutionClientSource, /Evolution Coming Soon/);
});
