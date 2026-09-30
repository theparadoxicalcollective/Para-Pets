import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ELYSIAN_BAYOU_LOCATION_IDS,
  ELYSIAN_BAYOU_WORLD_ID,
} from "../shared/worlds/elysianBayou";
import {
  WORLD_DEFINITIONS,
  WORLD_IDS,
} from "../shared/worlds/worldRegistry";

const read = (path: string) => readFileSync(path, "utf8");

test("Elysian Bayou shared module owns the stable world and location ids", () => {
  assert.equal(ELYSIAN_BAYOU_WORLD_ID, "swamp");
  assert.deepEqual(ELYSIAN_BAYOU_LOCATION_IDS, {
    murkCave: "a1b2c3d4-0001-4000-8000-000000000001",
    bayousHeart: "8e211716-0448-496e-8582-6ce1025ac4e4",
    clearing: "a1b2c3d4-0011-4000-8000-000000000011",
  });
});

test("Elysian Bayou client presentation is owned by its world module", () => {
  const presentation = read("client/src/worlds/elysian-bayou/presentation.ts");
  const registry = read("client/src/worlds/registry.ts");

  assert.match(presentation, /shop_swamp\.png/);
  assert.match(presentation, /worldId: ELYSIAN_BAYOU_WORLD_ID/);
  assert.match(presentation, /accent: "#5cb87a"/);
  assert.match(
    presentation,
    /linear-gradient\(180deg, rgba\(20,15,35,0\.7\) 0%, rgba\(40,30,70,0\.3\) 50%, rgba\(10,8,18,0\.7\) 100%\)/,
  );

  assert.match(
    registry,
    /import \{ ELYSIAN_BAYOU_PRESENTATION \} from "@\/worlds\/elysian-bayou\/presentation"/,
  );
  assert.match(
    registry,
    /\[WORLD_IDS\.elysianBayou\]: \{[\s\S]*?presentation: ELYSIAN_BAYOU_PRESENTATION/,
  );
  assert.doesNotMatch(registry, /import shopSwamp/);
});

test("Elysian Clearing destination is registered through the Bayou module", () => {
  const destinations = read("client/src/worlds/elysian-bayou/destinations.ts");
  const registry = read("client/src/worlds/registry.ts");
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    destinations,
    /\[ELYSIAN_BAYOU_LOCATION_IDS\.clearing\][\s\S]*?route: "\/explore\/elysian-bayou-clearing"/,
  );
  assert.match(
    registry,
    /resolveDestination: getElysianBayouLocationDestination/,
  );
  assert.doesNotMatch(
    worldPage,
    /a1b2c3d4-0011-4000-8000-000000000011/,
  );
  assert.doesNotMatch(
    worldPage,
    /navigate\("\/explore\/elysian-bayou-clearing"\)/,
  );
});

test("WorldPage uses Bayou identifiers for Murk Cave and Bayou's Heart", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /ELYSIAN_BAYOU_LOCATION_IDS\.murkCave/,
  );
  assert.match(
    worldPage,
    /ELYSIAN_BAYOU_LOCATION_IDS\.bayousHeart/,
  );

  for (const id of [
    ELYSIAN_BAYOU_LOCATION_IDS.murkCave,
    ELYSIAN_BAYOU_LOCATION_IDS.bayousHeart,
    ELYSIAN_BAYOU_LOCATION_IDS.clearing,
  ]) {
    assert.equal(worldPage.includes(id), false, id);
  }

  assert.doesNotMatch(worldPage, /const MURK_CAVE_ID/);
  assert.doesNotMatch(worldPage, /const BAYOUS_HEART_ID/);
});

test("Bayou fishing and fish-market guidance keep the same world boundary", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /worldId === ELYSIAN_BAYOU_WORLD_ID && new URLSearchParams\(window\.location\.search\)\.get\("fishHint"\) === "1"/,
  );
  assert.match(
    worldPage,
    /if \(worldId !== ELYSIAN_BAYOU_WORLD_ID\) return;[\s\S]*?para:show-fishing-spots/,
  );
  assert.match(
    worldPage,
    /if \(worldId !== ELYSIAN_BAYOU_WORLD_ID\) return;[\s\S]*?para:open-fish-market/,
  );
  assert.match(
    worldPage,
    /worldId === ELYSIAN_BAYOU_WORLD_ID && new URLSearchParams\(window\.location\.search\)\.get\("barrelHint"\) === "1"/,
  );

  assert.doesNotMatch(worldPage, /worldId === "swamp"/);
  assert.doesNotMatch(worldPage, /worldId !== "swamp"/);
});

test("Murk Cave remains page-owned gameplay while its identity is world-owned", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");
  const destinations = read("client/src/worlds/elysian-bayou/destinations.ts");

  assert.match(
    worldPage,
    /battleLocationId === ELYSIAN_BAYOU_LOCATION_IDS\.murkCave/,
  );
  assert.match(worldPage, /<WorldCaveOverlay/);
  assert.match(worldPage, /apiRequest\("POST", "\/api\/cave\/complete-tier"/);
  assert.doesNotMatch(destinations, /caveTier|complete-tier|BattleArena|WorldCaveOverlay/);
});

test("Bayou quest systems remain independent from the world configuration module", () => {
  const presentation = read("client/src/worlds/elysian-bayou/presentation.ts");
  const destinations = read("client/src/worlds/elysian-bayou/destinations.ts");
  const worldIds = read("shared/worlds/elysianBayou.ts");

  for (const questSystem of [
    "GinnyQuestOverlay",
    "JansonQuestOverlay",
    "LonelleQuestOverlay",
    "ginnyQuest",
    "jansonQuest",
    "lonelleQuest",
  ]) {
    assert.doesNotMatch(presentation, new RegExp(questSystem));
    assert.doesNotMatch(destinations, new RegExp(questSystem));
    assert.doesNotMatch(worldIds, new RegExp(questSystem));
  }
});

test("Elysian Bayou access and authored map height remain unchanged", () => {
  const definition = WORLD_DEFINITIONS[WORLD_IDS.elysianBayou];
  assert.equal(definition.access, "public");
  assert.equal(definition.fixedMapHeight, 1621);
  assert.equal(definition.moduleKey, "elysian-bayou");
});
