import test from "node:test";
import assert from "node:assert/strict";
import { worldWalkArtworkMask, worldWalkBounds, worldWalkCollision, worldWalkSpawn, worldWalkStep, worldWalkCameraPan, WORLD_WALK_SPEED } from "../client/src/lib/worldSceneWalk";
import { worldEditorCameraGeometry } from "../client/src/lib/worldEditorCamera";
import type { WorldScenePlacement } from "../shared/worlds/worldSceneContent";

const world = { width: 1800, height: 2700 };
const placement = (props: Partial<WorldScenePlacement>) => ({ id: "p", kind: "decor", xPct: .5, yPct: .5,
  size: 180, decorSurface: "barrier", isWaterSource: false, rotation: 0, flipped: false, ...props } as WorldScenePlacement);

// Express fixture points in the authored square, then transform as the scene
// does. This also checks zoom-independent rotation and mirroring.
const pointAt = (p: WorldScenePlacement, u: number, v: number) => {
  const x = ((p.flipped ? 1 - u : u) - .5) * p.size, y = (v - .5) * p.size;
  const r = (p.rotation ?? 0) * Math.PI / 180;
  return { x: p.xPct + (x * Math.cos(r) - y * Math.sin(r)) / world.width,
    y: p.yPct + (x * Math.sin(r) + y * Math.cos(r)) / world.height };
};

test("solid barrier bases block but raised artwork and transparent padding do not", () => {
  const p = placement({});
  const mask = worldWalkArtworkMask((x, y) => x > .1 && x < .4 && y > .2 && y < .8);
  const blocked = worldWalkCollision([p], world, () => mask);
  assert.equal(blocked(pointAt(p, .25, .5)), false, "behind the visible barrier");
  assert.equal(blocked(pointAt(p, .25, .77)), true, "at the opaque ground-contact base");
  assert.equal(blocked(pointAt(p, .25, .85)), false, "in front of the visible base");
  assert.equal(blocked(pointAt(p, .6, .77)), false, "transparent side remains open");
  for (const transform of [{ flipped: true }, { rotation: 90 }, { rotation: 35, flipped: true }]) {
    const changed = { ...p, ...transform };
    const collision = worldWalkCollision([changed], world, () => mask);
    assert.equal(collision(pointAt(changed, .25, .77)), true);
    assert.equal(collision(pointAt(changed, .25, .5)), false);
  }
  for (const decorSurface of ["grass", "ground"] as const) {
    assert.equal(worldWalkCollision([{ ...p, decorSurface }], world, () => mask)(pointAt(p, .25, .77)), false);
  }
  assert.equal(worldWalkCollision([{ ...p, isWaterSource: true }], world, () => mask)(pointAt(p, .25, .5)), true);
  assert.equal(worldWalkCollision([{ ...p, kind: "building" }], world, () => mask)(pointAt(p, .25, .5)), false);
  assert.equal(worldWalkCollision([{ ...p, kind: "building" }], world, () => mask)(pointAt(p, .25, .77)), true);
  const loading = worldWalkCollision([p], world, () => undefined);
  assert.equal(loading(pointAt(p, .25, .5)), false);
  assert.equal(loading(pointAt(p, .25, .85)), true);
});

test("raised tree canopy stays walkable and a sloped isometric fence blocks at both ends", () => {
  const p = placement({});
  const tree = worldWalkArtworkMask((u, v) =>
    (u > .1 && u < .9 && v > .1 && v < .45) || (u > .44 && u < .56 && v > .4 && v < .9));
  const blocked = worldWalkCollision([p], world, () => tree);
  assert.equal(blocked(pointAt(p, .2, .42)), false, "behind the overhanging canopy");
  assert.equal(blocked(pointAt(p, .5, .6)), false, "behind the trunk base");
  assert.equal(blocked(pointAt(p, .5, .88)), true);
  const fence = worldWalkArtworkMask((u, v) => u > .1 && u < .9 &&
    v > .2 + .5 * u && v < .45 + .5 * u);
  const fenceCollision = worldWalkCollision([p], world, () => fence);
  for (const u of [.12, .5, .88]) {
    assert.equal(fenceCollision(pointAt(p, u, .44 + .5 * u)), true, "sloped fence foot at "+u);
    assert.equal(fenceCollision(pointAt(p, u, .21 + .5 * u)), false, "behind slope at "+u);
  }
  const hole = worldWalkArtworkMask((u, v) => u > .1 && u < .9 && v > .2 && v < .9 && !(u > .45 && u < .55));
  assert.equal(hole.footprint(.5, .88), false, "transparent opening is not solid");
  assert.equal(hole.footprint(.25, .88), true);
});

test("water tiles block walking but walkable opaque ground art can bridge them", () => {
  const water = placement({ kind: "terrain", effectType: "water_path", size: 300 });
  const bridge = placement({ id: "bridge", decorSurface: "ground" });
  const center = { x: .5, y: .5 };
  assert.equal(worldWalkCollision([water], world, () => undefined)(center), true);
  assert.equal(worldWalkCollision([water], world, () => undefined)({ x: .57, y: .53 }), false);
  assert.equal(worldWalkCollision([water, bridge], world, () => worldWalkArtworkMask(() => true))(center), false);
  assert.equal(worldWalkCollision([water, bridge], world, () => worldWalkArtworkMask(() => false))(center), true);
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
