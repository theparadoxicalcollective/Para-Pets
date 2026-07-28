import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { CLEARING_SWORD_TIMING, inventoryWeaponRotation, swordTransform, weaponRarityFilter } from "../client/src/lib/clearingWeaponVisuals";
import { BASIC_SWORD_ID, BASIC_SWORD_IMAGE_URL, BASIC_SWORD_NAME, BASIC_SWORD_SLUG, chooseClearingStarterWeapon } from "../server/clearingEquipment";

const combat = fs.readFileSync("client/src/components/ElysianClearingCombat.tsx", "utf8");
const effect = fs.readFileSync("client/src/components/ClearingAttackEffect.tsx", "utf8");

test("starter lookup uses one stable identity and no duplicate Basic Sword seed", () => {
  assert.equal(BASIC_SWORD_ID, "a1b2c3d4-0011-4000-8000-000000000012");
  assert.equal(BASIC_SWORD_SLUG, "clearing-training-sword");
  assert.equal(BASIC_SWORD_NAME, "Training Sword");
  assert.match(BASIC_SWORD_IMAGE_URL, /pvp_battle_sword\.png$/);
  assert.deepEqual(chooseClearingStarterWeapon({ ownedWeapons:[{inventoryId:"owned",shopItemId:BASIC_SWORD_ID}] }), {grant:false,equipId:"owned"});
  assert.doesNotMatch(fs.readFileSync("server/clearingEquipment.ts", "utf8"), /VALUES\([^\n]+,'Basic Sword'/);
});

test("equipped weapon reaches the renderer and real image has a safe fallback", () => {
  assert.match(combat, /weapon=\{equipment\.loadout\.data\?\.weapon\?\?session\?\.loadout\.weapon\?\?null\}/);
  for (const field of ["inventoryId","shopItemId","stableKey","name","imageUrl","stars","attackStyle","atkBonus"]) assert.match(effect, new RegExp(field));
  assert.match(effect, /clearing-equipped-weapon-image/);
  assert.match(effect, /onError=.*setImageFailed\(true\)/s);
  assert.match(effect, /clearing-weapon-fallback/);
  assert.match(effect, /clearing-sword-slash/);
  assert.match(effect, /clearing-staff-orb/);
});

test("sword phases mirror without turning upside down and rarity uses alpha-aware filters", () => {
  assert.equal(inventoryWeaponRotation("clearing-training-sword"),45);
  assert.equal(inventoryWeaponRotation("another-weapon"),0);
  assert.equal(swordTransform("right", "impact"), "translate(-50%, -88%) scaleX(1) rotate(-135deg)");
  assert.equal(swordTransform("left", "impact"), "translate(-50%, -88%) scaleX(-1) rotate(-135deg)");
  assert.deepEqual(CLEARING_SWORD_TIMING, {windupMs:90,impactMs:70,recoveryMs:140,totalMs:300});
  for (let stars=1;stars<=5;stars++) assert.match(weaponRarityFilter(stars), /drop-shadow/);
});

test("misses retain the slash and the request starts at impact", () => {
  assert.match(combat, /setAttackPhase\("impact"\)[\s\S]+if\(!target\)\{setFeedback\(\["Miss"\]\);return;\}/);
  assert.match(combat, /setAttackPhase\("impact"\)[\s\S]+fetch\("\/api\/explore\/elysian-clearing\/attack"/);
  assert.match(combat, /setAttackPhase\("recovery"\)/);
  assert.match(combat, /setAttackPhase\("idle"\)/);
  assert.match(combat, /attackPhaseRef\.current!=="idle"/);
});
