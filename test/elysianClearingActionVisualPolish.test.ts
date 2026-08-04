import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Keep the requested Clearing presentation rules protected from future combat refactors.
const combat = readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
const scene = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
const weapon = readFileSync("client/src/components/ClearingAttackEffect.tsx", "utf8");

test("routine Clearing actions avoid central success text and healing reveals the health bar", () => {
  assert.match(combat, /const revealPetHealthBar=useCallback/);
  assert.match(combat, /setPetHealth\(healed\);revealPetHealthBar\(\)/);
  assert.doesNotMatch(combat, /Clearing loadout updated/);
  assert.doesNotMatch(combat, /Enemy defeated ·/);
  assert.doesNotMatch(combat, /Rewards collected/);
  assert.doesNotMatch(combat, /egg collected/);
  assert.match(combat, /Equipment update failed/);
  assert.match(combat, /Combat temporarily unavailable/);
});

test("special readiness glows the original pet without a duplicate image", () => {
  const start = combat.indexOf('data-testid="clearing-pet-special-ready"');
  const end = combat.indexOf('/>}', start);
  const control = combat.slice(start, end + 3);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(control, /<img/);
  assert.match(control, /clearing-special-ready-hitbox/);
  assert.match(scene, /specialReady \? "is-special-ready" : ""/);
  assert.match(scene, /onSpecialReadyChange=\{setSpecialReady\}/);
  assert.equal(scene.match(/<PetAnimator/g)?.length, 1);
});

test("the equipped weapon stays fixed while attack VFX aim independently", () => {
  assert.doesNotMatch(weapon, /weaponAttackTransform/);
  assert.match(weapon, /scaleX\(\$\{facingLeft\?-1:1\}\)/);
  assert.match(weapon, /data-testid="clearing-attack-vfx"/);
  assert.match(weapon, /rotate\(\$\{angleRadians\}rad\)/);
  assert.equal(weapon.match(/data-testid="clearing-equipped-weapon-image"/g)?.length, 1);
  assert.match(combat, /clearingWeaponOrigin\(petPos,petSize,worldPixels,facingLeft\)/);
});

test("moving enemies use a CSS-only grounded squish with reduced-motion support", () => {
  assert.match(combat, /data-enemy-state=\{e\.state\}/);
  assert.match(combat, /\["roaming","pursuing","returning"\]\.includes\(e\.state\)/);
  assert.match(combat, /clearing-enemy-art\.is-moving/);
  assert.match(combat, /transform-origin:50% 100%/);
  assert.match(combat, /scaleY\(\.96\)/);
  assert.match(combat, /prefers-reduced-motion:reduce/);
});
