import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WORLD_IDS } from "../shared/worlds/worldRegistry";

const read = (path: string) => readFileSync(path, "utf8");

test("client world-module contract keeps presentation and optional destinations generic", () => {
  const source = read("client/src/worlds/types.ts");

  assert.match(source, /export interface WorldPresentation/);
  assert.match(source, /worldId: WorldId/);
  assert.match(source, /shopIcon: string/);
  assert.match(source, /accent: string/);
  assert.match(source, /bgGradient: string/);
  assert.match(source, /export type ClientWorldDestination/);
  assert.match(source, /kind: "route"; route: string/);
  assert.match(source, /kind: "notice"; title: string; description: string/);
  assert.match(source, /export interface ClientWorldModule/);
  assert.match(
    source,
    /resolveDestination\?: \(locationId: string\) => ClientWorldDestination \| undefined/,
  );
});

test("client registry contains exactly one module entry for every registered world", () => {
  const source = read("client/src/worlds/registry.ts");

  const registryKeys = [
    "frostpeak",
    "skyRealm",
    "volcanic",
    "lostIsland",
    "scorchedDesert",
    "enchantedGrove",
    "hauntedWoods",
    "elysianBayou",
  ];

  for (const key of registryKeys) {
    const matches = source.match(new RegExp(`\\[WORLD_IDS\\.${key}\\]:`, "g")) ?? [];
    assert.equal(matches.length, 1, key);
  }

  assert.equal(Object.keys(WORLD_IDS).length, registryKeys.length);
  assert.match(
    source,
    /CLIENT_WORLD_MODULES: Readonly<Record<WorldId, ClientWorldModule>>/,
  );
});

test("existing presentation values live in dedicated world modules unchanged", () => {
  const registry = read("client/src/worlds/registry.ts");
  const worldPage = read("client/src/pages/WorldPage.tsx");

  const modules = [
    ["client/src/worlds/frostpeak/presentation.ts", "shop_frostpeak.png", "#88ccff"],
    ["client/src/worlds/sky-realm/presentation.ts", "shop_sky_realm.png", "#ffd700"],
    ["client/src/worlds/lost-island/presentation.ts", "shop_island.png", "#20b2aa"],
    ["client/src/worlds/scorched-desert/presentation.ts", "shop_desert.png", "#daa520"],
    ["client/src/worlds/enchanted-grove/presentation.ts", "shop_enchanted_grove_v2.png", "#7fffd4"],
  ] as const;

  for (const [path, asset, accent] of modules) {
    const source = read(path);
    assert.ok(source.includes(asset), path);
    assert.ok(source.includes(accent), path);
  }

  assert.doesNotMatch(
    registry,
    /shop_frostpeak\.png|shop_sky_realm\.png|shop_island\.png|shop_desert\.png|shop_enchanted_grove_v2\.png/,
  );
  assert.doesNotMatch(worldPage, /const WORLD_PRESENTATION/);
  assert.doesNotMatch(worldPage, /shop_frostpeak\.png|shop_sky_realm\.png|shop_swamp\.png/);
});

test("all registered worlds plug dedicated presentation modules into the client registry", () => {
  const source = read("client/src/worlds/registry.ts");

  for (const [worldKey, presentationName] of [
    ["frostpeak", "FROSTPEAK_PRESENTATION"],
    ["skyRealm", "SKY_REALM_PRESENTATION"],
    ["lostIsland", "LOST_ISLAND_PRESENTATION"],
    ["scorchedDesert", "SCORCHED_DESERT_PRESENTATION"],
    ["enchantedGrove", "ENCHANTED_GROVE_PRESENTATION"],
    ["hauntedWoods", "HAUNTED_WOODS_PRESENTATION"],
  ] as const) {
    assert.match(
      source,
      new RegExp(`\\[WORLD_IDS\\.${worldKey}\\]: \\{[\\s\\S]*?presentation: ${presentationName}`),
    );
  }

  assert.match(
    source,
    /\[WORLD_IDS\.volcanic\]: \{[\s\S]*?presentation: VOLCANIC_PRESENTATION,[\s\S]*?resolveDestination: getVolcanicLocationDestination/,
  );
  assert.match(
    source,
    /\[WORLD_IDS\.elysianBayou\]: \{[\s\S]*?presentation: ELYSIAN_BAYOU_PRESENTATION,[\s\S]*?resolveDestination: getElysianBayouLocationDestination/,
  );

  assert.doesNotMatch(
    source,
    /shopFrostpeak|shopSkyRealm|shopIsland|shopDesert|shopEnchantedGrove|shopSwamp/,
  );
  assert.doesNotMatch(source, /const presentation =/);
});

test("WorldPage consumes the client world module generically", () => {
  const source = read("client/src/pages/WorldPage.tsx");

  assert.match(
    source,
    /import \{ getClientWorldModule, resolveClientWorldDestination \} from "@\/worlds\/registry"/,
  );
  assert.match(source, /const clientWorldModule = getClientWorldModule\(worldId\)/);
  assert.match(source, /const staticPresentation = clientWorldModule\?\.presentation/);
  assert.match(
    source,
    /const worldDestination = resolveClientWorldDestination\(worldId, loc\.id\)/,
  );

  assert.doesNotMatch(source, /getVolcanicLocationDestination/);
  assert.doesNotMatch(source, /HAUNTED_WOODS_PRESENTATION/);
  assert.doesNotMatch(source, /VOLCANIC_PRESENTATION/);
});

test("registry destination resolver safely falls through for worlds without custom destinations", () => {
  const source = read("client/src/worlds/registry.ts");

  assert.match(
    source,
    /return getClientWorldModule\(worldId\)\?\.resolveDestination\?\.\(locationId\)/,
  );
});
