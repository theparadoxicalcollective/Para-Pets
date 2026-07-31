import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resolveLockedClearingTarget, selectFirstEnemyAlongAimCapsule, weaponPointerPosition, weaponPointerRotation } from "../client/src/lib/elysianClearingCombatMath";
import { CLEARING_AIM_GEOMETRY } from "../shared/clearingCombatGeometry";
const weaponPointerSizePixels=34,weaponPointerGapPixels=5,weaponPointerArtOffsetDegrees=90;
import { applyClearingHit, createClearingSession, respawnClearingEnemy } from "../server/elysianClearingCombat";

const world={width:400,height:800};
const candidate=(instanceId:string,x:number,y=.5)=>({enemy:{instanceId},active:true,health:100,center:{x,y},collisionRadius:12});

test("weapon pointer uses visible pet geometry, independent acquisition range, and orderly 360 degree rotation",()=>{
  const origin={x:.5,y:.5},distance=26+weaponPointerSizePixels/2+weaponPointerGapPixels;
  assert.equal(CLEARING_AIM_GEOMETRY.meleeAttackRangePixels,145);assert.equal(distance,48);assert.notEqual(distance,CLEARING_AIM_GEOMETRY.meleeAttackRangePixels);
  const right=weaponPointerPosition(origin,{dx:1,dy:0},world,26,weaponPointerSizePixels,weaponPointerGapPixels)!;
  assert.equal((right.x-origin.x)*world.width,distance);assert.equal(right.y,origin.y);
  const directions=[{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0},{dx:0,dy:-1},{dx:1,dy:1}];
  const rotations=directions.map(direction=>weaponPointerRotation(direction,weaponPointerArtOffsetDegrees));
  assert.deepEqual(rotations.slice(0,4).map(value=>Math.round(value*180/Math.PI)),[90,180,270,0]);
  assert.equal(Math.round(rotations[4]*180/Math.PI),135);
});

test("a persistent client lock wins over changed aim and closer lane candidates",()=>{
  const candidates=[candidate("locked",.8),candidate("closer",.6)];
  const acquired=resolveLockedClearingTarget(null,candidates,()=>selectFirstEnemyAlongAimCapsule({x:.5,y:.5},{dx:1,dy:0},candidates,145,24,world));
  assert.equal(acquired?.instanceId,"closer");
  assert.equal(resolveLockedClearingTarget("locked",candidates,()=>candidates[1].enemy)?.instanceId,"locked");
  assert.equal(resolveLockedClearingTarget("locked",[candidate("crossing",.55)],()=>candidates[1].enemy),undefined);
});

test("server owns target lock, rejects switches, clears it on kill, and does not transfer it on respawn",()=>{
  const session=createClearingSession("lock-user","lock-pet",{level:1,hp:1000,atk:50},1000);
  const first=session.enemies[0],second=session.enemies[1];session.position={x:first.x,y:first.y,updatedAt:1000};
  assert.equal(session.lockedTargetInstanceId,null);
  assert.equal(applyClearingHit({sessionId:session.id,instanceId:first.instanceId,userId:session.userId,petId:session.petId,petDamage:50,now:2000}).status,"hit");
  assert.equal(session.lockedTargetInstanceId,first.instanceId);
  assert.equal(applyClearingHit({sessionId:session.id,instanceId:second.instanceId,userId:session.userId,petId:session.petId,now:2600}).status,"target_locked");
  const killed=applyClearingHit({sessionId:session.id,instanceId:first.instanceId,userId:session.userId,petId:session.petId,petDamage:5000,now:2600});
  assert.equal(killed.status,"killed");assert.equal(session.lockedTargetInstanceId,null);
  const oldId=first.instanceId;const respawned=respawnClearingEnemy(session.id,oldId)!;
  assert.notEqual(respawned.instanceId,oldId);assert.equal(session.lockedTargetInstanceId,null);
});

test("one idle/attack weapon renderer replaces chevron and enemies have static shadows",()=>{
  const combat=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8"),effect=fs.readFileSync("client/src/components/ClearingAttackEffect.tsx","utf8"),css=fs.readFileSync("client/src/index.css","utf8");
  assert.doesNotMatch(combat,/clearing-aim-pointer|clearing-enemy-idle-bounce/);assert.doesNotMatch(css,/clearing-enemy-idle/);
  assert.match(effect,/data-testid="clearing-equipped-weapon-pointer"/);assert.doesNotMatch(effect,/phase === "idle"\) return null/);
  assert.equal((combat.match(/<ClearingAttackEffect/g)||[]).length,1);assert.match(combat,/data-testid="clearing-enemy-ground-shadow"/);
  assert.match(effect,/weaponRarityFilter/);assert.match(effect,/onError=.*setImageFailed\(true\)/s);
});
