import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  VOLCANIC_LOCATION_IDS,
  VOLCANIC_WORLD_ID,
} from "../shared/worlds/volcanic";
import {
  WORLD_DEFINITIONS,
  WORLD_IDS,
} from "../shared/worlds/worldRegistry";

const read = (path: string) => readFileSync(path, "utf8");

test("Volcanic shared module owns the stable world and location ids", () => {
  assert.equal(VOLCANIC_WORLD_ID, "volcanic");
  assert.deepEqual(VOLCANIC_LOCATION_IDS, {
    moltenBastion: "c3d4e5f6-0005-4000-8000-000000000005",
    emberKitchen: "c3d4e5f6-0007-4000-8000-000000000007",
    lavaCrawl: "c3d4e5f6-0009-4000-8000-000000000009",
  });
});

test("Volcanic client presentation is owned by its world module", () => {
  const presentation = read("client/src/worlds/volcanic/presentation.ts");
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(presentation, /shop_volcanic\.png/);
  assert.match(presentation, /worldId: VOLCANIC_WORLD_ID/);
  assert.match(presentation, /accent: "#ff4500"/);
  assert.match(
    presentation,
    /linear-gradient\(180deg, rgba\(40,10,5,0\.7\) 0%, rgba\(80,20,10,0\.3\) 50%, rgba\(20,5,2,0\.7\) 100%\)/,
  );

  const clientRegistry = read("client/src/worlds/registry.ts");
  assert.match(
    clientRegistry,
    /import \{ VOLCANIC_PRESENTATION \} from "@\/worlds\/volcanic\/presentation"/,
  );
  assert.match(
    clientRegistry,
    /\[WORLD_IDS\.volcanic\]: \{[\s\S]*?presentation: VOLCANIC_PRESENTATION/,
  );
  assert.doesNotMatch(worldPage, /VOLCANIC_PRESENTATION/);
  assert.doesNotMatch(worldPage, /import shopVolcanic/);
});

test("Volcanic destination configuration preserves mini-game routes and Ember Kitchen notice", () => {
  const destinations = read("client/src/worlds/volcanic/destinations.ts");

  assert.match(
    destinations,
    /\[VOLCANIC_LOCATION_IDS\.moltenBastion\][\s\S]*?route: "\/games\/molten-blocks"/,
  );
  assert.match(
    destinations,
    /\[VOLCANIC_LOCATION_IDS\.lavaCrawl\][\s\S]*?route: "\/games\/lava-crawl"/,
  );
  assert.match(
    destinations,
    /\[VOLCANIC_LOCATION_IDS\.emberKitchen\][\s\S]*?title: "Coming soon!"[\s\S]*?description: "The cooking mini-game is being prepared\."/,
  );
});

test("WorldPage delegates Volcanic destinations instead of hardcoding their ids", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  const clientRegistry = read("client/src/worlds/registry.ts");
  assert.match(
    clientRegistry,
    /resolveDestination: getVolcanicLocationDestination/,
  );
  assert.match(
    worldPage,
    /resolveWorldLocationInteraction\([\s\S]*?resolveClientWorldDestination\(worldId, loc\.id\)/,
  );
  assert.match(
    worldPage,
    /case "route":[\s\S]*?navigate\(interaction\.route\)/,
  );
  assert.match(
    worldPage,
    /case "notice":[\s\S]*?title: interaction\.title[\s\S]*?description: interaction\.description/,
  );

  for (const id of Object.values(VOLCANIC_LOCATION_IDS)) {
    assert.equal(worldPage.includes(id), false, id);
  }
});

test("Volcanic hint rules use the world module ids and remain independent of fish selling", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");

  assert.match(
    worldPage,
    /worldId === VOLCANIC_WORLD_ID && new URLSearchParams\(window\.location\.search\)\.get\("moltenHint"\) === "1"/,
  );
  assert.match(
    worldPage,
    /showMoltenHint && worldId === VOLCANIC_WORLD_ID/,
  );
  assert.match(
    worldPage,
    /locations\.find\(l => l\.id === VOLCANIC_LOCATION_IDS\.moltenBastion\)/,
  );
  assert.doesNotMatch(worldPage, /fishBarrel|fish-barrel|barrelHint/);
});

test("Volcanic gameplay remains owned by independent mini-game feature modules", () => {
  const lavaRoutes = read("server/routes/lavaCrawl.routes.ts");
  const moltenRoutes = read("server/routes/moltenBlocks.routes.ts");
  const presentation = read("client/src/worlds/volcanic/presentation.ts");
  const destinations = read("client/src/worlds/volcanic/destinations.ts");

  assert.match(lavaRoutes, /app\.post\("\/api\/lava-crawl\/complete"/);
  assert.match(moltenRoutes, /app\.post\("\/api\/games\/molten-blocks\/reward"/);
  assert.doesNotMatch(presentation, /LavaCrawlPage|MoltenBlocksPage/);
  assert.doesNotMatch(destinations, /score|reward|leaderboard|EXP_PER_KILL|MB_DAILY_CAP/);
});

test("Volcanic access and authored map height remain unchanged", () => {
  const definition = WORLD_DEFINITIONS[WORLD_IDS.volcanic];
  assert.equal(definition.access, "public");
  assert.equal(definition.fixedMapHeight, 1440);
  assert.equal(definition.moduleKey, "volcanic");
});
