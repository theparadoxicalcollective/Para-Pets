import assert from "node:assert/strict";
import test from "node:test";
import { cameraTarget, pixelDistance, stepToward } from "../client/src/lib/elysianClearingCombatMath";

test("combat distance measures normalized positions in world pixels", () => {
  const world = { width: 400, height: 800 };
  assert.equal(pixelDistance({x:0,y:0},{x:.1,y:0},world), 40);
  assert.equal(pixelDistance({x:0,y:0},{x:0,y:.1},world), 80);
});

test("enemy steps have equal apparent speed on portrait worlds", () => {
  const world = { width: 400, height: 800 };
  const horizontal = stepToward({x:0,y:0},{x:1,y:0},20,world);
  const vertical = stepToward({x:0,y:0},{x:0,y:1},20,world);
  assert.equal(horizontal.x * world.width, 20);
  assert.equal(vertical.y * world.height, 20);
  const diagonal = stepToward({x:0,y:0},{x:1,y:1},20,world);
  assert.ok(Math.abs(Math.hypot(diagonal.x*world.width, diagonal.y*world.height)-20)<1e-9);
});

test("camera clamps at every world edge", () => {
  const world={width:680,height:1680}, viewport={width:400,height:800};
  assert.deepEqual(cameraTarget({x:0,y:0},world,viewport),{x:0,y:0});
  assert.deepEqual(cameraTarget({x:1,y:1},world,viewport),{x:280,y:880});
});
