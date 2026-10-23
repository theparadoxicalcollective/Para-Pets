import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { claimablePetParkDurationMs, petParkRewardUnits, pausePetParkAccrual, resumePetParkAccrual, checkpointPetParkClaim } from "../shared/petParkAccrual";

const player = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const admin = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("claims use owner lock, deposit lock and one atomic wallet/pet/ledger/checkpoint transaction", () => {
  assert.match(player, /async function settleDeposit/);
  assert.match(player, /return db.transaction/);
  assert.match(player, /\.for\("update"\)/);
  assert.match(player, /eq\(petParkDeposits.userId, userId\)/);
  assert.match(player, /tx.insert\(petParkRewardClaims\)/);
  assert.match(player, /totalCoinsEarned/);
  assert.match(player, /applyPetXp\(/);
  assert.match(player, /checkpointPetParkClaim/);
  assert.match(player, /withdrawnAt: now/);
});
test("admin controls and server publication use authenticated, validated reward rates", () => {
  assert.match(admin, /app.put\("\/api\/admin\/pet-park\/publishing", isAdmin/);
  assert.match(admin, /validRate/);
  assert.match(admin, /\.for\("update"\)/);
  assert.match(admin, /Retrieve all deposited pets before changing earning rates/);
  assert.match(panel, /Save reward rates & park availability/);
  assert.match(panel, /Open Pet Park to players/);
});
test("collection is available without withdrawal and caps at 24 hours", () => {
  assert.match(page, /Collect rewards/);
  assert.match(player, /deposits\/:id\/claim/);
  assert.equal(claimablePetParkDurationMs({ checkpointMs: 0, pausedAtMs: null, pausedDurationMs: 0 }, 48 * 3600000), 24 * 3600000);
  assert.equal(petParkRewardUnits(24 * 3600000, 3), 72);
});
test("closing and reopening preserve elapsed eligible time", () => {
  const initial = { checkpointMs: 0, pausedAtMs: null, pausedDurationMs: 0 };
  const paused = pausePetParkAccrual(initial, 2 * 3600000);
  assert.equal(claimablePetParkDurationMs(paused, 6 * 3600000), 2 * 3600000);
  const resumed = resumePetParkAccrual(paused, 6 * 3600000);
  assert.equal(claimablePetParkDurationMs(resumed, 7 * 3600000), 3 * 3600000);
  const claimed = checkpointPetParkClaim(resumed, 7 * 3600000);
  assert.equal(claimablePetParkDurationMs(claimed, 8 * 3600000), 3600000);
});
