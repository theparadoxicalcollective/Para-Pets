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

test("existing presentation values moved from WorldPage into the client registry unchanged", () => {
  const registry = read("client/src/worlds/registry.ts");
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(registry, /shop_frostpeak\.png/);
  assert.match(registry, /shop_sky_realm\.png/);
  assert.match(registry, /shop_island\.png/);
  assert.match(registry, /shop_desert\.png/);
  assert.match(registry, /shop_enchanted_grove_v2\.png/);

  for (const accent of [
    "#88ccff",
    "#ffd700",
    "#20b2aa",
    "#daa520",
    "#7fffd4",
  ]) {
    assert.match(registry, new RegExp(accent));
  }

  assert.doesNotMatch(worldPage, /const WORLD_PRESENTATION/);
  assert.doesNotMatch(worldPage, /shop_frostpeak\.png|shop_sky_realm\.png|shop_swamp\.png/);
});

test("dedicated world modules plug into the same client registry", () => {
  const source = read("client/src/worlds/registry.ts");

  assert.match(
    source,
    /\[WORLD_IDS\.hauntedWoods\]: \{[\s\S]*?presentation: HAUNTED_WOODS_PRESENTATION/,
  );
  assert.match(
    source,
    /\[WORLD_IDS\.volcanic\]: \{[\s\S]*?presentation: VOLCANIC_PRESENTATION,[\s\S]*?resolveDestination: getVolcanicLocationDestination/,
  );
  assert.match(
    source,
    /\[WORLD_IDS\.elysianBayou\]: \{[\s\S]*?presentation: ELYSIAN_BAYOU_PRESENTATION,[\s\S]*?resolveDestination: getElysianBayouLocationDestination/,
  );
  assert.doesNotMatch(source, /shopSwamp/);
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
