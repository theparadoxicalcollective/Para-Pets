import assert from "node:assert/strict";
import test from "node:test";
import { CLEARING_BOSS_ATTACK, stepClearingBossAttack, clearingBossAttackHits, type ClearingBossAttack } from "../client/src/lib/clearingBossAttack";

const pet = { x: .5, y: .6 };
function stepFor(attack: ClearingBossAttack, duration: number, target = pet) {
  let impacts = 0;
  for (let elapsed = 0; elapsed < duration; elapsed += 50) {
    const result = stepClearingBossAttack(attack, target, Math.min(50, duration - elapsed));
    attack = result.attack;if (result.impact) impacts++;
  }
  return { attack, impacts };
}

test("boss locks its warning on the ground, strikes once, and holds a recovery window", () => {
  let attack = stepClearingBossAttack(undefined, pet, 0).attack;
  attack = stepFor(attack, CLEARING_BOSS_ATTACK.firstDelayMs).attack;
  assert.equal(attack.phase, "telegraph");
  assert.deepEqual(attack.center, pet);
  const moved = { x: .8, y: .6 };
  let result = stepFor(attack, CLEARING_BOSS_ATTACK.warningMs - 50, moved);
  assert.equal(result.impacts, 0);
  assert.deepEqual(result.attack.center, pet);
  result = stepFor(result.attack, 50, moved);
  assert.equal(result.impacts, 1);
  assert.equal(result.attack.phase, "recovery");
  result = stepFor(result.attack, CLEARING_BOSS_ATTACK.recoveryMs - 50);
  assert.equal(result.attack.phase, "recovery");
  assert.equal(result.impacts, 0);
  result = stepFor(result.attack, 50);
  assert.equal(result.attack.phase, "waiting");
  assert.equal(result.attack.remainingMs, CLEARING_BOSS_ATTACK.cooldownMs);
});

test("pauses and background frame gaps do not skip the warning", () => {
  const warning: ClearingBossAttack = { phase: "telegraph", center: { ...pet }, remainingMs: 1300 };
  assert.deepEqual(stepClearingBossAttack(warning, pet, 0).attack, warning);
  const resumed = stepClearingBossAttack(warning, pet, 30000);
  assert.equal(resumed.impact, false);
  assert.equal(resumed.attack.remainingMs, 1250);
});

test("moving outside the visible ground radius avoids the burst on tall and wide worlds", () => {
  for (const world of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    assert.equal(clearingBossAttackHits(pet, pet, world), true);
    assert.equal(clearingBossAttackHits(pet, { x: pet.x + 63 / world.width, y: pet.y }, world), true);
    assert.equal(clearingBossAttackHits(pet, { x: pet.x + 65 / world.width, y: pet.y }, world), false);
    assert.equal(clearingBossAttackHits(pet, { x: pet.x, y: pet.y + 65 / world.height }, world), false);
  }
});
