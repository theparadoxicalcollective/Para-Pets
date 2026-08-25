import assert from "node:assert/strict";
import test from "node:test";
import {
  EVOLUTION_SLOT_COUNT,
  applyEvolutionPoints,
  evolutionFeedPointsForRarity,
  evolutionTargetForRarity,
} from "../shared/evolution";

test("evolution targets match pet rarity rules", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((rarity) => evolutionTargetForRarity(rarity)),
    [500, 600, 750, 900, 1000],
  );
});

test("feeder pets award the requested evolution points by rarity", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((rarity) => evolutionFeedPointsForRarity(rarity)),
    [10, 15, 50, 100, 1000],
  );
});

test("filling the first evolution icon completes it and unlocks the next", () => {
  const result = applyEvolutionPoints(0, 490, 10, 1);
  assert.equal(result.completedSlots, 1);
  assert.equal(result.currentPoints, 0);
  assert.equal(result.completedNow, 1);
  assert.equal(result.isComplete, false);
});

test("evolution point overflow carries into the newly unlocked icon", () => {
  const result = applyEvolutionPoints(0, 450, 100, 1);
  assert.equal(result.completedSlots, 1);
  assert.equal(result.currentPoints, 50);
  assert.equal(result.percent, 10);
});

test("a high-value feeder can fill multiple sequential icons without wasting points", () => {
  const result = applyEvolutionPoints(0, 0, 1000, 1);
  assert.equal(result.completedSlots, 2);
  assert.equal(result.currentPoints, 0);
  assert.equal(result.completedNow, 2);
});

test("evolution progress caps at six completed icons", () => {
  const result = applyEvolutionPoints(EVOLUTION_SLOT_COUNT - 1, 450, 5000, 1);
  assert.equal(result.completedSlots, EVOLUTION_SLOT_COUNT);
  assert.equal(result.currentPoints, 0);
  assert.equal(result.percent, 100);
  assert.equal(result.isComplete, true);
});
