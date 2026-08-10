import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { initializeReadyClearingEnemies } from "../client/src/lib/clearingEnemySession";
import { resolveEnemyPairs, type SimEnemy } from "../client/src/lib/clearingEnemyBehavior";
import { FALLBACK_ENEMY_IMAGE_METRICS, resolveEnemyImageMetrics } from "../client/src/lib/enemyImageMetrics";

const enemy=(id:string,x:number):SimEnemy=>({instanceId:id,templateId:"frog",isBoss:false,state:"roaming",engagedByPlayer:false,x,y:.5,homeX:x,homeY:.5,visibleHalfWidth:20});
test("initial encounter is fully active before its readiness callback",()=>{const ready=initializeReadyClearingEnemies([{instanceId:"a",x:.3,y:.4,isBoss:false},{instanceId:"b",x:.5,y:.6,isBoss:false}],[{x:.5,y:.5}],1000,()=>28);assert.ok(ready.every(item=>item.state==="roaming"&&item.nextActionAt>1000));const source=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");assert.match(source,/loadEnemyImageMetricsWithTimeout/);assert.match(source,/setImageMetrics[\s\S]*enemiesRef\.current=built;setEnemies\(built\);setSessionState\("ready"\);onEnemiesReadyRef\.current\(\)/);assert.match(source,/sessionState==="ready"&&enemies\.map/);});
test("stalled enemy presentation metrics fall back without blocking readiness",async()=>{
  const stalled=new Promise<never>(()=>{});
  assert.equal(await resolveEnemyImageMetrics(stalled,5),FALLBACK_ENEMY_IMAGE_METRICS);
});
test("soft separation converges without snapping or unstable oscillation",()=>{const bodies=[enemy("a",.5),enemy("b",.501)];let previous=0;for(let frame=0;frame<120;frame++){resolveEnemyPairs(bodies,{width:400,height:800});const distance=Math.abs(bodies[1].x-bodies[0].x)*400;assert.ok(distance+1e-9>=previous);assert.ok(distance-previous<=3.01);previous=distance;}assert.ok(previous>=34.9&&previous<=40);const settled=bodies.map(body=>body.x);resolveEnemyPairs(bodies,{width:400,height:800});assert.ok(Math.abs(bodies[0].x-settled[0])<.004);});
test("decorative sprite motion stays inside the authoritative world wrapper",()=>{const source=fs.readFileSync("client/src/components/ElysianClearingCombat.tsx","utf8");assert.match(source,/<div className={`clearing-enemy-sprite/);assert.match(source,/@keyframes clearing-enemy-breathe/);assert.match(source,/prefers-reduced-motion:reduce/);assert.doesNotMatch(source,/authoritativeEnemyGroundPosition[^\n]*clearing-enemy-sprite/);});
