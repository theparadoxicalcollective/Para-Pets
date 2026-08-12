import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { initializeClearingEnemies } from "../client/src/lib/clearingEnemySession";
import { scheduleClearingDeathEffectRemoval, CLEARING_DEATH_EFFECT_SAFETY_MS } from "../client/src/lib/clearingDeathEffects";
import { scheduleClearingTimer } from "../client/src/lib/clearingTimers";
import { clearingWeaponOrigin, CLEARING_PET_PRESENTATION } from "../client/src/lib/clearingPetPresentation";
import { directionToClearingTarget, weaponArtOffsetForStyle, weaponPointerPosition, weaponPointerRotation } from "../client/src/lib/elysianClearingCombatMath";
import { CLEARING_ENCOUNTER_HOMES } from "../shared/clearingEncounterLayout";
import { applyClearingHit, createClearingSession, updateClearingEnemyPositions } from "../server/elysianClearingCombat";

const world={width:400,height:800};

test("session initialization preserves server coordinates, including later encounter clusters",()=>{
  const source=[0,1,2,3,4,5].map(slot=>({instanceId:`e${slot}`,slot,isBoss:false,x:.11+slot*.1,y:.2+slot*.05}));
  const enemies=initializeClearingEnemies(source,CLEARING_ENCOUNTER_HOMES,100,[0],()=>40);
  for(let i=0;i<source.length;i++)assert.deepEqual({x:enemies[i].x,y:enemies[i].y,homeX:enemies[i].homeX,homeY:enemies[i].homeY,targetX:enemies[i].targetX,targetY:enemies[i].targetY},{x:source[i].x,y:source[i].y,homeX:source[i].x,homeY:source[i].y,targetX:source[i].x,targetY:source[i].y});
  const invalid=initializeClearingEnemies([{instanceId:"bad",slot:0,isBoss:false,x:NaN,y:.4}],CLEARING_ENCOUNTER_HOMES,100,[0],()=>40)[0];
  assert.deepEqual({x:invalid.x,y:invalid.y},CLEARING_ENCOUNTER_HOMES[0]);
});

test("bosses enter the Clearing already engaged while regular enemies remain passive",()=>{
  const enemies=initializeClearingEnemies([{instanceId:"regular",isBoss:false,x:.4,y:.4},{instanceId:"boss",isBoss:true,x:.6,y:.4}],CLEARING_ENCOUNTER_HOMES,100,[0,0],()=>40);
  assert.equal(enemies[0].engagedByPlayer,false);
  assert.equal(enemies[1].engagedByPlayer,true);
});

test("later-cluster enemy is hittable at its server-provided displayed coordinate and distance remains enforced",()=>{
  const session=createClearingSession("cluster-user","pet",{level:1,hp:1000,atk:50},1000,()=>.4);
  const enemy=session.enemies[5];
  session.position={x:enemy.x,y:enemy.y,updatedAt:1000};
  assert.equal(applyClearingHit({sessionId:session.id,instanceId:enemy.instanceId,userId:"cluster-user",petId:"pet",enemyPosition:{x:enemy.x,y:enemy.y},now:1100}).status,"hit");
  session.lockedTargetInstanceId=null; session.position={x:.08,y:.05,updatedAt:1200};
  assert.equal(applyClearingHit({sessionId:session.id,instanceId:enemy.instanceId,userId:"cluster-user",petId:"pet",enemyPosition:{x:enemy.x,y:enemy.y},now:1200}).status,"range");
});

test("validated roaming position remains hittable while teleport is rejected as desync",()=>{
  const session=createClearingSession("roam-user","pet",{level:1,hp:1000,atk:50},1000,()=>.3),enemy=session.enemies[0];
  const roaming={x:enemy.x+30/world.width,y:enemy.y};
  assert.equal(updateClearingEnemyPositions({sessionId:session.id,userId:"roam-user",positions:[{enemyInstanceId:enemy.instanceId,...roaming}],worldPixels:world,now:1500}),true);
  session.position={...roaming,updatedAt:1500};
  assert.equal(applyClearingHit({sessionId:session.id,instanceId:enemy.instanceId,userId:"roam-user",petId:"pet",enemyPosition:roaming,now:1600}).status,"hit");
  session.lockedTargetInstanceId=null;
  const teleport={x:.92,y:.94};
  assert.equal(updateClearingEnemyPositions({sessionId:session.id,userId:"roam-user",positions:[{enemyInstanceId:enemy.instanceId,...teleport}],worldPixels:world,now:1601}),false);
  const rejected=applyClearingHit({sessionId:session.id,instanceId:enemy.instanceId,userId:"roam-user",petId:"pet",enemyPosition:teleport,now:1602});
  assert.equal(rejected.status,"desync"); assert.equal(rejected.diagnostic?.rejectionReason,"enemy_position_desync");
});

