import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_DEFINITION_LIST,
  WORLD_DEFINITIONS,
  WORLD_IDS,
  getWorldDefinition,
  isKnownWorldId,
  isWorldOpenToPlayers,
} from "../shared/worlds/worldRegistry";

test("world registry preserves every existing canonical world id and fallback name", () => {
  assert.deepEqual(
    WORLD_DEFINITION_LIST.map((world) => [world.id, world.defaultName]),
    [
      ["snowy_mountain", "Frostpeak"],
      ["sky_realm", "Sky Realm"],
      ["volcanic", "Volcanic Isle"],
      ["island", "The Lost Island"],
      ["desert", "Scorched Desert"],
      ["enchanted_grove", "Enchanted Grove"],
      ["haunted_woods", "Haunted Woods"],
      ["swamp", "Elysian Swamplands"],
    ],
  );
  assert.equal(new Set(WORLD_DEFINITION_LIST.map((world) => world.id)).size, 8);
});

test("world registry preserves the current player-access boundary", () => {
  assert.equal(isWorldOpenToPlayers(WORLD_IDS.elysianBayou), true);
  assert.equal(isWorldOpenToPlayers(WORLD_IDS.volcanic), true);

  for (const world of WORLD_DEFINITION_LIST) {
    if (world.id === WORLD_IDS.elysianBayou || world.id === WORLD_IDS.volcanic) continue;
    assert.equal(isWorldOpenToPlayers(world.id), false, world.id);
  }

  assert.equal(isWorldOpenToPlayers("unknown-world"), false);
});

test("world registry preserves authored map heights used by admin placement", () => {
  assert.equal(WORLD_DEFINITIONS[WORLD_IDS.elysianBayou].fixedMapHeight, 1621);
  assert.equal(WORLD_DEFINITIONS[WORLD_IDS.volcanic].fixedMapHeight, 1440);
  assert.equal(WORLD_DEFINITIONS[WORLD_IDS.hauntedWoods].fixedMapHeight, 1440);

  for (const id of [
    WORLD_IDS.frostpeak,
    WORLD_IDS.skyRealm,
    WORLD_IDS.lostIsland,
    WORLD_IDS.scorchedDesert,
    WORLD_IDS.enchantedGrove,
  ]) {
    assert.equal(WORLD_DEFINITIONS[id].fixedMapHeight, 1980, id);
  }
});

test("world lookup helpers accept known ids without inventing unknown worlds", () => {
  assert.equal(isKnownWorldId("haunted_woods"), true);
  assert.equal(getWorldDefinition("haunted_woods")?.moduleKey, "haunted-woods");
  assert.equal(getWorldDefinition("swamp")?.moduleKey, "elysian-bayou");
  assert.equal(isKnownWorldId("new-unregistered-world"), false);
  assert.equal(getWorldDefinition("new-unregistered-world"), undefined);
});

test("WorldPage reads identity, access, and authored map height from the shared registry", () => {
  const source = readFileSync("client/src/pages/WorldPage.tsx", "utf8");

  assert.match(source, /getWorldDefinition\(worldId\)/);
  assert.match(source, /isWorldOpenToPlayers\(worldId\)/);
  assert.match(source, /worldDefinition\?\.fixedMapHeight/);
  assert.match(source, /worldDefinition\.defaultName/);

  assert.doesNotMatch(source, /const OPEN_WORLDS/);
  assert.doesNotMatch(source, /const WORLD_FIXED_MAP_H/);
  assert.doesNotMatch(source, /const WORLD_CONFIG/);
});

test("client presentation remains separate from shared world identity", () => {
  const worldPage = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
  const clientRegistry = readFileSync("client/src/worlds/registry.ts", "utf8");

  assert.match(worldPage, /getClientWorldModule\(worldId\)/);
  assert.match(worldPage, /clientWorldModule\?\.presentation/);
  assert.doesNotMatch(worldPage, /const WORLD_PRESENTATION/);
  assert.doesNotMatch(worldPage, /shopIcon: shopSwamp/);

  assert.match(clientRegistry, /VOLCANIC_PRESENTATION/);
  assert.match(clientRegistry, /HAUNTED_WOODS_PRESENTATION/);
  assert.match(clientRegistry, /ELYSIAN_BAYOU_PRESENTATION/);
  assert.match(clientRegistry, /\[WORLD_IDS\.volcanic\]/);
  assert.match(clientRegistry, /\[WORLD_IDS\.hauntedWoods\]/);
  assert.match(clientRegistry, /\[WORLD_IDS\.elysianBayou\]/);
  assert.doesNotMatch(clientRegistry, /shopSwamp/);
});

test("server world foundations reuse registry ids without changing their world-specific behavior", () => {
  const canonical = readFileSync("server/worlds/canonicalWorldMaps.ts", "utf8");
  const haunted = readFileSync("shared/worlds/hauntedWoods.ts", "utf8");

  assert.match(canonical, /WORLD_IDS\.hauntedWoods/);
  assert.match(canonical, /WORLD_IDS\.elysianBayou/);
  assert.match(canonical, /WORLD_IDS\.volcanic/);
  assert.match(haunted, /HAUNTED_WOODS_WORLD_ID = WORLD_IDS\.hauntedWoods/);
});
