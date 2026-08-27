import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const section = readFileSync("client/src/components/PetCostumeEquipmentSection.tsx", "utf8");
const accessoryPage = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const routes = readFileSync("server/routes/costumePlayer.routes.ts", "utf8");
const boot = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");

test("Costumes appear beneath accessories on the existing equipment page", () => {
  assert.match(accessoryPage, /import PetCostumeEquipmentSection/);
  const accessories = accessoryPage.indexOf("YOUR ACCESSORIES");
  const costumes = accessoryPage.indexOf("<PetCostumeEquipmentSection");
  assert.ok(accessories >= 0 && costumes > accessories);
  assert.match(section, /data-testid="section-costume-equipment"/);
  assert.match(section, /COSTUMES/);
  assert.match(section, /YOUR COSTUMES — TAP TO EQUIP/);
  assert.match(section, /Array\.from\(\{ length: COSTUME_SLOT_COUNT \}/);
});

test("Player costume controls use the shared slot count and unlock prices", () => {
  assert.match(section, /getUnlockedCostumeSlotCount/);
  assert.match(section, /getCostumeSlotUnlockCost/);
  assert.match(section, /\/api\/pet\/\$\{petInventoryId\}\/costumes\/equip/);
  assert.match(section, /\/api\/pet\/\$\{petInventoryId\}\/costumes\/unequip/);
  assert.match(section, /\/api\/pet\/\$\{petInventoryId\}\/costumes\/unlock/);
  assert.match(section, /item\.type === "costume"/);
});

test("Costume APIs validate pet ownership, item ownership, slots, and fitted definitions", () => {
  assert.match(routes, /requireAuthenticated/);
  assert.match(routes, /pet\.userId !== userId/);
  assert.match(routes, /costumeInventory\.userId !== user\.id/);
  assert.match(routes, /costumeItem\.type !== "costume"/);
  assert.match(routes, /slot < 1 \|\| slot > COSTUME_SLOT_COUNT/);
  assert.match(routes, /This costume has not been fitted for this pet yet/);
  assert.match(routes, /getUnlockedCostumeSlotCount/);
  assert.match(routes, /\.for\("update"\)/);
});

test("Production boot creates both player costume persistence tables safely", () => {
  assert.match(boot, /CREATE TABLE IF NOT EXISTS pet_costume_slot_unlocks/);
  assert.match(boot, /extra_slots INTEGER NOT NULL DEFAULT 0 CHECK\(extra_slots BETWEEN 0 AND 2\)/);
  assert.match(boot, /CREATE TABLE IF NOT EXISTS pet_equipped_costumes/);
  assert.match(boot, /costume_inventory_id VARCHAR NOT NULL UNIQUE/);
  assert.match(boot, /UNIQUE\(pet_inventory_id, slot\)/);
});
