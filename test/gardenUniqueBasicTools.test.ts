import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { baseGardenToolKind } from "../shared/garden";
import { purchaseInventoryItem } from "../server/inventoryPurchase";

const read = (path: string) => readFileSync(path, "utf8");

test("only basic garden tools are limited to one per kind", () => {
  for (const kind of ["hoe", "scythe", "watering_pail"]) {
    assert.equal(baseGardenToolKind({ type: "garden_tool", specialType: kind }), kind);
  }
  for (const item of [
    { type: "garden_seed", specialType: "hoe" },
    { type: "garden_fruit", specialType: "scythe" },
    { type: "garden_tool", specialType: "flower_pot" },
    { type: "item", specialType: "watering_pail" },
    { type: "potion", specialType: null },
    { type: null, specialType: null },
  ]) assert.equal(baseGardenToolKind(item), null);
});

test("both world and Pet Park checkout enforce the limit on the same authenticated route", () => {
  const routes = read("server/routes.ts");
  const route = routes.slice(routes.indexOf('app.post("/api/shop/:worldId/buy/:itemId"'),
    routes.indexOf('registerPetHatchRoute', routes.indexOf('app.post("/api/shop/:worldId/buy/:itemId"')));
  assert.match(route, /const baseTool = baseGardenToolKind\(shopItem\)/);
  assert.match(route, /if \(baseTool && quantity !== 1\)/);
  assert.match(route, /return res\.status\(400\)\.json\(\{ message: "You can own only one of each gardening tool" \}\)/);
  assert.match(route, /purchaseInventoryItem\(/);
  assert.match(route, /if \(baseTool\) \{/);
  assert.match(route, /innerJoin\(shopItems, eq\(userInventory\.shopItemId, shopItems\.id\)\)/);
  assert.match(route, /eq\(shopItems\.specialType, baseTool\)/,
    "limit covers all catalog SKUs of the same tool");
  assert.match(route, /gt\(userInventory\.quantity, 0\)/,
    "marketplace-listed/escrowed copies are still owned");
  assert.match(route, /throw new GardenToolAlreadyOwnedError/);
  assert.match(route, /userId, shopItemId: itemId, quantity: 1/);
  assert.match(route, /gardenWaterLeft: 100/);
  assert.match(route, /if \(err instanceof GardenToolAlreadyOwnedError\)/);
  assert.match(route, /return res\.status\(409\)\.json\(\{ message: err\.message \}\)/);
  assert.doesNotMatch(route, /DELETE FROM user_inventory|UPDATE user_inventory SET quantity = 1/,
    "historical quantities must not be silently modified");
});

test("a rejected grant rolls back the wallet debit; completed requests grant just one tool", async () => {
  const state = { coins: 1000, rows: [] as Array<{ kind: string; shopItemId: string; quantity: number }> };
  const transact = async <T>(work: (tx: typeof state) => Promise<T>) => {
    const draft = { coins: state.coins, rows: state.rows.map(item => ({ ...item })) };
    const result = await work(draft);
    state.coins = draft.coins;
    state.rows = draft.rows;
    return result;
  };
  const buy = (kind: string, itemId: string) => purchaseInventoryItem({
    transaction: transact,
    deductCoins: async (tx, _userId, cost) => {
      if (tx.coins < cost) return undefined;
      tx.coins -= cost;
      return { coins: tx.coins };
    },
    grant: async (tx) => {
      if (tx.rows.some(row => row.kind === kind && row.quantity > 0))
        throw new Error("Already owned");
      const item = { kind, shopItemId: itemId, quantity: 1 };
      tx.rows.push(item);
      return item;
    },
  }, { userId: "player", unitPrice: 100, quantity: 1 });
  const first = await buy("hoe", "first-hoe");
  assert.equal(first.ok, true);
  assert.equal(state.coins, 900);
  await assert.rejects(buy("hoe", "different-admin-hoe"), /Already owned/);
  assert.equal(state.coins, 900, "duplicate checkout does not cost coins");
  assert.equal(state.rows.length, 1, "no duplicate physical inventory rows");
  assert.equal((await buy("scythe", "only-scythe")).ok, true,
    "different base tool kinds are still purchasable");
  assert.equal(state.rows.length, 2);
});

test("world shops and building shops mark already-owned tools and disable purchase controls", () => {
  const worldPage = read("client/src/pages/WorldPage.tsx");
  const worldShop = read("client/src/components/world/WorldShopOverlay.tsx");
  const park = read("client/src/components/PetParkShopShelf.tsx");
  const parkRoutes = read("server/routes/petParkPlayer.routes.ts");
  assert.match(worldPage, /ownedGardenToolKinds=\{ownedGardenToolKinds\}/);
  assert.match(worldShop, /baseGardenToolKind\(item\)/);
  assert.match(worldShop, /toolOwned \? "Owned"/);
  assert.match(worldShop, /disabled=\{!canAfford \|\| isPurchasePending \|\| toolOwned\}/);
  assert.match(parkRoutes, /specialType: shopItems\.specialType/);
  assert.match(park, /baseGardenToolKind\(selectedBuy\)/);
  assert.match(park, /data-testid="pet-park-garden-tool-owned"/);
  assert.match(park, /disabled=\{buy\.isPending \|\| selectedToolOwned/);
  assert.match(park, /selectedToolOwned \? "Owned"/);
  assert.match(park, /queryKey: \["\/api\/inventory"\]/);
});
