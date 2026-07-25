import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BEGIN_JOURNEY_TUTORIAL } from "../server/tutorial/config";
import { TutorialError } from "../server/tutorial/errors";
import {
  executeTutorialCompletion,
  executeTutorialHatchPotionGrant,
  executeTutorialRewardClaim,
  type TutorialOperations,
} from "../server/tutorial/tutorialService";

class AtomicTutorialFake implements TutorialOperations {
  claimedPotions: boolean | null = false;
  completed: boolean | null = false;
  rewardClaimed: boolean | null = false;
  potionQuantity = 0;
  coins = 100;
  failAt: "inventory" | "potion-flag" | "completion" | "coins" | "reward-flag" | null = null;
  private tail: Promise<void> = Promise.resolve();

  private async atomic<T>(work: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = {
      claimedPotions: this.claimedPotions,
      completed: this.completed,
      rewardClaimed: this.rewardClaimed,
      potionQuantity: this.potionQuantity,
      coins: this.coins,
    };
    try {
      return await work();
    } catch (error) {
      Object.assign(this, snapshot);
      throw error;
    } finally {
      release();
    }
  }

  grantHatchPotions() {
    return this.atomic(() => {
      if (this.claimedPotions === true) return "already_granted" as const;
      if (this.failAt === "inventory") throw new Error("inventory failure");
      this.potionQuantity += BEGIN_JOURNEY_TUTORIAL.hatchPotion.quantity;
      if (this.failAt === "potion-flag") throw new Error("flag failure");
      this.claimedPotions = true;
      return "granted" as const;
    });
  }

  complete() {
    return this.atomic(() => {
      if (this.completed === true) return "already_completed" as const;
      if (this.failAt === "completion") throw new Error("completion failure");
      this.completed = true;
      return "completed" as const;
    });
  }

  claimQuestReward() {
    return this.atomic(() => {
      if (this.completed !== true) throw new TutorialError("tutorial_not_completed", "Tutorial is not complete");
      if (this.rewardClaimed === true) {
        return { status: "already_claimed" as const, coins: 0, coinBalance: this.coins };
      }
      if (this.failAt === "coins") throw new Error("coin failure");
      this.coins += BEGIN_JOURNEY_TUTORIAL.questLogRewardCoins;
      if (this.failAt === "reward-flag") throw new Error("flag failure");
      this.rewardClaimed = true;
      return {
        status: "claimed" as const,
        coins: BEGIN_JOURNEY_TUTORIAL.questLogRewardCoins,
        coinBalance: this.coins,
      };
    });
  }
}

test("first potion claim grants the unchanged server item and exact quantity", async () => {
  const fake = new AtomicTutorialFake();
  const result = await executeTutorialHatchPotionGrant("player-1", fake);
  assert.deepEqual(result, {
    status: "granted",
    tutorialId: "begin-journey",
    itemId: "3e6d7b47-b4c5-4a34-bd69-c039a31e1770",
    quantity: 3,
  });
  assert.deepEqual([fake.potionQuantity, fake.claimedPotions], [3, true]);
});

test("potion retries, lost responses, and concurrent devices grant one bundle", async () => {
  const fake = new AtomicTutorialFake();
  const concurrent = await Promise.all([
    executeTutorialHatchPotionGrant("player-1", fake),
    executeTutorialHatchPotionGrant("player-1", fake),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), ["already_granted", "granted"]);
  assert.equal((await executeTutorialHatchPotionGrant("player-1", fake)).status, "already_granted");
  assert.deepEqual([fake.potionQuantity, fake.claimedPotions], [3, true]);
});

test("inventory and claimed-state failures roll back both potion writes", async () => {
  for (const failAt of ["inventory", "potion-flag"] as const) {
    const fake = new AtomicTutorialFake();
    fake.failAt = failAt;
    await assert.rejects(executeTutorialHatchPotionGrant("player-1", fake));
    assert.deepEqual([fake.potionQuantity, fake.claimedPotions], [0, false]);
  }
});

