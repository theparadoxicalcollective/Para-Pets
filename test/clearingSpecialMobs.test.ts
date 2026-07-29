import assert from "node:assert/strict";
import test from "node:test";
import { selectClearingSpecialMob } from "../server/clearingSpecialMobs";

const pets=[
 {pet_shop_item_id:"common",name:"Common",rarity:1,egg_image_url:null,hatched_image_url:null,image_url:null},
 {pet_shop_item_id:"legendary",name:"Legendary",rarity:5,egg_image_url:null,hatched_image_url:null,image_url:null},
];
test("special mobs only pass the rare encounter roll",()=>{
 assert.equal(selectClearingSpecialMob(pets,()=>.12),undefined);
 assert.equal(selectClearingSpecialMob(pets,()=>.99),undefined);
});
test("rarity weights strongly favor lower-rarity pets",()=>{
 const values=[.01,.5];let index=0;
 assert.equal(selectClearingSpecialMob(pets,()=>values[index++])?.pet_shop_item_id,"common");
 const tail=[.01,.99];index=0;
 assert.equal(selectClearingSpecialMob(pets,()=>tail[index++])?.pet_shop_item_id,"legendary");
});
