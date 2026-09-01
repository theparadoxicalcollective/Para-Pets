import assert from "node:assert/strict";
import test from "node:test";
import { clearingHealthAfterGearChange, clearingIncomingDamage } from "../shared/clearingCombat";
import { createClearingSession, applyClearingHit } from "../server/elysianClearingCombat";
import { emptyClearingHunt, recordHuntChest, recordHuntDefeat, recordHuntEgg } from "../client/src/lib/clearingHuntSummary";
import type { ClearingRewardChest } from "../shared/clearingEquipment";

const base = { level: 1, hp: 1000, atk: 50, def: 50, rarity: 1 };

test("gear increases player power without increasing the enemy on entry", () => {
  const plain = createClearingSession("plain", "pet", base, 1000, () => .5, [], [], base);
  const geared = createClearingSession("geared", "pet", { ...base, hp: 1300, atk: 100, def: 150 }, 1000, () => .5, [], [], base);
  assert.equal(geared.enemies[0].maxHealth, plain.enemies[0].maxHealth);
  assert.equal(geared.enemies[0].attack, plain.enemies[0].attack);
  assert.equal(geared.enemies[0].maxHealth, 600);
  assert.equal(geared.effectiveStats.hp, 1300);
  for (const session of [plain, geared]) {
    const enemy = session.enemies[0];
    session.position = { x: enemy.x, y: enemy.y, updatedAt: 1000 };
    const hit = applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: session.userId, petId: "pet", now: 1100 });
    assert.equal(hit.damage, session.effectiveStats.atk);
  }
  assert.ok(clearingIncomingDamage(120, geared.effectiveStats.def) < clearingIncomingDamage(120, plain.effectiveStats.def));
});

test("DEF mitigation is monotonic, capped, and never grants immunity", () => {
  for (const raw of [1, 10, 120, 168, 10000]) {
    let previous = raw;
    for (const defense of [0, 50, 100, 400, 600, 1000, 100000]) {
      const damage = clearingIncomingDamage(raw, defense);
      assert.ok(damage <= previous);
      assert.ok(damage >= Math.max(1, Math.round(raw * .4)));
      previous = damage;
    }
  }
  assert.equal(clearingIncomingDamage(120, -1), 120);
  assert.equal(clearingIncomingDamage(120, NaN), 120);
  assert.equal(clearingIncomingDamage(NaN, 0), 1);
});

test("HP gear changes preserve health fraction without swap healing or revival", () => {
  assert.equal(clearingHealthAfterGearChange(500, 1000, 1400), 700);
  assert.equal(clearingHealthAfterGearChange(700, 1400, 1000), 500);
  assert.equal(clearingHealthAfterGearChange(0, 1000, 1400), 0);
  let health = 333;
  for (let i = 0; i < 100; i++) {
    health = clearingHealthAfterGearChange(health, 1000, 1234);
    health = clearingHealthAfterGearChange(health, 1234, 1000);
  }
  assert.ok(Math.abs(health - 333) < .000001);
});

test("hunt results count confirmed defeats and collections exactly once", () => {
  const defeat = { enemyId: "boss", exp: 20, chestId: "chest", bossName: "Bayou Wraith" };
  let hunt = recordHuntDefeat(emptyClearingHunt(), defeat);
  assert.equal(recordHuntDefeat(hunt, defeat), hunt);
  assert.equal(hunt.coins, 0, "a spawned chest is not collected loot");
  const chest = { chestId: "chest", rewards: { coins: 4, essence: 15, items: [{ type: "clearing", quantity: 1 }, { type: "potion", quantity: 1 }] } } as ClearingRewardChest;
  hunt = recordHuntChest(hunt, chest);
  assert.equal(recordHuntChest(hunt, chest), hunt);
  assert.deepEqual([hunt.exp, hunt.coins, hunt.essence, hunt.gear], [20, 4, 15, 1]);
  const next = emptyClearingHunt();
  assert.equal(recordHuntChest(next, chest), next, "late claims from a previous hunt do not inflate this hunt");
  hunt = recordHuntDefeat(hunt, { enemyId: "special", exp: 5, eggId: "egg" });
  hunt = recordHuntEgg(hunt, "egg");
  assert.equal(recordHuntEgg(hunt, "egg"), hunt);
  assert.equal(hunt.collectedEggIds.length, 1);
});

test("equipment scaling does not change the random special-pet roll", () => {
  const specials = [{ pet_shop_item_id: "rare-pet", name: "Special", rarity: 3, egg_image_url: null, hatched_image_url: null, image_url: null }];
  for (const [roll, expected] of [[.049, true], [.05, false], [.99, false]] as const) {
    const plain = createClearingSession(`p-${roll}`, "pet", base, 1000, () => roll, [], specials, base);
    const geared = createClearingSession(`g-${roll}`, "pet", { ...base, atk: 150 }, 1000, () => roll, [], specials, base);
    assert.equal(plain.enemies.some(enemy => !!enemy.specialPetShopItemId), expected);
    assert.equal(geared.enemies.some(enemy => !!enemy.specialPetShopItemId), expected);
  }
});
