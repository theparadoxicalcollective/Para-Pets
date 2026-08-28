import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync("server/routes/marketplace.routes.ts", "utf8");
const service = readFileSync("server/marketplace/transactions.ts", "utf8");
const client = readFileSync("client/src/pages/MarketPage.tsx", "utf8");

test("each public marketplace mutation is registered exactly once", () => {
  for (const route of [
    'app.post("/api/market/list"',
    'app.post("/api/market/list-pet"',
    'app.post("/api/market/list-fish"',
    'app.post("/api/market/:listingId/buy"',
    'app.post("/api/market/:listingId/collect"',
    'app.delete("/api/market/:listingId"',
  ]) assert.equal(routes.split(route).length - 1, 1, route);
});

test("value-moving routes delegate authenticated identity to focused services", () => {
  for (const call of ["createInventoryListing({ actorId: user.id", "createFishListing({ actorId: user.id", "buyListing({ actorId: user.id", "collectProceeds({ actorId: user.id", "cancelListing({ actorId: user.id"]) {
    assert.match(routes, new RegExp(call.replace(/[({.]/g, "\\$&")));
  }
  assert.doesNotMatch(routes.slice(routes.indexOf('app.post("/api/market/list"'), routes.indexOf('app.post("/api/market/buy-slot"')), /atomicDeductCoins|addCoins|buyMarketListing|createMarketListing|cancelMarketListing|collectMarketCoins/);
});

test("transactions lock authoritative rows and keep all core writes in one boundary", () => {
  assert.equal(service.split("db.transaction(async (tx)").length - 1, 5);
  assert.match(service, /from\(playerMarketListings\)[\s\S]*?for\("update"\)/);
  assert.match(service, /FROM users WHERE id = \$\{userId\} FOR UPDATE/);
  assert.match(service, /from\(playerFishInventory\)[\s\S]*?for\("update"\)/);
  assert.match(service, /from\(userInventory\)[\s\S]*?for\("update"\)/);
  assert.match(service, /listing\.status === "sold" && listing\.buyerId === input\.actorId/);
  assert.match(service, /gte\(users\.coins, listing\.price\)/);
});

test("browser callers submit identifiers and player-selected list price only", () => {
  assert.match(client, /\/api\/market\/list", \{ inventoryId, price \}/);
  assert.match(client, /\/api\/market\/list-pet", \{ inventoryId, price \}/);
  assert.match(client, /\/api\/market\/list-fish", \{ fishInventoryId, price \}/);
  assert.doesNotMatch(client, /revert-to-egg/);
  assert.doesNotMatch(client, /\/api\/market[^\n]*(sellerId|buyerId|ownerId|coinsEarned|newBalance)/);
});

test("pet market escrow owns the complete revert and hatch lifecycle", () => {
  assert.match(service, /preparePetEgg\?: boolean/);
  assert.match(service, /tx\.delete\(petEquippedAccessories\)[\s\S]*?petInventoryId, inventory\.id/);
  assert.match(service, /isListed: true, isHatched: false, hatchStartedAt: null/);
  assert.match(service, /hatchStartedAt: isPetEgg \? new Date\(\) : escrow\.hatchStartedAt/);
  assert.doesNotMatch(service, /Date\.now\(\) -/);
  assert.match(routes, /createInventoryListing\(\{[\s\S]*?preparePetEgg: true/);
});
