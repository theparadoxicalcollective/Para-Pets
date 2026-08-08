import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const combat = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
const effect = readFileSync("client/src/components/clearing/ClearingMagicEffect.tsx", "utf8");
const config = readFileSync("client/src/lib/elysianClearingCombatConfig.ts", "utf8");

test("healing feedback only plays after health actually increases", () => {
  assert.match(combat, /if\(healed>before\)playPetMagic\("heal"\)/);
  assert.match(combat, /Number\(body\.healAmount\)>0/);
  assert.match(effect, /<i \/><i \/><i \/><i \/><i \/><i \/><i \/><i \/>/);
});

test("short-lived Clearing effects are timer-cleaned and reduced-motion safe", () => {
  assert.match(combat, /setPetMagicEffects\(current=>current\.filter/);
  assert.match(combat, /timers\.current\.add\(timer\)/);
  assert.match(combat, /timers\.current\.forEach\(clearTimeout\)/);
  assert.match(combat, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(effect, /requestAnimationFrame|setInterval|setTimeout/);
});

test("roaming remains speed-bounded while adding curved steering and an alert beat", () => {
  assert.match(config, /roamCurvePixels:\s*7/);
  assert.match(config, /alertDurationMs:\s*420/);
  assert.match(combat, /CFG\.roamSpeedPixels\*\(\.92\+\(e\.slot%5\)\*\.035\)/);
  assert.match(combat, /e\.state="alerting"/);
  assert.match(combat, /data-testid="clearing-active-target"/);
});
