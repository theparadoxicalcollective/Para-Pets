import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { smoothEnemyMotion } from "../client/src/lib/clearingEnemyBehavior";
import { selectClearingStrikeTargets } from "../client/src/lib/elysianClearingCombatMath";
import { ELYSIAN_CLEARING_COMBAT_CONFIG as CFG } from "../client/src/lib/elysianClearingCombatConfig";
import { applyClearingHit, createClearingSession } from "../server/elysianClearingCombat";
import { layoutClearingEncounter } from "../shared/clearingEncounterLayout";
import { CLEARING_AIM_GEOMETRY } from "../shared/clearingCombatGeometry";

const world={width:400,height:800};
const seeded=(seed:number)=>()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const target=(instanceId:string,x:number,y=.5,radius=14)=>({enemy:{instanceId},active:true,health:100,center:{x,y},collisionRadius:radius});

test("Clearing encounter homes vary by session while remaining deterministic and bounded",()=>{
  const templates=Array.from({length:10},(_,index)=>({enemy_id:index<5?"wraith":"serpent"}));
  const first=layoutClearingEncounter(templates,seeded(11)),repeat=layoutClearingEncounter(templates,seeded(11)),different=layoutClearingEncounter(templates,seeded(92));
  assert.deepEqual(first,repeat);
  assert.notDeepEqual(first,different);
  assert.equal(first.length,10);
  for(const point of first){assert.ok(point.x>=.10&&point.x<=.90);assert.ok(point.y>=.09&&point.y<=.91);}
  assert.ok(new Set(first.map(point=>`${point.x.toFixed(4)}:${point.y.toFixed(4)}`)).size>=8);
});

test("enemy steering accelerates smoothly and brakes instead of snapping",()=>{
  let body={x:.2,y:.5,velocityX:0,velocityY:0};
  const targetPoint={x:.7,y:.5};
  const first=smoothEnemyMotion(body,targetPoint,18,55,.05,world);
  assert.ok(first.velocityX>0&&first.velocityX<18);
  assert.ok(first.x>.2&&first.x<targetPoint.x);
  body={x:first.x,y:first.y,velocityX:first.velocityX,velocityY:first.velocityY};
  const second=smoothEnemyMotion(body,targetPoint,18,55,.05,world);
  assert.ok(second.velocityX>=first.velocityX);
  const near=smoothEnemyMotion({x:.699,y:.5,velocityX:4,velocityY:0},targetPoint,18,55,.05,world);
  assert.ok(near.velocityX<4||near.arrived);
});

test("Clearing movement tuning is smaller, slower, and gives idle enemies longer rests",()=>{
  assert.equal(CFG.normalEnemyVisibleHeight,28);
  assert.equal(CFG.bossEnemyVisibleHeight,38);
  assert.ok(CFG.roamSpeedPixels<=18);
  assert.ok(CFG.roamPauseMs.min>=1800);
  assert.ok(CFG.roamPauseMs.max>=4000);
  assert.equal(CFG.maxStrikeTargets,2);
});

test("one strike selects no more than two enemies in the same attack direction",()=>{
  const origin={x:.5,y:.5};
  const melee=selectClearingStrikeTargets("sword_slash",origin,{dx:1,dy:0},[
    target("near",.59),target("second",.61,.505),target("behind",.42),target("off-axis",.56,.62),
  ],world,null,2);
  assert.deepEqual(melee.map(enemy=>enemy.instanceId),["near","second"]);
  const staff=selectClearingStrikeTargets("staff_orb",origin,{dx:1,dy:0},[
    target("first",.65),target("second",.75,.51),target("third",.85,.5),
  ],world,null,2);
  assert.deepEqual(staff.map(enemy=>enemy.instanceId),["first","second"]);
});

test("server validates a secondary strike while preserving the primary target lock",()=>{
  const session=createClearingSession("dual-user","pet",{level:1,hp:1000,atk:50},1000,seeded(5));
  const primary=session.enemies[0],secondary=session.enemies[1],origin={x:.5,y:.5};
  primary.x=.58;primary.y=.5;secondary.x=.60;secondary.y=.505;
  session.position={...origin,updatedAt:2000};
  const aimDirection={dx:1,dy:0},aimPoint={x:origin.x+CLEARING_AIM_GEOMETRY.meleeAttackRangePixels/world.width,y:origin.y};
  const geometry=(enemy:typeof primary)=>({style:"sword_slash" as const,playerPosition:origin,aimDirection,aimPoint,enemyPosition:{x:enemy.x,y:enemy.y},enemyRadiusPixels:19,worldPixels:world});
  const first=applyClearingHit({sessionId:session.id,instanceId:primary.instanceId,userId:session.userId,petId:session.petId,petDamage:20,attackActionId:"dual:0",attackGeometry:geometry(primary),enemyPosition:{x:primary.x,y:primary.y},now:2000});
  assert.equal(first.status,"hit");
  assert.equal(session.lockedTargetInstanceId,primary.instanceId);
  const second=applyClearingHit({sessionId:session.id,instanceId:secondary.instanceId,userId:session.userId,petId:session.petId,petDamage:20,attackActionId:"dual:1",secondaryStrike:true,attackGeometry:geometry(secondary),enemyPosition:{x:secondary.x,y:secondary.y},now:2000});
  assert.equal(second.status,"hit");
  assert.equal(session.lockedTargetInstanceId,primary.instanceId);
  assert.equal(applyClearingHit({sessionId:session.id,instanceId:secondary.instanceId,userId:session.userId,petId:session.petId,now:2001}).status,"target_locked");
});

test("enemy renderer has no ground shadow circles and the request is capped at two targets",()=>{
  const combat=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8"),routes=fs.readFileSync("server/routes/elysianClearingCombat.routes.ts","utf8");
  assert.doesNotMatch(combat,/clearing-enemy-ground-shadow/);
  assert.doesNotMatch(combat,/h-\[76px\] w-\[76px\].*rounded-full/);
  assert.match(combat,/targets:targetPayloads/);
  assert.match(combat,/slice\(0,CFG\.maxStrikeTargets\)/);
  assert.match(routes,/rawTargets\.length>2/);
  assert.match(routes,/secondaryStrike:index>0/);
});
