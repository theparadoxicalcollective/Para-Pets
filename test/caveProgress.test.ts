import assert from "node:assert/strict";
import test from "node:test";
import { completeCaveTier, MAX_CAVE_TIER } from "../server/caveProgress";

test("tiers 1-5 retain sequential completion and unlock behavior", () => {
  let progress = { currentTier: 1, completedTiers: [] as number[] };
  for (let tier = 1; tier <= 5; tier += 1) {
    progress = completeCaveTier(progress, tier);
    assert.ok(progress.completedTiers.includes(tier));
    assert.equal(progress.currentTier, tier + 1);
  }
  assert.equal(progress.currentTier, 6, "tier 6 unlocks after tier 5");
});

test("tier 6 completion is recorded and unlocks tier 7", () => {
  const progress = completeCaveTier({ currentTier: 6, completedTiers: [1, 2, 3, 4, 5] }, 6);
  assert.deepEqual(progress.completedTiers, [1, 2, 3, 4, 5, 6]);
  assert.equal(progress.currentTier, 7);
});

test("repeated tier 6 completion does not duplicate progress", () => {
  const initial = { currentTier: 7, completedTiers: [1, 2, 3, 4, 5, 6] };
  assert.deepEqual(completeCaveTier(initial, 6), initial);
});

test("tiers 7-10 use the same progression logic and cap at tier 10", () => {
  let progress = { currentTier: 7, completedTiers: [1, 2, 3, 4, 5, 6] };
  for (let tier = 7; tier <= MAX_CAVE_TIER; tier += 1) {
    progress = completeCaveTier(progress, tier);
    assert.ok(progress.completedTiers.includes(tier));
    assert.equal(progress.currentTier, Math.min(MAX_CAVE_TIER, tier + 1));
  }
  assert.deepEqual(progress.completedTiers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});
