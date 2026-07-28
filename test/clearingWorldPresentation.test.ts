import assert from "node:assert/strict";
import test from "node:test";
import { clampWorldObjectPosition, layoutClearingChests, worldYToDepth } from "../client/src/lib/clearingWorldPresentation";

test("world depth follows normalized feet position without flicker",()=>{
  assert.ok(worldYToDepth(.2)<worldYToDepth(.8));
  assert.equal(worldYToDepth(.5001),worldYToDepth(.5002));
  assert.ok(worldYToDepth(.5,1200)>worldYToDepth(1));
});

test("chest layout clamps sprite centers and separates overlaps",()=>{
  assert.deepEqual(clampWorldObjectPosition({x:-1,y:2},{xMin:.2,xMax:.8,yMin:.1,yMax:.9}),{x:.2,y:.9});
  const laidOut=layoutClearingChests([{id:"a",x:0,y:1},{id:"b",x:0,y:1}]);
  assert.deepEqual({x:laidOut[0].x,y:laidOut[0].y},{x:.23,y:.84});
  assert.ok(Math.hypot(laidOut[0].x-laidOut[1].x,(laidOut[0].y-laidOut[1].y)*.62)>=.09);
  for(const chest of laidOut){assert.ok(chest.x>=.23&&chest.x<=.77);assert.ok(chest.y>=.16&&chest.y<=.84);}
});
