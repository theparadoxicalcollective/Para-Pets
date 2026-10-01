import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WORLD_DEFINITIONS,
  WORLD_IDS,
} from "../shared/worlds/worldRegistry";

const read = (path: string) => readFileSync(path, "utf8");

const SIMPLE_WORLDS = [
  {
    key: "frostpeak",
    id: WORLD_IDS.frostpeak,
    path: "client/src/worlds/frostpeak/presentation.ts",
    constant: "FROSTPEAK_PRESENTATION",
    asset: "shop_frostpeak.png",
    accent: "#88ccff",
    gradient:
      "linear-gradient(180deg, rgba(20,30,60,0.7) 0%, rgba(40,80,120,0.3) 50%, rgba(10,15,30,0.7) 100%)",
  },
  {
    key: "skyRealm",
    id: WORLD_IDS.skyRealm,
    path: "client/src/worlds/sky-realm/presentation.ts",
    constant: "SKY_REALM_PRESENTATION",
    asset: "shop_sky_realm.png",
    accent: "#ffd700",
    gradient:
      "linear-gradient(180deg, rgba(40,30,10,0.7) 0%, rgba(80,60,20,0.3) 50%, rgba(20,15,5,0.7) 100%)",
  },
  {
    key: "lostIsland",
    id: WORLD_IDS.lostIsland,
    path: "client/src/worlds/lost-island/presentation.ts",
    constant: "LOST_ISLAND_PRESENTATION",
    asset: "shop_island.png",
    accent: "#20b2aa",
    gradient:
      "linear-gradient(180deg, rgba(5,30,30,0.7) 0%, rgba(10,60,60,0.3) 50%, rgba(5,15,15,0.7) 100%)",
  },
  {
    key: "scorchedDesert",
    id: WORLD_IDS.scorchedDesert,
    path: "client/src/worlds/scorched-desert/presentation.ts",
    constant: "SCORCHED_DESERT_PRESENTATION",
    asset: "shop_desert.png",
    accent: "#daa520",
    gradient:
      "linear-gradient(180deg, rgba(40,25,5,0.7) 0%, rgba(80,50,10,0.3) 50%, rgba(20,12,3,0.7) 100%)",
  },
  {
    key: "enchantedGrove",
    id: WORLD_IDS.enchantedGrove,
    path: "client/src/worlds/enchanted-grove/presentation.ts",
    constant: "ENCHANTED_GROVE_PRESENTATION",
    asset: "shop_enchanted_grove_v2.png",
    accent: "#7fffd4",
    gradient:
      "linear-gradient(180deg, rgba(5,30,20,0.7) 0%, rgba(10,60,40,0.3) 50%, rgba(5,15,10,0.7) 100%)",
  },
] as const;

test("remaining presentation-only worlds own their existing visual metadata", () => {
  for (const world of SIMPLE_WORLDS) {
    const source = read(world.path);

    assert.ok(source.includes(world.asset), world.path);
    assert.ok(source.includes(`worldId: WORLD_IDS.${world.key}`), world.path);
    assert.ok(source.includes(`accent: "${world.accent}"`), world.path);
    assert.ok(source.includes(world.gradient), world.path);
    assert.ok(source.includes(`export const ${world.constant}`), world.path);
  }
});

test("client registry delegates all five simple worlds without adding destination behavior", () => {
  const registry = read("client/src/worlds/registry.ts");

  for (const world of SIMPLE_WORLDS) {
    const entry = new RegExp(
      `\\[WORLD_IDS\\.${world.key}\\]: \\{[\\s\\S]*?presentation: ${world.constant},[\\s\\S]*?\\n  \\},`,
    );
    assert.match(registry, entry, world.key);
  }

  for (const world of SIMPLE_WORLDS) {
    const start = registry.indexOf(`[WORLD_IDS.${world.key}]: {`);
    assert.ok(start >= 0, world.key);
    const end = registry.indexOf("\n  },", start);
    assert.ok(end > start, world.key);
    const block = registry.slice(start, end);
    assert.doesNotMatch(block, /resolveDestination/);
  }
});

test("simple world access and authored map heights remain unchanged", () => {
  for (const world of SIMPLE_WORLDS) {
    const definition = WORLD_DEFINITIONS[world.id];
    assert.equal(definition.access, "staff", world.key);
    assert.equal(definition.fixedMapHeight, 1980, world.key);
  }
});

test("central client registry no longer owns simple-world assets or visual values", () => {
  const registry = read("client/src/worlds/registry.ts");

  for (const world of SIMPLE_WORLDS) {
    assert.equal(registry.includes(world.asset), false, world.key);
    assert.equal(registry.includes(world.accent), false, world.key);
    assert.equal(registry.includes(world.gradient), false, world.key);
  }

  assert.doesNotMatch(registry, /const presentation =/);
});
