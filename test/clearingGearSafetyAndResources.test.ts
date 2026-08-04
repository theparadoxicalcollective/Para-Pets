import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { BASIC_SWORD_ID, isClearingEquipmentEligibleForSale } from "../server/clearingEquipment";

test("Training Sword follows normal sale eligibility after it is unequipped",()=>{
  const starter={shopItemId:BASIC_SWORD_ID,equipped:false,isListed:false};
  assert.equal(isClearingEquipmentEligibleForSale(starter),true);
  assert.equal(isClearingEquipmentEligibleForSale({...starter,equipped:true}),false);
  assert.equal(isClearingEquipmentEligibleForSale({...starter,isListed:true}),false);
});

test("Clearing equipment mutations share one per-player transaction lock",()=>{
  const source=fs.readFileSync("server/clearingEquipment.ts","utf8");
  const locks=source.match(/await lockClearingEquipmentMutation\(tx,userId\)/g)??[];
  assert.ok(locks.length>=4,"starter setup, equip, unequip, and sale should all use the same lock");
  const sale=source.slice(source.indexOf("export async function sellClearingEquipment"));
  assert.match(sale,/inventoryIds\.some\(id=>equipped\.has\(id\)\)/);
  assert.doesNotMatch(sale,/row\.shopItemId===BASIC_SWORD_ID/);
});

test("enemy attacks use a forward lunge without changing combat state logic",()=>{
  const source=fs.readFileSync("client/src/components/ClearingAttackEffect.tsx","utf8");
  assert.match(source,/data-enemy-state=\"windup\"/);
  assert.match(source,/@keyframes clearing-enemy-attack-lunge/);
  assert.match(source,/CFG\.attackWindupMs/);
  assert.match(source,/prefers-reduced-motion:reduce/);
});

test("admin resource tab exposes three inert colored portal placeholders",()=>{
  const scene=fs.readFileSync("client/src/components/WalkAroundScene.tsx","utf8");
  const panel=fs.readFileSync("client/src/components/clearing/ClearingAdminResourcePanel.tsx","utf8");
  assert.match(scene,/config\.id===ELYSIAN_BAYOU_CLEARING_ID/);
  assert.match(scene,/isElysianClearing&&isAdmin&&<ClearingAdminResourcePanel/);
  assert.match(panel,/data-testid=\"button-add-clearing-resource\"/);
  assert.match(panel,/clearing-resource-placeholder-\$\{theme\.id\}/);
  assert.match(panel,/id:\"amber\"/);
  assert.match(panel,/id:\"green\"/);
  assert.match(panel,/id:\"blue\"/);
  assert.match(panel,/Visual placeholders only/);
});
