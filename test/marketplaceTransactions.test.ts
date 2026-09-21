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

test("buyers validate escrow before coin debit and stale listings self-clean", () => {
  const buyStart = service.indexOf("export async function buyListing");
  const cancelStart = service.indexOf("export async function cancelListing");
  const buy = service.slice(buyStart, cancelStart);
  assert.ok(buy.indexOf("from(userInventory)") < buy.indexOf("gte(users.coins, listing.price)"));
  assert.match(buy, /!escrow \|\| escrow\.userId !== listing\.sellerId \|\| !escrow\.isListed[\s\S]*?tx\.delete\(playerMarketListings\)/);
  assert.match(buy, /if \(result\.stale\) throw new MarketplaceError\("not_active"/);
  const cancel = service.slice(cancelStart, service.indexOf("export async function collectProceeds"));
  assert.match(cancel, /!escrow \|\| escrow\.userId !== input\.actorId \|\| !escrow\.isListed[\s\S]*?tx\.delete\(playerMarketListings\)/);
});

test("market browse hides listings whose escrow inventory disappeared", () => {
  assert.match(routes, /async function liveEscrowListings/);
  assert.match(routes, /inventory && inventory\.userId === listing\.sellerId && inventory\.isListed/);
  assert.match(routes, /const listings = await liveEscrowListings\([\s\S]*?await storage\.getMarketListings/);
});

test("browser callers submit identifiers and player-selected list price only", () => {
  assert.match(client, /\/api\/market\/list", \{ inventoryId, price \}/);
  assert.match(client, /\/api\/market\/list-pet", \{ inventoryId, price \}/);
  assert.match(client, /\/api\/market\/list-fish", \{ fishInventoryId, price \}/);
  assert.doesNotMatch(client, /revert-to-egg/);
  assert.doesNotMatch(client, /\/api\/market[^\n]*(sellerId|buyerId|ownerId|coinsEarned|newBalance)/);
});

test("seller market discovers sold listings and handles collect proceeds response", () => {
  assert.match(client, /queryKey: \["\/api\/market\/my-listings"\][\s\S]*?staleTime: 0[\s\S]*?refetchInterval: activeTab === "myshop" \? 5000 : false/);
  assert.match(client, /refetchOnWindowFocus: true/);
  assert.match(client, /refetchOnReconnect: true/);

  const collectStart = client.indexOf("const collectMutation = useMutation");
  const cancelStart = client.indexOf("const cancelMutation", collectStart);
  const collect = client.slice(collectStart, cancelStart);
  assert.match(collect, /const response = await apiRequest\("POST", `\/api\/market\/\$\{listingId\}\/collect`, \{\}\)/);
  assert.match(collect, /return await response\.json\(\) as \{ coinsEarned: number; newBalance: number \}/);
  assert.match(collect, /coins: data\.newBalance/);
  assert.match(collect, /queryClient\.setQueryData\(\["\/api\/auth\/me"\], updatedUser\)/);
  assert.doesNotMatch(collect, /fetch\("\/api\/auth\/me"\)/);
});

test("collect proceeds credits the seller before removing the sold listing", () => {
  const collectStart = service.indexOf("export async function collectProceeds");
  const collect = service.slice(collectStart);
  assert.match(collect, /coins: sql`\$\{users\.coins\} \+ \$\{listing\.price\}`/);
  assert.match(collect, /totalCoinsEarned: sql`\$\{users\.totalCoinsEarned\} \+ \$\{listing\.price\}`/);
  assert.ok(collect.indexOf("tx.update(users)") < collect.indexOf("tx.delete(playerMarketListings)"));
  assert.match(collect, /return \{ coinsEarned: listing\.price, newBalance: credited\.coins \}/);
});

test("pet market preserves hatched state and uses state-appropriate listing art", () => {
  assert.match(service, /const listingPet = item\.type === "pet" && !!input\.preparePetEgg/);
  assert.match(service, /tx\.delete\(petEquippedAccessories\)[\s\S]*?petInventoryId, inventory\.id/);
  assert.match(service, /tx\.update\(userInventory\)\.set\(\{ isListed: true \}\)/);
  assert.doesNotMatch(service, /isListed: true, isHatched: false, hatchStartedAt: null/);
  assert.match(service, /inventory\.isHatched[\s\S]*?item\.hatchedImageUrl[\s\S]*?item\.eggImageUrl/);
  assert.match(service, /const isUnhatchedPet = listing\.itemType === "pet_egg" && !escrow\.isHatched/);
  assert.match(service, /hatchStartedAt: isUnhatchedPet \? new Date\(\) : escrow\.hatchStartedAt/);
  assert.match(service, /isHatched: escrow\.isHatched/);
  assert.doesNotMatch(service, /petLevel:\s*(?:0|1|null)|petHealth:\s*(?:0|null)|petAtk:\s*(?:0|null)|petDef:\s*(?:0|null)/);
  assert.match(routes, /createInventoryListing\(\{[\s\S]*?preparePetEgg: true/);
});

test("unhatched market eggs keep the existing hatch-start behavior", () => {
  const matches = service.match(/const isUnhatchedPet = listing\.itemType === "pet_egg" && !escrow\.isHatched/g) ?? [];
  assert.equal(matches.length, 2, "buy and cancel paths should both distinguish true eggs from hatched pets");
  assert.match(service, /hatchStartedAt: isUnhatchedPet \? new Date\(\) : escrow\.hatchStartedAt/);
});