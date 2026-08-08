import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceClearingBossEncounter,
  applyClearingHit,
  createClearingSession,
} from "../server/elysianClearingCombat";

const templates = [
  { enemy_id: "frog", is_boss: false, name: "Frog", image_url: null },
  { enemy_id: "boss", is_boss: true, name: "Bog King", image_url: null },
];

test("boss threshold is server-owned and triggers exactly once", () => {
  const session = createClearingSession(
    "boss-user",
    "pet",
    { level: 1, hp: 1000, atk: 50 },
    1000,
    () => 0,
    templates,
  );

  assert.equal(session.enemies.some((enemy) => enemy.isBoss), false);

  for (let defeat = 1; defeat <= 10; defeat += 1) {
    const target = session.enemies[0];
    target.defeated = true;
    target.health = 0;
    const result = advanceClearingBossEncounter(
      session.id,
      target.instanceId,
      2000 + defeat,
      () => 0,
    );

    assert.ok(result);
    assert.equal(result.progress.regularDefeats, defeat);
    if (defeat < 10) assert.equal(result.progress.phase, "regular");
  }

  const boss = session.enemies[0];
  assert.equal(boss.isBoss, true);
  assert.equal(session.bossPhase, "preparing");
  assert.equal(advanceClearingBossEncounter(session.id, "already-counted", 3000), null);
  assert.equal(
    applyClearingHit({
      sessionId: session.id,
      instanceId: boss.instanceId,
      userId: "boss-user",
      petId: "pet",
      now: 3000,
    }).status,
    "target_locked",
  );
});

test("authoritative boss defeat resets progress and resumes regular enemies", () => {
  const session = createClearingSession(
    "boss-reset-user",
    "pet",
    { level: 1, hp: 1000, atk: 50 },
    1000,
    () => 0,
    templates,
  );

  for (let defeat = 0; defeat < 10; defeat += 1) {
    const target = session.enemies[0];
    target.defeated = true;
    target.health = 0;
    advanceClearingBossEncounter(session.id, target.instanceId, 2000 + defeat, () => 0);
  }

  const boss = session.enemies[0];
  boss.defeated = true;
  boss.health = 0;
  const reset = advanceClearingBossEncounter(session.id, boss.instanceId, 4000, () => 0);

  assert.ok(reset);
  assert.equal(reset.progress.regularDefeats, 0);
  assert.equal(reset.progress.phase, "regular");
  assert.equal(reset.nextEnemy?.isBoss, false);
});
