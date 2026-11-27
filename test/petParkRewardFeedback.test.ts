import assert from "node:assert/strict";
import test from "node:test";
import { claimablePetParkDurationMs, claimablePetParkRewards } from "../shared/petParkAccrual";
import { creditablePetXp, xpForLevel } from "../shared/petLevelXp";
import { parkPendingRewardTotals, parkCollectedRewards, type ParkRewardBalance } from "../client/src/lib/petParkRewardProgress";

const checkpoint = Date.parse("2026-11-27T12:00:00Z");
const rates = { coinsPerHour: 60, essencePerHour: 24, petXpPerHour: 300 };
const empty = { coins: 0, essence: 0, petXp: 0 };
const timing: ParkRewardBalance = {
  checkpointAt: new Date(checkpoint).toISOString(), pausedAt: null, pausedDurationMs: 0,
  earnedDurationMs: 0, claimedRewards: empty, petLevel: 30, petLevelPoints: 0,
};
const preview = (elapsed: number, data = timing) => parkPendingRewardTotals(data, rates, checkpoint + elapsed);

test("ready balances exclude previously paid units and preserve partial intervals", () => {
  assert.deepEqual(preview(299_999), { coins: 4, essence: 0, petXp: 24 });
  assert.deepEqual(preview(300_000), { coins: 5, essence: 2, petXp: 25 });
  const settled = { ...timing, earnedDurationMs: 280_000, claimedRewards: { coins: 4, essence: 0, petXp: 23 } };
  assert.deepEqual(preview(20_000, settled), { coins: 1, essence: 2, petXp: 2 });
  assert.deepEqual(preview(0, settled), empty);
  assert.deepEqual(preview(1, { ...timing, earnedDurationMs: 300_000, claimedRewards: { coins: 5, essence: 2, petXp: 25 } }), empty);
});

test("paused time doesn't accrue and only the new earning interval is capped", () => {
  const paused = { ...timing, pausedAt: new Date(checkpoint + 300_000).toISOString() };
  assert.deepEqual(parkPendingRewardTotals(paused, rates, checkpoint + 600_000), { coins: 5, essence: 2, petXp: 25 });
  assert.deepEqual(preview(600_000, { ...timing, pausedDurationMs: 300_000 }), { coins: 5, essence: 2, petXp: 25 });
  const day = 24 * 3600_000;
  const old = { ...timing, earnedDurationMs: day, claimedRewards: { coins: 1440, essence: 576, petXp: 7200 } };
  assert.deepEqual(preview(day * 2, old), { coins: 1440, essence: 576, petXp: 7200 });
  assert.deepEqual(preview(-100), empty);
});

test("preview and server settlement share reward math, including custom rates", () => {
  const custom = { coinsPerHour: 15, essencePerHour: 3, petXpPerHour: 70 };
  const input = { ...timing, earnedDurationMs: 3600_000, claimedRewards: { coins: 15, essence: 3, petXp: 70 } };
  const duration = claimablePetParkDurationMs({ checkpointMs: checkpoint, pausedAtMs: null, pausedDurationMs: 0 }, checkpoint + 3600_000);
  const expected = claimablePetParkRewards(duration, input.earnedDurationMs, input.claimedRewards, custom);
  assert.deepEqual(expected, { coins: 15, essence: 3, petXp: 70 });
  assert.deepEqual(parkPendingRewardTotals(input, custom, checkpoint + 3600_000), expected);
  assert.deepEqual(parkPendingRewardTotals(input, { coinsPerHour: 0, essencePerHour: 0, petXpPerHour: 0 }, checkpoint + 3600_000), empty);
  assert.equal(parkPendingRewardTotals({ ...input, claimedRewards: undefined }, custom, checkpoint + 3600_000), null);
});

test("XP shown as collectible/collected cannot exceed the existing level cap", () => {
  assert.equal(creditablePetXp(100, 0, 50), 0);
  assert.equal(creditablePetXp(99, xpForLevel(99) - 3, 25), 3);
  assert.equal(creditablePetXp(98, xpForLevel(98) - 3, xpForLevel(99) + 10), xpForLevel(99) + 3);
  assert.deepEqual(preview(300_000, { ...timing, petLevel: 99, petLevelPoints: xpForLevel(99) - 3 }), { coins: 5, essence: 2, petXp: 3 });
  assert.deepEqual(preview(300_000, { ...timing, petLevel: 100 }), { coins: 5, essence: 2, petXp: 0 });
});

test("receipt accepts only server-confirmed reward actions, including automatic collections", () => {
  const root = "/api/pet-park/deposits/abc/";
  const response = { coins: 7, essence: 2, petXp: 30, petXpApplied: 3 };
  const result = { coins: 7, essence: 2, petXp: 3 };
  assert.deepEqual(parkCollectedRewards(root + "claim", response), result);
  assert.deepEqual(parkCollectedRewards(root + "withdraw", response), result);
  assert.deepEqual(parkCollectedRewards(root + "swap", { rewards: response }), result);
  assert.deepEqual(parkCollectedRewards(root + "claim", empty), empty);
  assert.equal(parkCollectedRewards(root + "display", response), null);
  assert.equal(parkCollectedRewards(root + "claim", { ...response, coins: -1 }), null);
  assert.equal(parkCollectedRewards(root + "claim", { ...response, essence: "2" }), null);
  assert.equal(parkCollectedRewards(root + "claim", { message: "Error" }), null);
});
