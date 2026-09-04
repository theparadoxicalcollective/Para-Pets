import assert from "node:assert/strict";
import test from "node:test";
import { createClearingSession, selectClearingBlessing, applyClearingHit, recordClearingRegularDefeat, advanceClearingBossEncounter, completeClearingBossEncounter, synchronizeClearingSessions } from "../server/elysianClearingCombat";
import { clearingBlessedBasicDamage, clearingBlessedIncomingDamage, clearingBlessedMana, isClearingBlessing } from "../shared/clearingBlessings";
import { CLEARING_BOSS_ENCOUNTER } from "../shared/clearingConfig";

function create() { return createClearingSession(crypto.randomUUID(), "pet", { level: 1, hp: 1000, atk: 50, def: 50 }, 1000, () => .5); }
function reachHalfway(session: ReturnType<typeof create>) {
  for (let i = 0; i < 5; i++) {
    const enemy = session.enemies[i];
    enemy.defeated = true;
    enemy.health = 0;
    recordClearingRegularDefeat(session.id, enemy.instanceId, 1100);
  }
}
function choice(session: ReturnType<typeof create>) {
  return { sessionId: session.id, userId: session.userId, petId: "pet", huntId: session.huntBlessing.huntId, blessing: "thornfang", now: 1200 };
}

test("blessing unlocks at five confirmed defeats, belongs to owner/pet/hunt, and retries cannot stack", () => {
  const session = create(), input = choice(session);
  assert.equal(selectClearingBlessing(input), null);
  reachHalfway(session);
  for (const override of [{ userId: "other" }, { petId: "other" }, { huntId: "stale" }, { blessing: "__proto__" }, { blessing: "toString" }, { now: session.expiresAt }]) {
    assert.equal(selectClearingBlessing({ ...input, ...override }), null);
  }
  assert.deepEqual(selectClearingBlessing(input), { huntId: input.huntId, selected: "thornfang" });
  assert.deepEqual(selectClearingBlessing(input), session.huntBlessing);
  assert.equal(selectClearingBlessing({ ...input, blessing: "barkskin" }), null);
  assert.equal(session.huntBlessing.selected, "thornfang");
  assert.equal(isClearingBlessing(null), false);
});

test("Thornfang affects server basic damage only and gear updates never stack it", () => {
  const session = create();reachHalfway(session);selectClearingBlessing(choice(session));
  const enemy = session.enemies[5];
  const input = { sessionId: session.id, instanceId: enemy.instanceId, userId: session.userId, petId: "pet", now: 1300, maxRangePixels: 10000 };
  assert.equal(applyClearingHit({ ...input, attackActionId: "first" }).damage, 60);
  const health = enemy.health;
  assert.equal(applyClearingHit({ ...input, attackActionId: "first" }).damage, 60);
  assert.equal(enemy.health, health);
  synchronizeClearingSessions(session.userId, { hp: 1000, atk: 100, def: 50 });
  assert.equal(applyClearingHit({ ...input, attackActionId: "gear" }).damage, 120);
  assert.equal(applyClearingHit({ ...input, attackActionId: "special", petDamage: 175 }).damage, 175);
  assert.equal(session.effectiveStats.atk, 100);
});

test("boss completion clears the blessing and rejects delayed choices from the previous hunt", () => {
  const session = create();reachHalfway(session);const input = choice(session);selectClearingBlessing(input);
  // This test exercises blessing lifecycle, not the regular-enemy cadence. Put the
  // session at the authoritative boss threshold so changing hunt length cannot
  // leave this regression test coupled to the number of simultaneous enemies.
  session.clearingBossProgress = {
    regularDefeats: CLEARING_BOSS_ENCOUNTER.regularDefeatThreshold,
    bossPhase: "preparing",
    bossReadyAt: 2000,
  };
  const boss = advanceClearingBossEncounter({ sessionId: session.id, userId: session.userId, now: 4000 });
  assert.ok(boss, "boss should be available at the authoritative defeat threshold");
  assert.equal(session.huntBlessing.selected, "thornfang", "persists through boss preparation and fight");
  boss.defeated = true;boss.health = 0;
  completeClearingBossEncounter(session.id, boss.instanceId, 4100, () => .5);
  assert.equal(session.huntBlessing.selected, null);
  assert.notEqual(session.huntBlessing.huntId, input.huntId);
  reachHalfway(session);
  assert.equal(selectClearingBlessing(input), null, "even a newly eligible hunt cannot accept the old request");
  assert.equal(selectClearingBlessing({ ...choice(session), blessing: "barkskin" })?.selected, "barkskin");
  assert.equal(session.enemies.some(enemy => !!enemy.specialPetShopItemId), false, "new hunt does not roll a special pet");
});

test("blessings retain combat caps and Wisplight charges a special in three successful hits", () => {
  assert.equal(clearingBlessedBasicDamage(50, null), 50);
  assert.equal(clearingBlessedBasicDamage(5000, "thornfang"), 5000);
  assert.equal(clearingBlessedIncomingDamage(120, 0, "barkskin"), 102);
  assert.equal(clearingBlessedIncomingDamage(120, 400, "barkskin"), 51);
  assert.equal(clearingBlessedIncomingDamage(1, 100000, "barkskin"), 1);
  assert.equal(clearingBlessedMana(null), 25);
  assert.equal(Math.ceil(100 / clearingBlessedMana("wisplight")), 3);
});
