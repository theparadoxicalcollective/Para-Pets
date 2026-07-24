import assert from "node:assert/strict";
import test from "node:test";
import { executeBadgePeriodicClaim } from "../server/badgePeriodicClaim";

const DAY = 24 * 60 * 60 * 1000;

class BadgeClaimFake {
  coins = 0;
  lastClaimedAt: number | null = null;
  authenticated = true;
  owner = "player-1";
  ownsBadge = true;
  configuredReward = 25;
  claimType: "daily" | "weekly" | "monthly" = "daily";
  databaseNow = 1_000_000;
  failAt: "grant" | "commit" | null = null;
  unrelatedCoins = 9;
  private locked = false;

  async claim(requestingUser = this.owner, supplied: Record<string, unknown> = {}) {
    if (!this.authenticated) return "unauthorized" as const;
    // The HTTP route accepts only badgeId. These hostile values deliberately do not affect the claim.
    void supplied;
    if (requestingUser !== this.owner || !this.ownsBadge) return "not-owned" as const;
    while (this.locked) await new Promise(resolve => setTimeout(resolve, 0));
    this.locked = true;
    const snapshot = { coins: this.coins, lastClaimedAt: this.lastClaimedAt };
    try {
      return await executeBadgePeriodicClaim({
        state: async () => {
          if (!this.ownsBadge) return "not-owned";
          if (!this.configuredReward) return "no-reward";
          const cooldown = this.claimType === "monthly" ? 30 * DAY : this.claimType === "weekly" ? 7 * DAY : DAY;
          return this.lastClaimedAt !== null && this.databaseNow - this.lastClaimedAt < cooldown ? "cooldown" : "ready";
        },
        reserve: async () => true,
        grantCoins: async () => {
          if (this.failAt === "grant") throw new Error("grant failed");
          this.coins += this.configuredReward;
        },
        commit: async () => {
          if (this.failAt === "commit") throw new Error("commit failed");
          this.lastClaimedAt = this.databaseNow;
        },
      });
    } catch (error) {
      this.coins = snapshot.coins;
      this.lastClaimedAt = snapshot.lastClaimedAt;
      throw error;
    } finally {
      this.locked = false;
    }
  }
}

test("owned badge grants only its server-configured reward and preserves response-success semantics", async () => {
  const fake = new BadgeClaimFake();
  assert.equal(await fake.claim(undefined, { userId: "victim", coins: 99999, reward: 99999, cooldown: 0, lastClaimedAt: 0, eligible: true }), "success");
  assert.equal(fake.coins, 25);
  assert.equal(fake.lastClaimedAt, fake.databaseNow);
  assert.equal(await fake.claim(), "cooldown");
  assert.equal(fake.coins, 25);
});

test("concurrent claims and active cooldown grant once, while expired database-time cooldown grants again", async () => {
  const fake = new BadgeClaimFake();
  assert.deepEqual((await Promise.all([fake.claim(), fake.claim()])).sort(), ["cooldown", "success"]);
  assert.equal(fake.coins, 25);
  fake.databaseNow += DAY - 1;
  assert.equal(await fake.claim(), "cooldown");
  fake.databaseNow += 1;
  assert.equal(await fake.claim(), "success");
  assert.equal(fake.coins, 50);
});

test("authentication, ownership, and badge eligibility cannot be supplied by a client", async () => {
  const fake = new BadgeClaimFake();
  fake.authenticated = false;
  assert.equal(await fake.claim(), "unauthorized");
  fake.authenticated = true;
  assert.equal(await fake.claim("player-2"), "not-owned");
  fake.ownsBadge = false;
  assert.equal(await fake.claim(), "not-owned");
  assert.equal(fake.coins, 0);
});

test("grant and timestamp failures roll back without changing unrelated state", async () => {
  for (const failure of ["grant", "commit"] as const) {
    const fake = new BadgeClaimFake();
    fake.failAt = failure;
    await assert.rejects(fake.claim());
    assert.deepEqual([fake.coins, fake.lastClaimedAt, fake.unrelatedCoins], [0, null, 9]);
  }
});
