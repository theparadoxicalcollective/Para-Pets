import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routesSource = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
const clientSourceFiles = [
  "../client/src/pages/FishingPage.tsx",
  "../client/src/pages/AquariumPage.tsx",
  "../client/src/pages/SellFishPage.tsx",
  "../client/src/pages/MarketPage.tsx",
  "../client/src/components/FishingAdminPanel.tsx",
].map(path => readFileSync(new URL(path, import.meta.url), "utf8"));

test("unsafe fishing inventory add endpoint is no longer registered or called by clients", () => {
  assert.equal(routesSource.includes('app.post("/api/fishing/inventory/add"'), false);
  assert.equal(routesSource.includes("app.post('/api/fishing/inventory/add'"), false);
  assert.equal(routesSource.match(/\/api\/fishing\/inventory\/add/g)?.length ?? 0, 0);
  for (const source of clientSourceFiles) {
    assert.equal(source.includes("/api/fishing/inventory/add"), false);
  }
});

test("normal players have no equivalent public direct fish mint route", () => {
  assert.equal(routesSource.includes("const entry = await storage.addFishToPlayerInventory"), false);
  assert.equal(routesSource.includes("return res.status(201).json(entry)"), false);
  assert.equal(routesSource.includes("ownerId, shopItemId"), false);
});

test("trusted server fish grants remain available only to catch and market transfer flows", () => {
  const helperCalls = [...routesSource.matchAll(/storage\.addFishToPlayerInventory\(([^)]*)\)/g)]
    .map(match => match[1].replace(/\s+/g, " ").trim());

  assert.deepEqual(helperCalls, [
    "user.id, invItem.shopItemId",
    "user.id, invItem.shopItemId",
    "user.id, chosenEntry.shopItemId",
  ]);
});
