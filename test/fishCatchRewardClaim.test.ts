import assert from "node:assert/strict";
import test from "node:test";
import { executeFishCatchRewardClaim } from "../server/fishCatchRewardClaim";

type CatchRow = { userId: string; shopItemId: string; claimed: boolean };

class FishCatchRewardFake {
  coins = 0;
  totalCoinsEarned = 0;
  rows: CatchRow[] = [{ userId: "player-1", shopItemId: "fish-1", claimed: false }];
  unrelatedCoins = 7;
  failAt: "grant" | "claim" | null = null;
  authenticated = true;
  private locked = false;

  async request(requestingUser = "player-1", body: Record<string, unknown> = { shopItemId: "fish-1" }) {
    if (!this.authenticated) return { status: 401, body: { message: "Unauthorized" } };
    const shopItemId = typeof body.shopItemId === "string" ? body.shopItemId : undefined;
    if (!shopItemId) return { status: 400, body: { message: "shopItemId required" } };
    // This models the route's session identity and its one transaction/pair lock.
    while (this.locked) await new Promise(resolve => setTimeout(resolve, 0));
    this.locked = true;
    const snapshot = { coins: this.coins, totalCoinsEarned: this.totalCoinsEarned, rows: this.rows.map(row => ({ ...row })) };
    try {
      const matching = () => this.rows.filter(row => row.userId === requestingUser && row.shopItemId === shopItemId);
      const result = await executeFishCatchRewardClaim({
        state: async () => {
          const rows = matching();
          if (rows.length === 0) return "not-caught";
          return rows.some(row => row.claimed) ? "already-claimed" : "ready";
        },
        grantCoins: async () => {
          if (this.failAt === "grant") throw new Error("coin update failed");
          this.coins += 10;
          this.totalCoinsEarned += 10;
        },
        claimCatchLogRows: async () => {
          if (this.failAt === "claim") throw new Error("claim update failed");
          for (const row of matching()) row.claimed = true;
        },
      });
      return result === "success"
        ? { status: 200, body: { ok: true, coins: this.coins } }
        : { status: 400, body: { message: "Reward already claimed or fish not caught" } };
    } catch (error) {
      this.coins = snapshot.coins;
      this.totalCoinsEarned = snapshot.totalCoinsEarned;
      this.rows = snapshot.rows;
      throw error;
    } finally {
      this.locked = false;
    }
  }
}

test("an owned unclaimed catch grants the fixed ten coins exactly once with the compatible response", async () => {
  const fake = new FishCatchRewardFake();
  assert.deepEqual(await fake.request(), { status: 200, body: { ok: true, coins: 10 } });
  assert.deepEqual(await fake.request(), { status: 400, body: { message: "Reward already claimed or fish not caught" } });
  assert.deepEqual([fake.coins, fake.totalCoinsEarned], [10, 10]);
});

test("overlapping attempts serialize to one reward", async () => {
  const fake = new FishCatchRewardFake();
  const results = await Promise.all([fake.request(), fake.request()]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  assert.deepEqual([fake.coins, fake.totalCoinsEarned], [10, 10]);
});

test("session ownership, prior claims, hostile body fields, and missing authentication cannot change eligibility", async () => {
  const fake = new FishCatchRewardFake();
  assert.equal((await fake.request("player-2")).status, 400);
  assert.equal(fake.coins, 0);
  const hostile = { shopItemId: "fish-1", userId: "player-2", coins: 999, reward: 999, rewardClaimed: false, rarity: 5, firstCaughtAt: "never" };
  assert.deepEqual(await fake.request("player-1", hostile), { status: 200, body: { ok: true, coins: 10 } });
  fake.authenticated = false;
  assert.equal((await fake.request()).status, 401);
});

test("coin or claim-record failures roll back both coin fields and leave the catch claimable", async () => {
  for (const failure of ["grant", "claim"] as const) {
    const fake = new FishCatchRewardFake();
    fake.failAt = failure;
    await assert.rejects(fake.request());
    assert.deepEqual([fake.coins, fake.totalCoinsEarned, fake.rows[0].claimed, fake.unrelatedCoins], [0, 0, false, 7]);
  }
});

test("historic duplicate catch rows are all claimed for one reward without affecting other users or fish", async () => {
  const fake = new FishCatchRewardFake();
  fake.rows.push(
    { userId: "player-1", shopItemId: "fish-1", claimed: false },
    { userId: "player-1", shopItemId: "fish-2", claimed: false },
    { userId: "player-2", shopItemId: "fish-1", claimed: false },
  );
  assert.equal((await fake.request()).status, 200);
  assert.equal(fake.coins, 10);
  assert.ok(fake.rows.filter(row => row.userId === "player-1" && row.shopItemId === "fish-1").every(row => row.claimed));
  assert.equal((await fake.request()).status, 400);
  assert.deepEqual(fake.rows.slice(2), [
    { userId: "player-1", shopItemId: "fish-2", claimed: false },
    { userId: "player-2", shopItemId: "fish-1", claimed: false },
  ]);
});
