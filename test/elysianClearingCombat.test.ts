import assert from "node:assert/strict";
import test from "node:test";
import { ELYSIAN_CLEARING_COMBAT, applyClearingHit, createClearingSession, scaleClearingEnemy } from "../server/elysianClearingCombat";
import { resolveClearingPetBaseStats } from "../server/routes/elysianClearingCombat.routes";

test("Clearing sessions retain combat defaults when legacy pet stats are absent", () => {
  assert.deepEqual(resolveClearingPetBaseStats({ petHealth: null, petAtk: undefined, petDef: "" }), {
    hp: 1000,
    atk: 50,
    def: 50,
  });
  assert.deepEqual(resolveClearingPetBaseStats({ petHealth: "1200", petAtk: "75", petDef: "60" }), {
    hp: 1200,
    atk: 75,
    def: 60,
  });
});

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

test("the server accepts sequential button hits and rejects hits after defeat", () => {
  const session = createClearingSession("user-b", "pet-b", { level: 1, hp: 1000, atk: 50 }, 1000);
  const enemy = session.enemies[0];
  session.position = { x: enemy.x, y: enemy.y, updatedAt: 1000 };
  assert.equal(applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now: 2000 }).status, "hit");
  assert.equal(applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now: 2100 }).status, "hit");
  let result;
  for (let now = 2200; now <= 5000; now += 100) result = applyClearingHit({ sessionId: session.id, instanceId: enemy.instanceId, userId: "user-b", petId: "pet-b", petDamage: 50, now });
  assert.equal(result?.status, "defeated");
});

test("server rejects melee and staff targets outside directional geometry", async () => {
  const { validateClearingAttackGeometry } = await import("../server/elysianClearingCombat");
  const base={playerPosition:{x:.5,y:.5},aimDirection:{dx:1,dy:0},aimPoint:{x:.7625,y:.5},worldPixels:{width:400,height:800},enemyRadiusPixels:10};
  assert.equal(validateClearingAttackGeometry({...base,style:"default_melee",enemyPosition:{x:.5,y:.25}}),false);
  assert.equal(validateClearingAttackGeometry({...base,style:"default_melee",enemyPosition:{x:.68,y:.5}}),true);
  assert.equal(validateClearingAttackGeometry({...base,style:"staff_orb",aimPoint:{x:1.125,y:.5},enemyPosition:{x:.7,y:.65}}),false);
  assert.equal(validateClearingAttackGeometry({...base,style:"staff_orb",aimPoint:{x:1.125,y:.5},enemyPosition:{x:.8,y:.5}}),true);
  assert.equal(validateClearingAttackGeometry({...base,style:"staff_orb",aimPoint:{x:1.125,y:.5},aimDirection:{dx:Infinity,dy:0},enemyPosition:{x:.8,y:.5}}),false);
});
