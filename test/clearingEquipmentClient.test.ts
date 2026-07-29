import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { CLEARING_DROP_RARITY_STYLES } from "../client/src/lib/clearingRarityStyles";

test("every Clearing rarity has the requested centralized glow mapping",()=>{
  assert.match(CLEARING_DROP_RARITY_STYLES[1].shadow,/22c55e/);
  assert.match(CLEARING_DROP_RARITY_STYLES[2].shadow,/3b82f6/);
  assert.match(CLEARING_DROP_RARITY_STYLES[3].shadow,/a855f7/);
  assert.match(CLEARING_DROP_RARITY_STYLES[4].shadow,/f59e0b/);
  assert.match(CLEARING_DROP_RARITY_STYLES[5].shadow,/eab308/);
});
test("ground rendering uses server stars, adds five-star motes, and omits names and stats",()=>{
  const source=fs.readFileSync("client/src/components/ClearingGroundDrop.tsx","utf8");
  assert.match(source,/repeat\(drop\.stars\)/);assert.match(source,/drop\.stars===5/);assert.doesNotMatch(source,/drop\.name|atkBonus|defBonus|hpBonus/);
});
test("Clearing Inventory includes empty state, game grid, equipped detail, equip and unequip",()=>{
  const source=fs.readFileSync("client/src/components/ClearingEquipmentPanels.tsx","utf8");
  for(const value of ["Clearing Equipment can be found","clearing-inventory-grid","Equipped","clearing-item-detail","onEquip","onUnequip","onOpenChange"])assert.match(source,new RegExp(value));
});

test("only equipped Clearing gear receives the decorative gold frame",()=>{
  const source=fs.readFileSync("client/src/components/ClearingEquipmentPanels.tsx","utf8");
  assert.match(source,/backgroundImage:item\.equipped\?`url\(\$\{equipmentBorder\}\)`/);
  assert.match(source,/item\.equipped\?"bg-black\/25 ring-1 ring-amber-500":"bg-black\/20"/);
});
test("treasure rewards rise in a curved in-world presentation",()=>{
  const layer=fs.readFileSync("client/src/components/ClearingRewardChests.tsx","utf8");
  const combat=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");
  assert.match(layer,/clearing-chest-reward-arc/);
  assert.match(layer,/Math\.cos\(radians\)\*radius/);
  assert.doesNotMatch(layer,/createPortal|role="dialog"/);
  assert.doesNotMatch(layer,/reward\.quantity|>\{reward\.name\}<\/b>/);
  assert.match(layer,/reward\.stars>0/);
  assert.match(combat,/clearing-drop-rise/);
});
