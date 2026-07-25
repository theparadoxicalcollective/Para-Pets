import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  executePurchaseMilestoneClaim,
  type PurchaseMilestoneClaimOperations,
  type PurchaseMilestoneClaimResult,
} from "../server/milestones/claimPurchaseMilestone";
import { PURCHASE_MILESTONES } from "../server/milestones/config";
import { PurchaseMilestoneError } from "../server/milestones/errors";

class AtomicMilestoneFake implements PurchaseMilestoneClaimOperations {
  points = 10_000;
  cycle = 1;
  coins = 100;
  itemRows = 0;
  claims = new Map<string, string>();
  failAt: "coins" | "inventory" | "claim" | null = null;
  reward = { coins: 250, itemId: "configured-item", itemName: "Configured Item", itemImageUrl: "/configured.png" };
  private tail: Promise<void> = Promise.resolve();

  async run({ milestone }: Parameters<PurchaseMilestoneClaimOperations["run"]>[0]) {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const cycleKey = `c-${this.cycle}`;
      const key = `${cycleKey}:${milestone.id}`;
      const prior = this.claims.get(key);
      if (prior) return this.result("already_claimed", milestone.id, cycleKey, prior);
      if (this.points < milestone.threshold) throw new PurchaseMilestoneError("not_qualified", "Milestone not yet reached");
      const snapshot = { coins: this.coins, itemRows: this.itemRows, cycle: this.cycle };
      try {
        if (this.failAt === "coins") throw new Error("coin failure");
        this.coins += this.reward.coins;
        if (this.failAt === "inventory") throw new Error("inventory failure");
        if (this.reward.itemId) this.itemRows++;
        if (this.failAt === "claim") throw new Error("claim failure");
        const claimedAt = "2026-07-25T00:00:00.000Z";
        this.claims.set(key, claimedAt);
        if (milestone.advancesCycle) { this.cycle++; this.points = 0; }
        return this.result("claimed", milestone.id, cycleKey, claimedAt);
      } catch (error) {
        Object.assign(this, snapshot);
        this.claims.delete(key);
        throw error;
      }
    } finally {
      release();
    }
  }

  private result(status: "claimed" | "already_claimed", milestoneId: string, cycleKey: string, claimedAt: string): Omit<PurchaseMilestoneClaimResult, "milestoneId"> {
    return { status, cycleKey, qualifyingPoints: this.points, claimedAt, reward: this.reward, coinBalance: this.coins };
  }
}

test("qualified player receives the exact server-configured reward and one claim", async () => {
  const fake = new AtomicMilestoneFake();
  const result = await executePurchaseMilestoneClaim("player-1", "500", fake);
  assert.equal(result.status, "claimed");
  assert.deepEqual(result.reward, fake.reward);
  assert.deepEqual([fake.coins, fake.itemRows, fake.claims.size], [350, 1, 1]);
});

test("unknown and unqualified milestones grant nothing", async () => {
  const fake = new AtomicMilestoneFake();
  await assert.rejects(executePurchaseMilestoneClaim("player-1", "browser-threshold", fake),
    (error: unknown) => error instanceof PurchaseMilestoneError && error.code === "unknown_milestone");
  fake.points = 499;
  await assert.rejects(executePurchaseMilestoneClaim("player-1", "500", fake),
    (error: unknown) => error instanceof PurchaseMilestoneError && error.code === "not_qualified");
  assert.deepEqual([fake.coins, fake.itemRows, fake.claims.size, fake.points], [100, 0, 0, 499]);
});

test("retries, lost responses, duplicate callbacks, and concurrent devices grant once", async () => {
  const fake = new AtomicMilestoneFake();
  const concurrent = await Promise.all([
    executePurchaseMilestoneClaim("player-1", "500", fake),
    executePurchaseMilestoneClaim("player-1", "500", fake),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), ["already_claimed", "claimed"]);
  assert.equal((await executePurchaseMilestoneClaim("player-1", "500", fake)).status, "already_claimed");
  assert.deepEqual([fake.coins, fake.itemRows, fake.claims.size], [350, 1, 1]);
});

test("coin, inventory, and claim-record failures roll back every core write", async () => {
  for (const failAt of ["coins", "inventory", "claim"] as const) {
    const fake = new AtomicMilestoneFake();
    fake.failAt = failAt;
    await assert.rejects(executePurchaseMilestoneClaim("player-1", "500", fake));
    assert.deepEqual([fake.coins, fake.itemRows, fake.claims.size, fake.points], [100, 0, 0, 10_000]);
  }
});

test("different milestone IDs and contribution progress remain independent", async () => {
  const fake = new AtomicMilestoneFake();
  await executePurchaseMilestoneClaim("player-1", "500", fake);
  await executePurchaseMilestoneClaim("player-1", "2500", fake);
  assert.equal(fake.claims.size, 2);
  assert.equal(fake.points, 10_000);
});

test("milestone definitions, public request authority, and route delegation stay fixed", () => {
  assert.deepEqual(PURCHASE_MILESTONES.map(({ id, threshold, repeatable, advancesCycle }) =>
    ({ id, threshold, repeatable, advancesCycle })), [
    { id: "500", threshold: 500, repeatable: true, advancesCycle: false },
    { id: "2500", threshold: 2500, repeatable: true, advancesCycle: false },
    { id: "5000", threshold: 5000, repeatable: true, advancesCycle: false },
    { id: "10000", threshold: 10000, repeatable: true, advancesCycle: true },
  ]);
  const routes = readFileSync("server/routes.ts", "utf8");
  const client = readFileSync("client/src/pages/CoinShopPage.tsx", "utf8");
  assert.match(routes, /claimPurchaseMilestone\(user\.id, body\.milestoneId\)/);
  assert.doesNotMatch(routes, /storage\.claimMilestone|storage\.addCoins\(user\.id, coinsGranted\)/);
  assert.match(client, /\{ milestoneId: String\(milestone\) \}/);
  assert.doesNotMatch(client, /claim-milestone", \{ milestone \}/);
});
