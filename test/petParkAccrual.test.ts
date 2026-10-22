import test from "node:test";
import assert from "node:assert/strict";
import {
  PET_PARK_ACCRUAL_CAP_MS, PET_PARK_SECOND_SLOT_PRICE, PET_PARK_THIRD_SLOT_PRICE,
  claimablePetParkDurationMs, checkpointPetParkClaim,
  pausePetParkAccrual, resumePetParkAccrual, petParkRewardUnits,
} from "../shared/petParkAccrual";

const hour = 3_600_000;
const initial = { checkpointMs: 0, pausedAtMs: null, pausedDurationMs: 0 };

test("slot pricing and capped 24-hour uncollected earning window", () => {
  assert.equal(PET_PARK_SECOND_SLOT_PRICE, 2500);
  assert.equal(PET_PARK_THIRD_SLOT_PRICE, 5000);
  assert.equal(claimablePetParkDurationMs(initial, 30 * hour), PET_PARK_ACCRUAL_CAP_MS);
  assert.equal(claimablePetParkDurationMs(initial, 2 * hour), 2 * hour);
});

test("early collection earns again immediately without withdrawing pet", () => {
  const threeHours = claimablePetParkDurationMs(initial, 3 * hour);
  assert.equal(threeHours, 3 * hour);
  const afterClaim = checkpointPetParkClaim(initial, 3 * hour);
  assert.equal(claimablePetParkDurationMs(afterClaim, 8 * hour), 5 * hour);
  assert.equal(claimablePetParkDurationMs(checkpointPetParkClaim(afterClaim, 8 * hour), 9 * hour), hour);
});

test("closure pauses earning and reopening resumes from preserved earned time", () => {
  const paused = pausePetParkAccrual(initial, 4 * hour);
  assert.equal(claimablePetParkDurationMs(paused, 15 * hour), 4 * hour);
  const open = resumePetParkAccrual(paused, 15 * hour);
  assert.equal(claimablePetParkDurationMs(open, 18 * hour), 7 * hour);
  assert.equal(claimablePetParkDurationMs(open, 45 * hour), 24 * hour);
});

test("claim while closed preserves pause and does not earn during maintenance", () => {
  const closed = pausePetParkAccrual(initial, 4 * hour);
  const claimed = checkpointPetParkClaim(closed, 9 * hour);
  assert.equal(claimablePetParkDurationMs(claimed, 12 * hour), 0);
  assert.equal(claimablePetParkDurationMs(resumePetParkAccrual(claimed, 12 * hour), 14 * hour), 2 * hour);
});

test("repeated pause/resume and backwards times cannot mint extra earning duration", () => {
  const closed = pausePetParkAccrual(initial, 2 * hour);
  assert.deepEqual(pausePetParkAccrual(closed, 3 * hour), closed);
  const opened = resumePetParkAccrual(closed, 5 * hour);
  assert.deepEqual(resumePetParkAccrual(opened, 6 * hour), opened);
  assert.equal(claimablePetParkDurationMs(initial, -hour), 0);
  assert.equal(claimablePetParkDurationMs(initial, Number.NaN), 0);
});

test("reward rounding is deterministic and never exceeds capped time", () => {
  assert.equal(petParkRewardUnits(90 * 60 * 1000, 10), 15);
  assert.equal(petParkRewardUnits(30 * hour, 10), 240);
  assert.equal(petParkRewardUnits(hour, -1), 0);
});
