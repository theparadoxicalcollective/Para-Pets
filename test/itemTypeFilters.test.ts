import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { itemTypeLabel, itemTypeOptions } from "../client/src/lib/itemTypeFilters";

test("item type filters label known and future catalog types",()=>{
  assert.equal(itemTypeLabel("accessory"),"Gear");
  assert.equal(itemTypeLabel("clearing"),"Clearing Gear");
  assert.equal(itemTypeLabel("quest_reward"),"Quest Reward");
  assert.deepEqual(itemTypeOptions([{type:"potion"},{type:"gift"},{type:"potion"},{type:null}]),["gift","item","potion"]);
});

test("player bag, Clearing drop picker, and Clearing Shop expose themed type controls",()=>{
  const inventory=fs.readFileSync("client/src/components/PetInventory.tsx","utf8");
  const admin=fs.readFileSync("client/src/components/clearing/ClearingAdminSections.tsx","utf8");
  const shop=fs.readFileSync("client/src/components/clearing/ClearingShopOverlay.tsx","utf8");
  assert.match(inventory,/visibleTabs\.map/);
  assert.match(inventory,/itemTypeOptions/);
  assert.match(admin,/Filter catalog by item type/);
  assert.match(
    admin,
    /type\s*===\s*"all"\s*\|\|\s*\(item\.type\s*\|\|\s*"item"\)\s*===\s*type/,
  );
  assert.match(shop,/Filter Clearing Shop by item type/);
  assert.match(shop,/shownItems\.map/);
});
