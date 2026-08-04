import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { CLEARING_SWORD_TIMING, inventoryWeaponRotation, weaponAttackTransform, weaponRarityFilter } from "../client/src/lib/clearingWeaponVisuals";
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

test("sword and staff attack phases animate locally while directional VFX remain separate", () => {
  assert.equal(inventoryWeaponRotation("clearing-training-sword"),45);
  assert.equal(inventoryWeaponRotation("another-weapon"),0);
  assert.equal(weaponAttackTransform("idle"), "translateX(0px) rotate(0deg)");
  assert.equal(weaponAttackTransform("windup","sword_slash"), "translateX(-2px) rotate(-30deg)");
  assert.equal(weaponAttackTransform("impact","sword_slash"), "translateX(5px) rotate(34deg)");
  assert.equal(weaponAttackTransform("windup","staff_orb"), "translateX(-1px) rotate(-16deg)");
  assert.equal(weaponAttackTransform("impact","staff_orb"), "translateX(4px) rotate(20deg)");
  assert.notEqual(weaponAttackTransform("impact","sword_slash"),weaponAttackTransform("impact","staff_orb"));
  assert.deepEqual(CLEARING_SWORD_TIMING, {windupMs:90,impactMs:70,recoveryMs:140,totalMs:300});
  for (let stars=1;stars<=5;stars++) assert.match(weaponRarityFilter(stars), /drop-shadow/);
});

test("a target is committed after a successful impact and queued presses are retained", () => {
  assert.match(combat, /lockedTargetInstanceIdRef/);
  assert.match(combat, /data.lockedTargetInstanceId\)updateTargetLock/);
  assert.match(combat, /setAttackPhase\("impact"\)[\s\S]+fetch\("\/api\/explore\/elysian-clearing\/attack"/);
  assert.match(combat, /setAttackPhase\("recovery"\)/);
  assert.match(combat, /setAttackPhase\("idle"\)/);
  assert.match(combat, /queuedAttackRef\.current=true/);
});
