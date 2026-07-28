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
