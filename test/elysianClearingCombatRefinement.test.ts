import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resolveMeleeTarget, selectFirstEnemyAlongAimCapsule, weaponArtOffsetForWeapon, weaponPointerRotation } from "../client/src/lib/elysianClearingCombatMath";
import { weaponAttackTransform } from "../client/src/lib/clearingWeaponVisuals";
import { CLEARING_AIM_GEOMETRY, CLEARING_PET_COMBAT_RADIUS, SLASH_MELEE_ATTACK_RANGE } from "../shared/clearingCombatGeometry";
import { validateClearingAttackGeometry } from "../server/elysianClearingCombat";

const world={width:400,height:800},origin={x:.5,y:.5};
const candidate=(instanceId:string,edgePixels:number,angle=0,radius=20)=>({enemy:{instanceId},active:true,health:100,center:{x:origin.x+Math.cos(angle)*(edgePixels+radius+CLEARING_PET_COMBAT_RADIUS)/world.width,y:origin.y+Math.sin(angle)*(edgePixels+radius+CLEARING_PET_COMBAT_RADIUS)/world.height},collisionRadius:radius});
const pointsAt=(direction:{dx:number;dy:number},offset:number,nativeDegrees:number)=>{const rotation=weaponPointerRotation(direction,offset),native=rotation+nativeDegrees*Math.PI/180,length=Math.hypot(direction.dx,direction.dy);return (Math.cos(native)*direction.dx+Math.sin(native)*direction.dy)/length;};

test("attack direction remains available while equipped weapon motion stays local to the pet",()=>{
  const training=weaponArtOffsetForWeapon({stableKey:"clearing-training-sword",attackStyle:"sword_slash"});
  const cypress=weaponArtOffsetForWeapon({shopItemId:"a1b2c3d4-0011-4000-8000-000000000021",attackStyle:"sword_slash"});
  for(const direction of [{dx:1,dy:0},{dx:-1,dy:0},{dx:1,dy:1},{dx:-1,dy:-1}]){
    assert.ok(pointsAt(direction,0,0)>.999,"staff points along target vector");
    assert.ok(pointsAt(direction,training,-90)>.999,"Training Sword points along target vector");
    assert.ok(pointsAt(direction,cypress,135)>.999,"Cypress Fang points along target vector");
  }
  const effect=fs.readFileSync("client/src/components/ClearingAttackEffect.tsx","utf8");
  assert.match(effect,/scaleX\(\$\{facingLeft\?-1:1\}\)/);
  assert.match(effect,/data-testid="clearing-equipped-weapon-motion"/);
  assert.match(effect,/weaponAttackTransform\(phase,style\)/);
  assert.match(effect,/data-testid="clearing-attack-vfx"/);
  assert.match(effect,/rotate\(\$\{angleRadians\}rad\)/);
  const committed=weaponPointerRotation({dx:-1,dy:.5},training);
  for(const phase of ["windup","impact","recovery"] as const){assert.match(weaponAttackTransform(phase),/translateX|rotate/);assert.equal(committed,weaponPointerRotation({dx:-1,dy:.5},training));}
});

test("melee only resolves close edge-range targets and prefers the nearer target",()=>{
  assert.deepEqual({range:CLEARING_AIM_GEOMETRY.meleeAttackRangePixels,assist:CLEARING_AIM_GEOMETRY.meleeTargetAssistRadiusPixels,fallback:CLEARING_AIM_GEOMETRY.meleeFallbackRadiusPixels,hysteresis:CLEARING_AIM_GEOMETRY.meleeLockHysteresisPixels,disengage:CLEARING_AIM_GEOMETRY.meleeDisengageRangePixels},{range:54,assist:54,fallback:54,hysteresis:8,disengage:62});
  assert.equal(CLEARING_AIM_GEOMETRY.meleeAttackRangePixels,SLASH_MELEE_ATTACK_RANGE);
  assert.equal(resolveMeleeTarget(origin,{dx:1,dy:0},[candidate("near",50)],world)?.enemy.instanceId,"near");
  assert.equal(resolveMeleeTarget(origin,{dx:1,dy:0},[candidate("far",140)],world),undefined);
  assert.equal(resolveMeleeTarget(origin,{dx:1,dy:0},[candidate("far",53),candidate("close",35)],world)?.enemy.instanceId,"close");
});

test("staff selection uses edge range, wider mobile lane, and rejects targets behind",()=>{
  assert.equal(CLEARING_AIM_GEOMETRY.staffAttackRangePixels,250);assert.equal(CLEARING_AIM_GEOMETRY.staffCapsuleRadiusPixels,32);
  const edgeRange={enemy:{instanceId:"edge-range"},active:true,health:100,center:{x:origin.x+(245+20)/world.width,y:origin.y},collisionRadius:20},wideLane={enemy:{instanceId:"wide"},active:true,health:100,center:{x:.8,y:.5+30/world.height},collisionRadius:4},behind={enemy:{instanceId:"behind"},active:true,health:100,center:{x:.45,y:.5},collisionRadius:20};
  assert.equal(selectFirstEnemyAlongAimCapsule(origin,{dx:1,dy:0},[edgeRange],250,32,world)?.instanceId,"edge-range");
  assert.equal(selectFirstEnemyAlongAimCapsule(origin,{dx:1,dy:0},[wideLane],250,32,world)?.instanceId,"wide");
  assert.equal(selectFirstEnemyAlongAimCapsule(origin,{dx:1,dy:0},[behind],250,32,world),undefined);
  const geometry={style:"staff_orb" as const,playerPosition:origin,aimDirection:{dx:1,dy:0},aimPoint:{x:1.125,y:.5},enemyPosition:edgeRange.center,enemyRadiusPixels:20,worldPixels:world};
  assert.equal(validateClearingAttackGeometry(geometry),true,"server uses the same edge and lane geometry");
});
