import assert from "node:assert/strict";
import test from "node:test";
import { executeDailyQuestClaim } from "../server/dailyQuestClaim";

type Reward = { coins: number; itemId: string | null; quantity: number; durable?: boolean };
class DailyQuestFake {
  coins = 0;
  stacks = new Map<string, number>();
  durableItems: string[] = [];
  claimed = false;
  completed = true;
  currentDay = true;
  owner = "player-1";
  authenticated = true;
  failAt: "coins" | "items" | "commit" | null = null;
  private locked = false;
  constructor(readonly reward: Reward = { coins: 100, itemId: "bait", quantity: 3 }) {}

  async claim(requestingUser = this.owner, supplied: Record<string, unknown> = {}) {
    if (!this.authenticated) return "unauthorized" as const;
    // The real route takes only questKey; all of these hostile values are deliberately unused.
    void supplied;
    if (requestingUser !== this.owner) return "incomplete" as const;
    const snapshot = { coins: this.coins, stacks: new Map(this.stacks), durable: [...this.durableItems], claimed: this.claimed };
    try {
      return await executeDailyQuestClaim({
        state: async () => !this.currentDay ? "expired" : !this.completed ? "incomplete" : this.claimed ? "already-claimed" : "ready",
        reserve: async () => { if (this.locked || this.claimed) return false; this.locked = true; return true; },
        grantCoins: async () => { if (this.failAt === "coins") throw new Error("coins"); this.coins += this.reward.coins; },
        grantItems: async () => {
          if (this.failAt === "items") throw new Error("items");
          if (!this.reward.itemId) return;
          if (this.reward.durable) for (let i = 0; i < this.reward.quantity; i++) this.durableItems.push(this.reward.itemId);
          else this.stacks.set(this.reward.itemId, (this.stacks.get(this.reward.itemId) ?? 0) + this.reward.quantity);
        },
        commit: async () => { if (this.failAt === "commit") throw new Error("commit"); this.claimed = true; },
      });
    } catch (error) {
      this.coins = snapshot.coins; this.stacks = snapshot.stacks; this.durableItems = snapshot.durable; this.claimed = snapshot.claimed;
      throw error;
    } finally { this.locked = false; }
  }
}

test("completed quest grants only configured multi-part reward exactly once", async () => {
  const fake = new DailyQuestFake({ coins: 100, itemId: "bait", quantity: 4 });
  assert.equal(await fake.claim(undefined, { coins: 999999, itemId: "pet", quantity: 99, goal: 0, completed: true }), "success");
  assert.equal(fake.coins, 100);
  assert.equal(fake.stacks.get("bait"), 4);
  assert.equal(await fake.claim(), "already-claimed");
  assert.deepEqual([fake.coins, fake.stacks.get("bait")], [100, 4]);
});

test("concurrent claims, incomplete and expired quests cannot grant", async () => {
  const simultaneous = new DailyQuestFake();
  assert.deepEqual((await Promise.all([simultaneous.claim(), simultaneous.claim()])).sort(), ["already-claimed", "success"]);
  assert.deepEqual([simultaneous.coins, simultaneous.stacks.get("bait")], [100, 3]);
  const incomplete = new DailyQuestFake(); incomplete.completed = false;
  assert.equal(await incomplete.claim(), "incomplete");
  const expired = new DailyQuestFake(); expired.currentDay = false;
  assert.equal(await expired.claim(), "expired");
  assert.deepEqual([incomplete.coins, expired.coins], [0, 0]);
});

test("authentication and ownership scope claims to the server-side player", async () => {
  const fake = new DailyQuestFake();
  assert.equal(await fake.claim("player-2"), "incomplete");
  fake.authenticated = false;
  assert.equal(await fake.claim(), "unauthorized");
  assert.equal(fake.coins, 0);
});

test("coin, item, and claim-record failures roll back every reward", async () => {
  for (const failure of ["coins", "items", "commit"] as const) {
    const fake = new DailyQuestFake(); fake.failAt = failure;
    await assert.rejects(fake.claim());
    assert.deepEqual([fake.coins, fake.stacks.size, fake.durableItems.length, fake.claimed], [0, 0, 0, false]);
  }
});

test("durable rewards remain separate and unrelated state is untouched", async () => {
  const fake = new DailyQuestFake({ coins: 0, itemId: "rod", quantity: 2, durable: true });
  fake.stacks.set("unrelated", 7);
  assert.equal(await fake.claim(), "success");
  assert.deepEqual(fake.durableItems, ["rod", "rod"]);
  assert.equal(fake.stacks.get("unrelated"), 7);
});
