import assert from "node:assert/strict";
import test from "node:test";
import { calculateFollowCamera } from "../client/src/lib/walkAroundCamera";
import { nearestAttackTarget, worldDistance } from "../client/src/components/elysian-clearing/combatMath";
import { resolveActiveClearingPet } from "../server/routes/elysianClearingCombat.routes";
import type { Enemy } from "../client/src/components/elysian-clearing/types";

const enemy=(instanceId:string,x:number,y:number):Enemy=>({instanceId,slot:0,maxHealth:100,health:100,attack:10,x,y,targetX:x,targetY:y,state:"roaming",facingLeft:false,nextActionAt:0});
test("camera follows and clamps without revealing outside the world",()=>{const viewport={width:390,height:844},world={width:1.7,height:2.15};const left=calculateFollowCamera({x:0,y:0},viewport,world),right=calculateFollowCamera({x:1,y:1},viewport,world);assert.deepEqual({x:left.x,y:left.y},{x:0,y:0});assert.equal(right.x,right.worldWidth-viewport.width);assert.equal(right.y,right.worldHeight-viewport.height);});
test("combat distance is aspect-correct and nearest forward enemy wins",()=>{const world={width:600,height:1200},pet={x:.5,y:.5};assert.ok(Math.abs(worldDistance(pet,{x:.5,y:.6},world)-120)<.001);const enemies=[enemy("far",.65,.5),enemy("near",.58,.5),enemy("behind",.42,.5)];assert.equal(nearestAttackTarget(enemies,pet,false,world,100,0.15)?.instanceId,"near");assert.equal(nearestAttackTarget(enemies,pet,true,world,100,0.15)?.instanceId,"behind");});
test("active pet resolves by user_inventory id, not template id",()=>{const inventory=[{id:"inventory-row",petTemplateId:"template",isHatched:true}];assert.equal(resolveActiveClearingPet(inventory,"inventory-row")?.id,"inventory-row");assert.equal(resolveActiveClearingPet(inventory,"template"),undefined);});
