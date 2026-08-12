import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { smoothEnemyMotion } from "../client/src/lib/clearingEnemyBehavior";
import { selectClearingStrikeTargets } from "../client/src/lib/elysianClearingCombatMath";
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
  const near=smoothEnemyMotion({x:.6998,y:.5,velocityX:4,velocityY:0},targetPoint,18,55,.05,world);
  assert.ok(near.velocityX<4||near.arrived);
});

test("Clearing movement tuning is smaller, slower, and gives idle enemies longer rests",()=>{
  const config=fs.readFileSync("client/src/lib/elysianClearingCombatConfig.ts","utf8");
  assert.match(config,/normalEnemyVisibleHeight:\s*28/);
  assert.match(config,/bossEnemyVisibleHeight:\s*38/);
  assert.match(config,/roamSpeedPixels:\s*12/);
  assert.match(config,/roamPauseMs:\s*\{\s*min:\s*2600,\s*max:\s*6200\s*\}/);
  assert.match(config,/maxStrikeTargets:\s*1/);
});

test("each strike selects one enemy and may retarget according to the current aim",()=>{
  const origin={x:.5,y:.5},candidates=[target("left",.41),target("right",.59)];
  const right=selectClearingStrikeTargets("sword_slash",origin,{dx:1,dy:0},candidates,world,"left",1);
  assert.deepEqual(right.map(enemy=>enemy.instanceId),["right"]);
  const left=selectClearingStrikeTargets("sword_slash",origin,{dx:-1,dy:0},candidates,world,"right",1);
  assert.deepEqual(left.map(enemy=>enemy.instanceId),["left"]);
  const staff=selectClearingStrikeTargets("staff_orb",origin,{dx:1,dy:0},[
    target("first",.65),target("second",.75,.51),target("third",.85,.5),
  ],world,null,1);
  assert.deepEqual(staff.map(enemy=>enemy.instanceId),["first"]);
});

test("a legacy secondary target cannot take damage while a later primary strike can retarget",()=>{
  const session=createClearingSession("single-user","pet",{level:1,hp:1000,atk:50},1000,seeded(5));
  const primary=session.enemies[0],secondary=session.enemies[1],origin={x:.5,y:.5};
  primary.x=.58;primary.y=.5;secondary.x=.60;secondary.y=.505;
  session.position={...origin,updatedAt:2000};
  const aimDirection={dx:1,dy:0},aimPoint={x:origin.x+CLEARING_AIM_GEOMETRY.meleeAttackRangePixels/world.width,y:origin.y};
  const geometry=(enemy:typeof primary)=>({style:"sword_slash" as const,playerPosition:origin,aimDirection,aimPoint,enemyPosition:{x:enemy.x,y:enemy.y},enemyRadiusPixels:19,worldPixels:world});
  const first=applyClearingHit({sessionId:session.id,instanceId:primary.instanceId,userId:session.userId,petId:session.petId,petDamage:20,attackActionId:"single:0",attackGeometry:geometry(primary),enemyPosition:{x:primary.x,y:primary.y},now:2000});
  assert.equal(first.status,"hit");
  assert.equal(session.lockedTargetInstanceId,primary.instanceId);
  const secondaryHealth=secondary.health;
  const blocked=applyClearingHit({sessionId:session.id,instanceId:secondary.instanceId,userId:session.userId,petId:session.petId,petDamage:20,attackActionId:"single:0:legacy-secondary",secondaryStrike:true,attackGeometry:geometry(secondary),enemyPosition:{x:secondary.x,y:secondary.y},now:2000});
  assert.equal(blocked.status,"direction");
  assert.equal(secondary.health,secondaryHealth);
  assert.equal(session.lockedTargetInstanceId,primary.instanceId);
  const retargeted=applyClearingHit({sessionId:session.id,instanceId:secondary.instanceId,userId:session.userId,petId:session.petId,petDamage:20,attackActionId:"single:1",attackGeometry:geometry(secondary),enemyPosition:{x:secondary.x,y:secondary.y},now:2001});
  assert.equal(retargeted.status,"hit");
  assert.equal(secondary.health,secondaryHealth-20);
  assert.equal(session.lockedTargetInstanceId,secondary.instanceId);
});

test("enemy renderer has no ground shadow circles and the client sends its configured target count",()=>{
  const combat=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8"),server=fs.readFileSync("server/elysianClearingCombat.ts","utf8");
  assert.doesNotMatch(combat,/clearing-enemy-ground-shadow/);
  assert.doesNotMatch(combat,/h-\[76px\] w-\[76px\].*rounded-full/);
  assert.match(combat,/targets:targetPayloads/);
  assert.match(combat,/slice\(0,CFG\.maxStrikeTargets\)/);
  assert.match(server,/if\(input\.secondaryStrike===true\)return \{status:"direction" as const\}/);
});
