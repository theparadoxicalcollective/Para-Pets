import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const market = readFileSync("client/src/pages/MarketPage.tsx", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");
const essentialBoot = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");

test("player inventory hides escrowed pets and globally equipped accessories", () => {
  assert.match(inventory, /queryKey: \["\/api\/user\/equipped-accessory-ids"\]/);
  assert.match(inventory, /item\.type === "pet" && !item\.isListed/);
  assert.match(inventory, /!item\.isListed[\s\S]*?item\.type !== "pet"[\s\S]*?equippedAccessoryIdSet\.has\(item\.inventoryId\)/);
});

test("Closet prevents cross-pet accessory reuse and accepts normalized item types", () => {
  assert.match(routes, /petEquippedAccessories\.accessoryInventoryId, accessoryInventoryId/);
  assert.match(routes, /That accessory is already equipped to a pet/);
  assert.match(routes, /accShopItem\.type\?\.trim\(\)\.toLowerCase\(\) !== "accessory"/);
});

test("accessories are enforced as individual physical inventory copies", () => {
  assert.match(essentialBoot, /CREATE OR REPLACE FUNCTION enforce_individual_accessory_inventory_rows/);
  assert.match(essentialBoot, /BEFORE INSERT ON user_inventory/);
  assert.match(essentialBoot, /BEFORE UPDATE OF quantity, is_listed, user_id ON user_inventory/);
  assert.match(essentialBoot, /item_type IS DISTINCT FROM 'accessory'/);
  assert.match(essentialBoot, /extra_count := COALESCE\(NEW\.quantity, 1\) - COALESCE\(OLD\.quantity, 1\)/);
});

test("legacy accessory stacks preserve the equipped row and expose remaining copies", () => {
  assert.match(essentialBoot, /si\.type = 'accessory'/);
  assert.match(essentialBoot, /ui\.is_listed = false/);
  assert.match(essentialBoot, /COALESCE\(ui\.quantity, 1\) > 1/);
  assert.match(essentialBoot, /CROSS JOIN LATERAL generate_series\(2, s\.quantity\)/);
  assert.match(essentialBoot, /UPDATE user_inventory ui[\s\S]*?SET quantity = 1[\s\S]*?WHERE ui\.id = s\.id/);
});

test("pet inventory cards no longer open the removed detail popup", () => {
  assert.doesNotMatch(inventory, /PetDetailPage/);
  assert.doesNotMatch(inventory, /selectedPetId|onPetClick/);
});

test("market pet listing uses one atomic request", () => {
  assert.match(market, /apiRequest\("POST", "\/api\/market\/list-pet", \{ inventoryId, price \}\)/);
  assert.doesNotMatch(market, /revert-to-egg/);
});

test("market artwork fields retain the requested card alignment", () => {
  assert.match(market, /data-market-card-field="pet-rarity"[\s\S]*?top: "10%", left: "29%", right: "13%"/);
  assert.match(market, /data-market-card-field="pet-name"[\s\S]*?top: "65%"/);
  assert.match(market, /data-market-card-field="item-image"[\s\S]*?top: "13%"/);
  assert.match(market, /data-market-card-field="item-name"[\s\S]*?top: "54\.5%"/);
  assert.match(market, /data-market-card-field="item-display"[\s\S]*?top: "68%"/);
  assert.match(market, /data-market-card-field="price"[\s\S]*?bottom: "12\.5%"/);
  assert.match(market, /data-testid="market-search-frame"[\s\S]*?height: 64[\s\S]*?center\/100% auto no-repeat/);
});