test("legacy potion ownership never substitutes for the durable claim flag", async () => {
  const unclaimed = new AtomicTutorialFake();
  unclaimed.potionQuantity = 7;
  await executeTutorialHatchPotionGrant("player-1", unclaimed);
  assert.equal(unclaimed.potionQuantity, 10);

  const consumed = new AtomicTutorialFake();
  consumed.claimedPotions = true;
  consumed.potionQuantity = 0;
  assert.equal((await executeTutorialHatchPotionGrant("player-1", consumed)).status, "already_granted");
  assert.equal(consumed.potionQuantity, 0);

  const legacyNull = new AtomicTutorialFake();
  legacyNull.claimedPotions = null;
  await executeTutorialHatchPotionGrant("player-1", legacyNull);
  assert.deepEqual([legacyNull.potionQuantity, legacyNull.claimedPotions], [3, true]);
});

test("completion is durable, replay-safe, concurrent, and grants no direct value", async () => {
  const fake = new AtomicTutorialFake();
  const concurrent = await Promise.all([
    executeTutorialCompletion("player-1", fake),
    executeTutorialCompletion("player-1", fake),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), ["already_completed", "completed"]);
  assert.deepEqual([fake.completed, fake.coins, fake.rewardClaimed], [true, 100, false]);
  assert.equal((await executeTutorialCompletion("player-1", fake)).status, "already_completed");
});

test("completion failure leaves authoritative completion false", async () => {
  const fake = new AtomicTutorialFake();
  fake.failAt = "completion";
  await assert.rejects(executeTutorialCompletion("player-1", fake));
  assert.equal(fake.completed, false);
});

test("quest-log reward remains gated, atomic, and one-time", async () => {
  const fake = new AtomicTutorialFake();
  await assert.rejects(executeTutorialRewardClaim("player-1", fake),
    (error: unknown) => error instanceof TutorialError && error.code === "tutorial_not_completed");
  await executeTutorialCompletion("player-1", fake);
  assert.equal((await executeTutorialRewardClaim("player-1", fake)).coins, 1_500);
  assert.equal((await executeTutorialRewardClaim("player-1", fake)).status, "already_claimed");
  assert.deepEqual([fake.coins, fake.rewardClaimed], [1_600, true]);

  for (const failAt of ["coins", "reward-flag"] as const) {
    const failing = new AtomicTutorialFake();
    failing.completed = true;
    failing.failAt = failAt;
    await assert.rejects(executeTutorialRewardClaim("player-1", failing));
    assert.deepEqual([failing.coins, failing.rewardClaimed], [100, false]);
  }
});

test("public routes use authentication, session ownership, empty bodies, and focused services", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  for (const path of ["grant-hatch-potions", "complete", "claim-reward"]) {
    assert.equal((routes.match(new RegExp(`app\\.post\\(\"/api/tutorial/${path}\"`, "g")) ?? []).length, 1);
    assert.match(routes, new RegExp(`app\\.post\\(\"/api/tutorial/${path}\", isAuthenticated`));
  }
  assert.match(routes, /const userId = req\.user!\.id/);
  assert.match(routes, /Object\.keys\(req\.body \?\? \{\}\)\.length > 0/);
  assert.match(routes, /grantTutorialHatchPotions\(userId\)/);
  assert.match(routes, /completeTutorial\(userId\)/);
  assert.match(routes, /claimTutorialReward\(userId\)/);
  assert.doesNotMatch(routes, /SMALL_HATCH_POTION_ID|storage\.addCoins\(userId, 1500\)/);
});

test("the seven tutorial steps, wording, visuals, and failure recovery remain unchanged", () => {
  const overlay = readFileSync("client/src/components/BeginJourneyOverlay.tsx", "utf8");
  const app = readFileSync("client/src/App.tsx", "utf8");
  assert.match(overlay, /const TOTAL_STEPS = 7/);
  for (const label of [
    "Open the navigation menu!",
    "Go to your Pet collection!",
    "Select your egg as your companion!",
    "Head back home!",
    "Tap your egg!",
    "Drag a hatch potion onto your egg to reduce hatch time!",
    "Tap to finish your journey!",
  ]) assert.ok(overlay.includes(label));
  assert.match(overlay, /tutorialArrow/);
  assert.doesNotMatch(overlay, /onError: \(\) => \{\s*bjSetStep\("done"\)/);
  assert.match(overlay, /potionGrantAttemptedRef\.current = true/);
  assert.match(app, /if \(bjGetStatus\(\) === "done"\) \{\s*bjSetStep\(6\)/);
});
