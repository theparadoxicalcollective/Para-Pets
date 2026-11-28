import test from "node:test";
import assert from "node:assert/strict";
import { worldWalkBounds, worldWalkCollision, worldWalkSpawn, worldWalkStep, worldWalkCameraPan, WORLD_WALK_SPEED } from "../client/src/lib/worldSceneWalk";
import { worldEditorCameraGeometry } from "../client/src/lib/worldEditorCamera";
import type { WorldScenePlacement } from "../shared/worlds/worldSceneContent";

const world = { width: 1800, height: 2700 };
const placement = (props: Partial<WorldScenePlacement>) => ({ id: "p", kind: "decor", xPct: .5, yPct: .5,
  size: 180, decorSurface: "barrier", isWaterSource: false, rotation: 0, flipped: false, ...props } as WorldScenePlacement);

test("collision follows the saved barrier role, alpha, flip, rotation and letterbox coordinates", () => {
  const p = placement({});
  const mask = (x: number, y: number) => x < .4 && y > .2 && y < .8;
  const point = { x: .5 - 45 / world.width, y: .5 };
  assert.equal(worldWalkCollision([p], world, () => mask)(point), true);
  assert.equal(worldWalkCollision([p], world, () => mask)({ x: .5 + 45 / world.width, y: .5 }), false);
  assert.equal(worldWalkCollision([{ ...p, flipped: true }], world, () => mask)(point), false);
  assert.equal(worldWalkCollision([{ ...p, rotation: 90 }], world, () => mask)({ x: .5, y: .5 - 45 / world.height }), true);
  assert.equal(worldWalkCollision([{ ...p, decorSurface: "grass" }], world, () => mask)(point), false);
  assert.equal(worldWalkCollision([{ ...p, decorSurface: "ground" }], world, () => mask)(point), false);
  assert.equal(worldWalkCollision([{ ...p, decorSurface: "grass", isWaterSource: true }], world, () => mask)(point), true);
  assert.equal(worldWalkCollision([{ ...p, kind: "building" }], world, () => undefined)(point), true);
});

test("water tiles block walking but walkable opaque ground art can bridge them", () => {
  const water = placement({ kind: "terrain", effectType: "water_path", size: 300 });
  const bridge = placement({ id: "bridge", decorSurface: "ground" });
  const center = { x: .5, y: .5 };
  assert.equal(worldWalkCollision([water], world, () => undefined)(center), true);
  assert.equal(worldWalkCollision([water], world, () => undefined)({ x: .57, y: .53 }), false);
  assert.equal(worldWalkCollision([water, bridge], world, () => () => true)(center), false);
  assert.equal(worldWalkCollision([water, bridge], world, () => () => false)(center), true);
  assert.equal(worldWalkCollision([placement({ kind: "effect" })], world, () => undefined)(center), false);
});

test("the same joystick displacement moves equal world distances on all map sizes and slides at a barrier", () => {
  for (const size of [world, { width: 5400, height: 8100 }]) {
    const from = { x: .5, y: .5 }, next = worldWalkStep(from, { x: .5 + .05, y: .5 }, size, () => false);
    assert.ok(Math.abs((next.x - from.x) * size.width - WORLD_WALK_SPEED * .05) < 1e-8);
  }
  const from = { x: .5, y: .5 };
  const block = (p: { x: number; y: number }) => p.x > .501 && p.x < .505;
  const next = worldWalkStep(from, { x: .55, y: .53 }, world, block);
  assert.ok(next.x <= .501);
  assert.ok(next.y > from.y);
  const bounds = worldWalkBounds(world);
  assert.ok(worldWalkCollision([], world, () => undefined)({ x: bounds.xMin / 2, y: .5 }));
});

test("spawn is on clear ground and camera follows without exposing outside the world", () => {
  const blocked = worldWalkCollision([placement({})], world, () => undefined);
  assert.equal(blocked(worldWalkSpawn(world, blocked)), false);
  for (const viewport of [{ width: 320, height: 700 }, { width: 834, height: 1194 }, { width: 1194, height: 834 }]) {
    const camera = worldEditorCameraGeometry(viewport.width, viewport.height, 4, .9);
    const initial = { x: -camera.limitX / 2, y: -camera.limitY / 2 };
    assert.deepEqual(worldWalkCameraPan({ x: .5, y: .5 }, initial, camera, viewport), initial);
    const next = worldWalkCameraPan({ x: .99, y: .99 }, initial, camera, viewport);
    assert.equal(next.x, -camera.limitX);
    assert.equal(next.y, -camera.limitY);
  }
});
