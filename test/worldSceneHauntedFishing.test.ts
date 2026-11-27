import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorldSceneAction, HAUNTED_FISH_LEADERBOARD_DECOR_NAME } from "../shared/worlds/worldSceneActions";
import { HAUNTED_WOODS_WORLD_ID, HAUNTED_WOODS_FISHING_SPOTS } from "../shared/worlds/hauntedWoods";
import { readHauntedFishingSpot } from "../client/src/lib/hauntedFishingSpot";

const world = HAUNTED_WOODS_WORLD_ID;
const asset = { worldId: world, name: HAUNTED_FISH_LEADERBOARD_DECOR_NAME, kind: "decor", imageUrl: "/art.png" };

test("the exact Haunted Woods Fish Leaderboard decoration opens the fishing leaderboard", () => {
  assert.equal(resolveWorldSceneAction(world, "decor", asset), "fishing-leaderboard");
  assert.equal(resolveWorldSceneAction(world, "decor", { ...asset, name: "  FISH LEADERBOARD  " }), "fishing-leaderboard");
  for (const name of ["Fish", "Fish Leaderboard Sign", "Fishing Shop", "Haunted Casino"])
    assert.equal(resolveWorldSceneAction(world, "decor", { ...asset, name }), null);
  for (const kind of ["building", "npc", "terrain", "effect"])
    assert.equal(resolveWorldSceneAction(world, kind, asset), null);
  assert.equal(resolveWorldSceneAction(world, "decor", { ...asset, kind: "building" }), null);
  assert.equal(resolveWorldSceneAction(world, "decor", { ...asset, worldId: "swamp" }), null);
  assert.equal(resolveWorldSceneAction("swamp", "decor", { ...asset, worldId: "swamp" }), null);
});

test("standalone water ripples open fishing only in Haunted Woods, without an art asset", () => {
  assert.equal(resolveWorldSceneAction(world, "effect", null, "water_ripple"), "fishing-spot");
  assert.equal(resolveWorldSceneAction(world, "effect", undefined, "water_ripple"), "fishing-spot");
  for (const other of ["water_shimmer", "waterfall_mist", "water_flow", "water_drop", "fireflies", null])
    assert.equal(resolveWorldSceneAction(world, "effect", null, other), null);
  for (const kind of ["terrain", "decor", "building", "npc"])
    assert.equal(resolveWorldSceneAction(world, kind, null, "water_ripple"), null);
  for (const worldId of ["swamp", "island", "enchanted_grove", "volcanic", "desert"])
    assert.equal(resolveWorldSceneAction(worldId, "effect", null, "water_ripple"), null);
});

test("Haunted Spin keeps its existing connection", () => {
  assert.equal(resolveWorldSceneAction(world, "decor", { ...asset, name: "Haunted Spin" }), "beau-prize-wheel");
});

const [primary, secondary] = HAUNTED_WOODS_FISHING_SPOTS;
const fixtureSpot = (spot: typeof primary | typeof secondary) => ({
  id: spot.id, name: spot.name, worldId: world, type: "fishing", isShop: false, bgUrl: "/pond.png",
});

test("opening a ripple always checks the existing Wraithwater record first", async () => {
  const requested: string[] = [];
  const signal = new AbortController().signal;
  const request: typeof fetch = async (input, init) => {
    requested.push(String(input));
    assert.equal(init?.signal, signal);
    assert.equal(init?.credentials, "include");
    return Response.json(fixtureSpot(primary));
  };
  assert.deepEqual(await readHauntedFishingSpot(signal, request), {
    id: primary.id, name: primary.name, bgUrl: "/pond.png",
  });
  assert.deepEqual(requested, [`/api/location/${primary.id}`]);
});

test("fallback is confined to the second canonical haunted pond", async () => {
  for (const response of [
    new Response(null, { status: 404 }),
    Response.json({ ...fixtureSpot(primary), worldId: "swamp" }),
    Response.json({ ...fixtureSpot(primary), type: "landmark" }),
    Response.json({ ...fixtureSpot(primary), isShop: true }),
    Response.json({ ...fixtureSpot(primary), id: "wrong-location" }),
  ]) {
    const queries: string[] = [];
    const request: typeof fetch = async path => {
      queries.push(String(path));
      return queries.length === 1 ? response : Response.json(fixtureSpot(secondary));
    };
    assert.equal((await readHauntedFishingSpot(new AbortController().signal, request)).id, secondary.id);
    assert.deepEqual(queries, [`/api/location/${primary.id}`, `/api/location/${secondary.id}`]);
  }
});

test("unavailable ponds fail safely and transient errors do not redirect to a different pond", async () => {
  for (const status of [404, 503, 401]) {
    const requested: string[] = [];
    const request: typeof fetch = async path => {
      requested.push(String(path));
      return new Response(null, { status });
    };
    await assert.rejects(readHauntedFishingSpot(new AbortController().signal, request));
    assert.deepEqual(requested, status === 404
      ? [`/api/location/${primary.id}`, `/api/location/${secondary.id}`]
      : [`/api/location/${primary.id}`]);
  }
});
