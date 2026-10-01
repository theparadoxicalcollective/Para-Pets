import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Sell Fish quest guidance points to Janson instead of a world barrel", () => {
  const nav = read("client/src/components/FloatingNav.tsx");
  const janson = read("client/src/components/JansonQuestOverlay.tsx");

  assert.match(
    nav,
    /quest\.quest_key === "sell_fish"\s+\? "\/world\/swamp\?jansonHint=1"/,
  );
  assert.doesNotMatch(nav, /barrelHint/);

  assert.match(janson, /new URLSearchParams\(window\.location\.search\)\.get\("jansonHint"\) === "1"/);
  assert.match(janson, /data-testid="janson-sell-fish-hint"/);
  assert.match(janson, />Sell Fish Here <span aria-hidden="true">↓<\/span><\/div>/);
  assert.match(janson, /window\.dispatchEvent\(new Event\("para:open-fish-market"\)\)/);
});

test("WorldPage no longer owns or renders a fish barrel entrance", () => {
  const world = read("client/src/pages/WorldPage.tsx");

  assert.doesNotMatch(world, /fish_barrel\.png/);
  assert.doesNotMatch(world, /fishBarrel/);
  assert.doesNotMatch(world, /fish-barrel/);
  assert.doesNotMatch(world, /barrelHint/);
  assert.doesNotMatch(world, /button-fish-barrel/);
  assert.doesNotMatch(world, /button-barrel-(?:shrink|grow|delete)/);

  assert.match(world, /window\.addEventListener\("para:open-fish-market", openFishMarket\)/);
  assert.match(world, /<SellFishPage/);
});

test("obsolete fish barrel HTTP and storage helpers stay removed", () => {
  const routes = read("server/routes/fishing.routes.ts");
  const storage = read("server/storage.ts");
  const schema = read("shared/schema.ts");

  assert.doesNotMatch(routes, /\/api\/world\/:worldId\/fish-barrel/);
  assert.doesNotMatch(routes, /\/api\/admin\/fish-barrel\/:id/);

  assert.doesNotMatch(storage, /getFishBarrelByWorld/);
  assert.doesNotMatch(storage, /createFishBarrel/);
  assert.doesNotMatch(storage, /updateFishBarrel/);
  assert.doesNotMatch(storage, /deleteFishBarrel/);
  assert.doesNotMatch(storage, /type FishBarrel, fishBarrels/);

  assert.match(schema, /Legacy table retained for migration compatibility/);
  assert.match(schema, /export const fishBarrels = pgTable\("fish_barrels"/);
});
