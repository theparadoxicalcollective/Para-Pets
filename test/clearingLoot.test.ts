import assert from "node:assert/strict";
import test from "node:test";
import { CLEARING_LOOT, normalizeEligibleLoot, rollClearingRarity, selectClearingLoot } from "../server/clearingLoot";
import { updateClearingPosition, createClearingSession } from "../server/elysianClearingCombat";

const item=(stars:number,id=`item-${stars}`)=>({id,name:id,image_url:null,clearing_slot:"weapon",star_rarity:stars,atk_boost:stars,def_boost:0,health_boost:0});

test("Clearing equipment uses the exact six percent drop probability",()=>assert.equal(CLEARING_LOOT.equipmentChance,.06));
test("rarity rolls are deterministic and match all configured bands",()=>{
  assert.deepEqual([0,.55,.83,.95,.99].map(value=>rollClearingRarity(()=>value)),[1,2,3,4,5]);
});
test("empty rarity pools fall lower before checking higher rarity pools",()=>{
  assert.equal(selectClearingLoot([item(2),item(5)],()=>.96)?.star_rarity,2);
  assert.equal(selectClearingLoot([item(5)],()=>.2)?.star_rarity,5);
  assert.equal(selectClearingLoot([],()=>0),null);
});
test("database loot rows are normalized and malformed slots or rarities are excluded",()=>{
  const valid=normalizeEligibleLoot({id:"blade",name:"Bayou Blade",image_url:null,clearing_slot:"weapon",star_rarity:"3",atk_boost:"12",def_boost:null,health_boost:0});
  assert.deepEqual(valid,{id:"blade",name:"Bayou Blade",image_url:null,clearing_slot:"weapon",star_rarity:3,atk_boost:12,def_boost:null,health_boost:0});
  assert.equal(normalizeEligibleLoot({...valid,clearing_slot:"hat"}),null);
  assert.equal(normalizeEligibleLoot({...valid,star_rarity:6}),null);
  assert.equal(normalizeEligibleLoot({...valid,atk_boost:"not-a-number"}),null);
});
test("server position tracking rejects world bounds and impossible movement",()=>{
  const session=createClearingSession("position-user","pet",{level:1,hp:1000,atk:50},1000);
  assert.equal(updateClearingPosition({sessionId:session.id,userId:"other",x:.5,y:.7,now:2000}),null);
  assert.equal(updateClearingPosition({sessionId:session.id,userId:"position-user",x:2,y:.7,now:2000}),null);
  assert.equal(updateClearingPosition({sessionId:session.id,userId:"position-user",x:.8,y:.1,now:1100}),null);
  assert.ok(updateClearingPosition({sessionId:session.id,userId:"position-user",x:.52,y:.7,now:1500}));
});
