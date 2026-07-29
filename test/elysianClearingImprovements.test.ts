import assert from "node:assert/strict";
import test from "node:test";
import { cameraTarget, circleHitsCapsule, clearingWorldSize, closestClearingAttackTarget, insetMovementBounds, meleeArcHit } from "../client/src/lib/elysianClearingCombatMath";
import { enemyFlipScale, nextEnemyFacing, resolveClearingAttackStyle, rollTierRarity } from "../shared/clearingCombat";
import { BASIC_SWORD_ID, chooseClearingStarterWeapon } from "../server/clearingEquipment";
import { auditClearingEquipment, clearingEquipmentPower } from "../server/clearingEquipmentBalance";

test("responsive Clearing background preserves aspect and eliminates vertical travel",()=>{const world=clearingWorldSize({width:390,height:844},2886/4331);assert.equal(world.height,844);assert.ok(Math.abs(world.width-844*2886/4331)<1e-9);assert.equal(cameraTarget({x:.5,y:1},world,{width:390,height:844}).y,0);});
test("camera clamps all contained artwork edges",()=>{const w={width:600,height:800},v={width:400,height:800};assert.deepEqual(cameraTarget({x:0,y:0},w,v),{x:0,y:0});assert.deepEqual(cameraTarget({x:1,y:1},w,v),{x:200,y:0});});
test("movement bounds include visual radius and feet anchor",()=>{const b=insetMovementBounds({xMin:.1,xMax:.9,yMin:.1,yMax:.9},{width:400,height:800},120);assert.deepEqual(b,{xMin:.208,xMax:.792,yMin:.22,yMax:.87});});
test("facing honors natural orientation and idle dead zone",()=>{assert.equal(nextEnemyFacing("left",2),"left");assert.equal(nextEnemyFacing("left",4),"right");assert.equal(enemyFlipScale("left","left"),1);assert.equal(enemyFlipScale("left","right"),-1);});
test("attack style prefers metadata and has normalized fallbacks",()=>{assert.equal(resolveClearingAttackStyle({attackStyle:"staff_orb",name:"Sword"}),"staff_orb");assert.equal(resolveClearingAttackStyle({name:" BASIC SWORD "}),"sword_slash");assert.equal(resolveClearingAttackStyle({name:"mystery"}),"default_melee");});
test("sword arcs and staff projectile capsules can hit and miss",()=>{assert.equal(meleeArcHit({x:0,y:0},1,{x:8,y:0,radius:1},10),true);assert.equal(meleeArcHit({x:0,y:0},1,{x:-2,y:0,radius:1},10),false);const c={from:{x:0,y:0},to:{x:10,y:0},radius:1};assert.equal(circleHitsCapsule({x:5,y:1,radius:.1},c),true);assert.equal(circleHitsCapsule({x:5,y:3,radius:.1},c),false);});
test("starter sword grant is idempotent and never overwrites equipment",()=>{assert.deepEqual(chooseClearingStarterWeapon({ownedWeapons:[]}),{grant:true,equipId:null});assert.deepEqual(chooseClearingStarterWeapon({ownedWeapons:[{inventoryId:"basic",shopItemId:BASIC_SWORD_ID}]}),{grant:false,equipId:"basic"});assert.deepEqual(chooseClearingStarterWeapon({equippedId:"chosen",ownedWeapons:[]}),{grant:false,equipId:null});});
test("tier tables enforce hard rarity caps",()=>{assert.equal(rollTierRarity("normal",()=>.999),3);assert.equal(rollTierRarity("tough",()=>.999),4);assert.equal(rollTierRarity("elite",()=>.999),5);});
test("equipment audit validates power budgets and unresolved weapons",()=>{assert.equal(clearingEquipmentPower({slot:"weapon",atkBonus:4,defBonus:0,hpBonus:0}),8);const [row]=auditClearingEquipment([{id:"x",name:"Mystery",imageUrl:null,slot:"weapon",stars:1,atkBonus:-1,defBonus:0,hpBonus:0}]);assert.deepEqual(row.issues.sort(),["missing_image","negative_stat","stat_budget_outlier","unresolved_attack_style"].sort());});

test("starter selection preserves an equipped weapon and deterministically equips the oldest eligible owned weapon",()=>{
  const owned=[{inventoryId:"oldest",shopItemId:"weapon-a"},{inventoryId:"newer",shopItemId:"weapon-b"}];
  assert.deepEqual(chooseClearingStarterWeapon({ownedWeapons:owned}),{grant:false,equipId:"oldest"});
  assert.deepEqual(chooseClearingStarterWeapon({equippedId:"newer",ownedWeapons:owned}),{grant:false,equipId:null});
});

test("attack targeting always prefers the closest valid live candidate",()=>{const candidates=[{enemy:"far-facing",distance:110,facingDot:1},{enemy:"closest",distance:55,facingDot:.4},{enemy:"outside",distance:126,facingDot:1},{enemy:"behind",distance:20,facingDot:-1}];assert.equal(closestClearingAttackTarget(candidates,125,.15),"closest");assert.equal(closestClearingAttackTarget([{enemy:"less-aligned",distance:50,facingDot:.3},{enemy:"aligned",distance:50,facingDot:.9}],125,.15),"aligned");});

test("center-based targeting ignores dead entries and chooses the nearest in-range hitbox",async()=>{
  const {nearestValidClearingTarget,directionToClearingTarget}=await import("../client/src/lib/elysianClearingCombatMath");
  const world={width:400,height:800},origin={x:.5,y:.5};
  const candidates=[
    {enemy:"dead-near",active:true,health:0,center:{x:.51,y:.5},collisionRadius:10},
    {enemy:"far",active:true,health:10,center:{x:.7,y:.5},collisionRadius:10},
    {enemy:"near",active:true,health:10,center:{x:.6,y:.5},collisionRadius:10},
    {enemy:"inactive",active:false,health:10,center:{x:.52,y:.5},collisionRadius:10},
  ];
  assert.equal(nearestValidClearingTarget(origin,candidates,125,world),"near");
  assert.equal(directionToClearingTarget(origin,{x:.6,y:.6},world).angleRadians,Math.atan2(80,40));
});
