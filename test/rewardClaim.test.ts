import assert from "node:assert/strict";
import test from "node:test";
import { executeRewardClaim } from "../server/rewardClaim";

class RewardFake {
  coins = 0;
  items = 0;
  claimed = false;
  eligible = true;
  failAt: "coins" | "items" | "commit" | null = null;
  private locked = false;

  async transaction() {
    const snapshot = { coins: this.coins, items: this.items, claimed: this.claimed };
    try {
      return await executeRewardClaim({
        eligible: async () => this.eligible,
        reserve: async () => {
          if (this.locked || this.claimed) return false;
          this.locked = true;
          return true;
        },
        grantCoins: async () => { if (this.failAt === "coins") throw new Error("coins"); this.coins += 500; },
        grantItems: async () => { if (this.failAt === "items") throw new Error("items"); this.items += 3; },
        commit: async () => { if (this.failAt === "commit") throw new Error("claim"); this.claimed = true; },
      });
    } catch (error) {
      this.coins = snapshot.coins; this.items = snapshot.items; this.claimed = snapshot.claimed;
      throw error;
    } finally { this.locked = false; }
  }
}

test("configured multi-part reward succeeds exactly once and stack quantity is exact", async () => {
  const fake = new RewardFake();
  assert.equal(await fake.transaction(), "success");
  assert.deepEqual([fake.coins, fake.items, fake.claimed], [500, 3, true]);
  assert.equal(await fake.transaction(), "already-claimed");
  assert.deepEqual([fake.coins, fake.items], [500, 3]);
});

test("simultaneous attempts reserve only one claim", async () => {
  const fake = new RewardFake();
  const results = await Promise.all([fake.transaction(), fake.transaction()]);
  assert.deepEqual(results.sort(), ["already-claimed", "success"]);
  assert.deepEqual([fake.coins, fake.items], [500, 3]);
});

test("ineligible claims and failed grants leave no player value or claim state", async () => {
  const fake = new RewardFake(); fake.eligible = false;
  assert.equal(await fake.transaction(), "ineligible");
  assert.deepEqual([fake.coins, fake.items, fake.claimed], [0, 0, false]);
  for (const failAt of ["coins", "items", "commit"] as const) {
    const failing = new RewardFake(); failing.failAt = failAt;
    await assert.rejects(failing.transaction());
    assert.deepEqual([failing.coins, failing.items, failing.claimed], [0, 0, false]);
  }
});
