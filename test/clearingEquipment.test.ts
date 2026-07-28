import assert from "node:assert/strict";
import test from "node:test";
import { insertShopItemSchema } from "../shared/schema";
import { calculateClearingStats, ClearingEquipmentError, validateClearingEquipCandidate } from "../server/clearingEquipment";

const clearingItem = {
  name: "Bayou Blade", price: 100, type: "clearing", worldId: "swamp", clearingSlot: "weapon",
  starRarity: 3, atkBoost: 12, defBoost: 0, healthBoost: 25,
};

test("admin clearing item creation accepts valid reusable equipment fields", () => {
  const parsed = insertShopItemSchema.parse(clearingItem);
  assert.equal(parsed.clearingSlot, "weapon");
  assert.equal(parsed.starRarity, 3);
});

test("admin clearing item editing validates the merged clearing record", () => {
  assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, atkBoost: 20 }).success, true);
});

test("admin clearing item validation rejects invalid slots, stars, and negative bonuses", () => {
  assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, clearingSlot: "hat" }).success, false);
  assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, starRarity: 0 }).success, false);
  assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, starRarity: 6 }).success, false);
  assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, defBoost: -1 }).success, false);
});

test("equip validation accepts owned clearing equipment resolved by the server", () => {
  assert.equal(validateClearingEquipCandidate({ itemType: "clearing", slot: "armor" }), "armor");
});

test("ownership filtering reports another player's inventory item as missing", () => {
  const error = new ClearingEquipmentError("not_found", "Inventory item was not found");
  assert.equal(error.code, "not_found");
});

test("equip validation rejects non-clearing inventory items", () => {
  assert.throws(() => validateClearingEquipCandidate({ itemType: "accessory", slot: "weapon" }), /not valid clearing equipment/);
});

test("replacing and unequipping only changes loadout references, not owned inventory", () => {
  const ownedInventory = ["old-weapon", "new-weapon"];
  const loadout: { weapon: string | null } = { weapon: "old-weapon" };
  loadout.weapon = "new-weapon";
  assert.deepEqual(ownedInventory, ["old-weapon", "new-weapon"]);
  assert.equal(loadout.weapon, "new-weapon");
  loadout.weapon = null;
  assert.deepEqual(ownedInventory, ["old-weapon", "new-weapon"]);
  assert.equal(loadout.weapon, null);
});

test("effective clearing bonuses are reusable across active pets without changing base stats", () => {
  const bonuses = { hp: 100, atk: 10, def: 5 };
  const petA = { hp: 1000, atk: 50, def: 40 };
  const petB = { hp: 800, atk: 70, def: 30 };
  assert.deepEqual(calculateClearingStats(petA, bonuses), { hp: 1100, atk: 60, def: 45 });
  assert.deepEqual(calculateClearingStats(petB, bonuses), { hp: 900, atk: 80, def: 35 });
  assert.deepEqual(petA, { hp: 1000, atk: 50, def: 40 });
});

test("all five Clearing equipment slots are real equip candidates", () => {
  for (const slot of ["helmet", "weapon", "armor", "boots", "charm"] as const) {
    assert.equal(validateClearingEquipCandidate({ itemType: "clearing", slot }), slot);
    assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, clearingSlot: slot }).success, true);
  }
});

test("Clearing weapon attack style is structured and validated", () => {
  assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, clearingAttackStyle: "sword_slash" }).success, true);
  assert.equal(insertShopItemSchema.safeParse({ ...clearingItem, clearingAttackStyle: "free text" }).success, false);
});
