import assert from "node:assert/strict";
import test from "node:test";
import { ELYSIAN_CLEARING_COMBAT, applyClearingHit, createClearingSession, scaleClearingEnemy } from "../server/elysianClearingCombat";

test("clearing enemy scaling stays near the intended five-hit and eight-hit targets", () => {
  const scaled = scaleClearingEnemy({ level: 1, hp: 1000, atk: 50, rarity: 1 });
  assert.equal(scaled.maxHealth, 250);
  assert.ok(scaled.attack >= 110 && scaled.attack <= 120);
  assert.equal(Math.ceil(scaled.maxHealth / scaled.petDamage), 5);
  assert.ok(Math.ceil(1000 / scaled.attack) >= 8);
});

test("server combat sessions contain exactly three independently identified enemies", () => {
  const session = createClearingSession("user-a", "pet-a", { level: 10, hp: 1600, atk: 90 });
  assert.equal(session.enemies.length, ELYSIAN_CLEARING_COMBAT.enemyCount);
  assert.equal(new Set(session.enemies.map((enemy) => enemy.instanceId)).size, 3);
});

test("the server enforces attack cooldown and rejects hits after defeat", () => {
  const session = createClearingSession("user-b", "pet-b", { level: 1, hp: 1000, atk: 50 }, 1000);
  const enemy = session.enemies[0];
  assert.equal(applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now: 2000 }).status, "hit");
  assert.equal(applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now: 2100 }).status, "cooldown");
  let result;
  for (let now = 2600; now <= 5000; now += 600) result = applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now });
  assert.equal(result?.status, "defeated");
});
