import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
const market = readFileSync("client/src/pages/MarketPage.tsx", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");

test("player inventory hides escrowed pets and globally equipped accessories", () => {
  assert.match(inventory, /queryKey: \["\/api\/user\/equipped-accessory-ids"\]/);
  assert.match(inventory, /item\.type === "pet" && !item\.isListed/);
  assert.match(inventory, /!item\.isListed[\s\S]*?item\.type !== "pet"[\s\S]*?equippedAccessoryIdSet\.has\(item\.inventoryId\)/);
});

test("Closet returns unequipped inventory once and prevents cross-pet reuse", () => {
  assert.match(routes, /AND ui\.is_listed = false[\s\S]*?NOT EXISTS \([\s\S]*?accessory_inventory_id = ui\.id/);
  assert.match(routes, /petEquippedAccessories\.accessoryInventoryId, accessoryInventoryId/);
  assert.match(routes, /That accessory is already equipped to a pet/);
});

test("pet inventory cards no longer open the removed detail popup", () => {
  assert.doesNotMatch(inventory, /PetDetailPage/);
  assert.doesNotMatch(inventory, /selectedPetId|onPetClick/);
});

test("market pet listing uses one atomic request", () => {
  assert.match(market, /apiRequest\("POST", "\/api\/market\/list-pet", \{ inventoryId, price \}\)/);
  assert.doesNotMatch(market, /revert-to-egg/);
});

test("market artwork fields retain the corrected card alignment", () => {
  assert.match(market, /data-market-card-field="pet-rarity"[\s\S]*?top: "6%", left: "42%"/);
  assert.match(market, /data-market-card-field="pet-name"[\s\S]*?top: "61%"/);
  assert.match(market, /data-market-card-field="item-image"[\s\S]*?top: "16%"/);
  assert.match(market, /data-market-card-field="item-name"[\s\S]*?top: "58%"/);
  assert.match(market, /data-market-card-field="item-display"[\s\S]*?top: "72%"/);
  assert.match(market, /data-market-card-field="price"[\s\S]*?bottom: "15%"/);
  assert.match(market, /data-testid="market-search-frame"[\s\S]*?height: 64/);
});
