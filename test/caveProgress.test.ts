import assert from "node:assert/strict";
import test from "node:test";
import {
  CaveTierLockedError,
  completeCaveTier,
  isCaveTierAccessible,
  MAX_CAVE_TIER,
} from "../server/caveProgress";

const progressBefore = (tier: number) => ({
  currentTier: tier,
  completedTiers: Array.from({ length: tier - 1 }, (_, index) => index + 1),
});

test("tier 1 is initially available and later tiers are locked", () => {
  const initial = progressBefore(1);
  assert.equal(isCaveTierAccessible(initial, 1), true);
  for (let tier = 2; tier <= MAX_CAVE_TIER; tier += 1) {
    assert.equal(isCaveTierAccessible(initial, tier), false, `tier ${tier} must be locked`);
  }
});

for (let tier = 1; tier <= MAX_CAVE_TIER; tier += 1) {
  test(`tier ${tier} completion is recorded, stable, and unlocks only the valid successor`, () => {
    const before = progressBefore(tier);
    const completed = completeCaveTier(before, tier);
    assert.deepEqual(completed.completedTiers, [...before.completedTiers, tier]);
    assert.equal(completed.currentTier, Math.min(MAX_CAVE_TIER, tier + 1));
    assert.equal(isCaveTierAccessible(completed, tier), true, "cleared tiers remain safely replayable");

    const duplicate = completeCaveTier(completed, tier);
    assert.deepEqual(duplicate, completed, "duplicate completion must be idempotent");

    if (tier < MAX_CAVE_TIER) {
      assert.equal(isCaveTierAccessible(completed, tier + 1), true);
    } else {
      assert.equal(completed.currentTier, MAX_CAVE_TIER);
      assert.equal(isCaveTierAccessible(completed, 11), false, "Tier 11 must never exist");
    }
  });
}

test("completion cannot skip a locked tier or erase prior completion", () => {
  const before = progressBefore(4);
  assert.throws(() => completeCaveTier(before, 5), CaveTierLockedError);
  assert.deepEqual(before, { currentTier: 4, completedTiers: [1, 2, 3] });

  const after = completeCaveTier(before, 4);
  assert.deepEqual(completeCaveTier(after, 2), after, "replaying a cleared tier cannot regress progress");
});

test("a persisted/refetched snapshot preserves all ten clears", () => {
  let progress = progressBefore(1);
  for (let tier = 1; tier <= MAX_CAVE_TIER; tier += 1) progress = completeCaveTier(progress, tier);
  const refetched = JSON.parse(JSON.stringify(progress));
  assert.deepEqual(refetched.completedTiers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(refetched.currentTier, 10);
});
