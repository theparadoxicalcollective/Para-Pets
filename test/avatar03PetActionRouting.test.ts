import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { petActionReturnPath, petInventoryActionHref } from "../client/src/lib/petActionRoutes";
import { getPetPowerUpItems, remainingPetPowerUpSlots } from "../client/src/lib/petPowerUpInventory";
import { shouldHideFloatingNav } from "../client/src/lib/playerPagePresentation";
import { usesDeviceGameplaySurface } from "../client/src/lib/stage";
import type { PowerUpItem } from "../client/src/components/powerup/PowerUpModalTypes";

const item = (overrides: Partial<PowerUpItem> = {}): PowerUpItem => ({
  inventoryId: "item-1", shopItemId: "shop-a",
  name: "Moss Elixir", type: "power_up", imageUrl: null,
  statBoostType: "atk", statBoostAmount: 50,
  specialType: null, specialAmount: null, quantity: 2,
  ...overrides,
});

test("every inventory pet-action link retains the pet ID and a safe return-to-inventory marker", () => {
  const id = "pet-inventory-123";
  assert.equal(petInventoryActionHref("care", id), "/pet-care/pet-inventory-123?from=pets");
  assert.equal(petInventoryActionHref("levelUp", id), "/pet-level-up/pet-inventory-123?from=pets");
  assert.equal(petInventoryActionHref("powerUp", id), "/pet-power-up/pet-inventory-123?from=pets");
  assert.equal(petInventoryActionHref("closet", id), "/equip-accessories/pet-inventory-123?from=pets");
  assert.equal(petInventoryActionHref("powerUp", "abc/def"), "/pet-power-up/abc%2Fdef?from=pets");
  assert.throws(() => petInventoryActionHref("care", " "));
});

test("return routing is allowlisted, preserving existing Home and Pet House entry points", () => {
  assert.equal(petActionReturnPath("?from=pets"), "/pets");
  assert.equal(petActionReturnPath("?from=anything"), "/");
  assert.equal(petActionReturnPath("?from=https%3A%2F%2Fevil.example"), "/");
  assert.equal(petActionReturnPath("?from=%2Fadmin", "/pet-house"), "/pet-house");
  assert.equal(petActionReturnPath("", "/pet-house"), "/pet-house");
  assert.equal(petActionReturnPath("?from=pets", "/pet-house"), "/pets");
});

test("Power Up preserves Home's shop-stack grouping, item types, and real row consume target", () => {
  const records = [
    item(),
    item({ inventoryId: "item-2", quantity: 4 }),
    item({ inventoryId: "level-up", shopItemId: "shop-b", statBoostType: "lvl" }),
    item({ inventoryId: "special-node", shopItemId: "shop-c", type: "special",
      specialType: "fill_evolution_node", specialAmount: 1, quantity: 3 }),
    item({ inventoryId: "special-level", shopItemId: "shop-d", type: "special",
      specialType: "level", quantity: 1 }),
    item({ inventoryId: "hatch-potion", shopItemId: "shop-e", type: "special",
      specialType: "hatch_time" }),
  ];
  const result = getPetPowerUpItems(records);
  assert.deepEqual(result.powerUpItems.map(i => [i.inventoryId, i.quantity]), [["item-1", 6]]);
  assert.deepEqual(result.specialItems.map(i => [i.inventoryId, i.quantity]), [["special-node", 3]]);
  // Do not mutate query-cache inventory records when grouping repeated rows.
  assert.equal(records[0].quantity, 2);
  assert.equal(records[1].quantity, 4);
});

test("Power Up capacity matches existing rarity and level formula, clamped to zero", () => {
  assert.equal(remainingPetPowerUpSlots(1, 1, 0), 1);
  assert.equal(remainingPetPowerUpSlots(2, 3, 2), 1);
  assert.equal(remainingPetPowerUpSlots(3, 4, 3), 5);
  assert.equal(remainingPetPowerUpSlots(5, 4, 10), 2);
  assert.equal(remainingPetPowerUpSlots(5, 1, 100), 0);
});

test("Power Up route is stage-owned, native-device, and hides the global navigation", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const power = readFileSync("client/src/pages/PetPowerUpRoute.tsx", "utf8");
  assert.equal(usesDeviceGameplaySurface("/pet-power-up/pet-inventory-123"), true);
  assert.equal(shouldHideFloatingNav("/pet-power-up/pet-inventory-123"), true);
  assert.match(app, /location\.startsWith\("\/pet-power-up\/"\)[\s\S]{0,130}<StagePageSurface key=\{location\} layout="viewport">/);
  assert.match(power, /<PetPowerUpPage/);
  assert.match(power, /\/api\/pet\/\$\{inventoryId\}\/power-up/); // target-specific server endpoint
  assert.match(power, /getPetPowerUpItems\(inventoryQuery\.data \?\? \[\]\)/);
  assert.match(power, /item\.inventoryId/);
  assert.doesNotMatch(power, /activePetId|activePetForModal|currentUser\.activePetId/);
});

test("Home's existing modal and inventory egg hatch flow remain available during migration", () => {
  const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
  const inventory = readFileSync("client/src/components/PetInventory.tsx", "utf8");
  const care = readFileSync("client/src/pages/PetCarePage.tsx", "utf8");
  const level = readFileSync("client/src/pages/PetLevelUpRoute.tsx", "utf8");
  assert.match(home, /activePetModal === "power_up" && activePetForModal/);
  assert.match(home, /getPetPowerUpItems\(inventory\)/);
  assert.match(inventory, /hatchCheckMutation\.mutate\(pet\.inventoryId\)/);
  assert.match(inventory, /onEggSpeedUp\?\.\(pet\.inventoryId\)/);
  assert.match(inventory, /\/api\/pet\/\$\{petInvId\}\/use-special/);
  assert.match(care, /petActionReturnPath\(window\.location\.search\)/);
  assert.match(level, /petActionReturnPath\(window\.location\.search\)/);
});
