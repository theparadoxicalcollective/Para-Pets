import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lonelle = readFileSync("client/src/components/LonelleQuestOverlay.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const costume = readFileSync("client/src/components/PetCostumeEquipmentSection.tsx", "utf8");

test("Lonelle guides players through the independent Pet Menu instead of tapping their pet", () => {
  assert.match(lonelle, /actionMenuOpen \? '\[data-testid="button-action-equip-accessories"\]' : '\[data-testid="button-open-pet-menu"\]'/);
  assert.match(lonelle, /"Open the Pet Menu"/);
  assert.match(lonelle, /focus = "control"/);
  assert.doesNotMatch(lonelle, /"Tap your pet"/);
  assert.match(home, /data-testid="button-open-pet-menu"/);
  assert.match(home, /data-testid="button-action-equip-accessories"/);
});

test("Lonelle still guides scarf equip through the third adornment slot", () => {
  assert.match(lonelle, /data-testid="slot-costume-3"/);
  assert.match(lonelle, /data-testid="bag-costume-\$\{state\.scarfInventoryId\}"/);
  assert.match(lonelle, /state\.scarfEquipped/);
  assert.match(lonelle, /data-testid="button-close-equip-accessories"/);
});

test("Lonelle guides both supported Closet routes to real adornment controls, not accessory slots", () => {
  assert.match(app, /location\.startsWith\("\/equip-accessories\/"\)/);
  assert.match(lonelle, /pathname === "\/equip-accessories" \|\| pathname\.startsWith\("\/equip-accessories\/"\)/);
  assert.match(lonelle, /state\.status === "taken" && inCloset/);
  assert.match(costume, /data-testid={`slot-costume-\$\{slot\}`}/);
  assert.match(costume, /data-testid={`bag-costume-\$\{item\.inventoryId\}`}/);
  assert.match(costume, /data-testid="adornment-inventory-picker"/);
  assert.match(lonelle, /button-confirm-unequip-adornment/);
  assert.doesNotMatch(lonelle, /slot-accessory-3|bag-accessory-/);
});
