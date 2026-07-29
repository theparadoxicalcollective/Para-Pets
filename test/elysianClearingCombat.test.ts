import assert from "node:assert/strict";
import test from "node:test";
import { ELYSIAN_CLEARING_COMBAT, applyClearingHit, createClearingSession, scaleClearingEnemy } from "../server/elysianClearingCombat";

test("clearing enemy scaling uses actual pet HP and stays proportional across pets", () => {
  const scaled = scaleClearingEnemy({ level: 1, hp: 1000, atk: 50, rarity: 1 });
  const highHp = scaleClearingEnemy({ level: 50, hp: 2500, atk: 50, rarity: 1 });
  assert.equal(scaled.maxHealth, 250);
  assert.equal(scaled.attack, 120);
  assert.equal(highHp.attack, 300);
  assert.equal(Math.ceil(scaled.maxHealth / scaled.petDamage), 5);
  assert.equal(Math.ceil(1000 / scaled.attack), Math.ceil(2500 / highHp.attack));
});

test("boss damage remains a proportional fifteen percent of pet HP", () => {
  const session = createClearingSession("boss-balance", "pet", { level: 1, hp: 2000, atk: 50 }, 1000, () => 0, [{ enemy_id: "boss", is_boss: true, name: "Boss", image_url: null }]);
  const boss = session.enemies.find(enemy => enemy.isBoss);
  assert.equal(boss?.attack, 300);
});

test("server combat sessions contain the configured distributed enemy population", () => {
  const session = createClearingSession("user-a", "pet-a", { level: 10, hp: 1600, atk: 90 });
  assert.equal(session.enemies.length, ELYSIAN_CLEARING_COMBAT.enemyCount);
  assert.equal(new Set(session.enemies.map((enemy) => enemy.instanceId)).size, ELYSIAN_CLEARING_COMBAT.enemyCount);
  assert.equal(new Set(session.enemies.map((enemy) => `${enemy.x}:${enemy.y}`)).size, ELYSIAN_CLEARING_COMBAT.enemyCount);
});

test("the server enforces attack cooldown and rejects hits after defeat", () => {
  const session = createClearingSession("user-b", "pet-b", { level: 1, hp: 1000, atk: 50 }, 1000);
  const enemy = session.enemies[0];
  session.position = { x: enemy.x, y: enemy.y, updatedAt: 1000 };
  assert.equal(applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now: 2000 }).status, "hit");
  assert.equal(applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now: 2100 }).status, "cooldown");
  let result;
  for (let now = 2600; now <= 5000; now += 600) result = applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now });
  assert.equal(result?.status, "defeated");
});