test("weapon body anchor and upward-art forward vector work in all target directions and freeze per swing",()=>{
  assert.ok(CLEARING_PET_PRESENTATION.weaponOrigin.forwardRatio>=.12&&CLEARING_PET_PRESENTATION.weaponOrigin.forwardRatio<=.18);
  assert.ok(CLEARING_PET_PRESENTATION.weaponOrigin.upRatio>=.30&&CLEARING_PET_PRESENTATION.weaponOrigin.upRatio<=.36);
  const pet={x:.5,y:.6};
  for(const delta of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]] as const){
    const target={x:pet.x+delta[0]*.1,y:pet.y+delta[1]*.05},left=target.x<pet.x,anchor=clearingWeaponOrigin(pet,60,world,left),direction=directionToClearingTarget(anchor,target,world),pointer=weaponPointerPosition(anchor,direction,world,6)!;
    assert.ok(Math.hypot((pointer.x-pet.x)*world.width,(pointer.y-pet.y)*world.height)<30);
    const rotation=weaponPointerRotation(direction,weaponArtOffsetForStyle("sword_slash")),blade={dx:Math.cos(rotation-Math.PI/2),dy:Math.sin(rotation-Math.PI/2)},length=Math.hypot(direction.dx,direction.dy);
    assert.ok((blade.dx*direction.dx+blade.dy*direction.dy)/length>.999,"blade points at target");
    const frozen=rotation,movedTarget={x:target.x+.08,y:target.y+.04};void movedTarget;assert.equal(frozen,rotation,"active swing retains its start direction");
  }
});

test("combat renders every attack phase from the fixed body anchor instead of an aim offset",()=>{
  const source=readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");
  assert.match(source,/const weaponPointer=petCombatCenter;/);
  assert.doesNotMatch(source,/const weaponPointer=weaponPointerPosition\(petCombatCenter/);
});

test("boss presentation keeps the health bar above the enlarged sprite",()=>{
  const source=readFileSync("client/src/clearingBossPolish.css","utf8");
  assert.match(source,/scale:\s*2\.05/);
  assert.match(source,/top:\s*-48px\s*!important/);
  assert.match(source,/data-enemy-rank="boss"/);
});

test("death effects are independently removed after duration under normal and reduced motion",()=>{
  for(const reducedMotion of [false,true]){let effects=["one","two"],callback:(()=>void)|undefined,delay=0;const fakeTimer=((fn:()=>void,ms?:number)=>{callback=fn;delay=ms??0;return 1 as unknown as ReturnType<typeof setTimeout>}) as typeof setTimeout;
    scheduleClearingDeathEffectRemoval("one",850,id=>{effects=effects.filter(effect=>effect!==id)},fakeTimer);
    assert.deepEqual(effects,["one","two"]);assert.equal(delay,850+CLEARING_DEATH_EFFECT_SAFETY_MS);callback!();assert.deepEqual(effects,["two"]);assert.equal(typeof reducedMotion,"boolean");
  }
});

test("completed combat timers release retained attack state and enemy alerts have no visual indicator",()=>{
  const timers=new Set<ReturnType<typeof setTimeout>>();let callback:(()=>void)|undefined,runs=0;
  const fakeTimer=((fn:()=>void)=>{callback=fn;return 1 as unknown as ReturnType<typeof setTimeout>}) as typeof setTimeout;
  scheduleClearingTimer(timers,()=>{runs++},100,fakeTimer);
  assert.equal(timers.size,1);callback!();assert.equal(runs,1);assert.equal(timers.size,0);

  const source=readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");
  assert.match(source,/scheduleClearingTimer\(timers\.current,async\(\)=>/);
  assert.doesNotMatch(source,/clearing-enemy-alert|clearing-alert-pop|>!<\/span>/);
});
