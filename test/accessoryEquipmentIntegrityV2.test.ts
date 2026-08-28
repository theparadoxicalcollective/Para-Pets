import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const startup = readFileSync("server/startup/runStartup.ts", "utf8");
const repair = readFileSync("server/startup/migrations/repairAccessoryEquipmentIntegrity.ts", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");

test("accessory integrity repair runs before any inventory routes are registered", () => {
  assert.match(startup, /await runEssentialBoot\(\);[\s\S]*?await repairAccessoryEquipmentIntegrity\(\);[\s\S]*?await registerRoutes/);
});

test("accessories are structurally one physical inventory row per copy", () => {
  assert.match(repair, /lower\(btrim\(type\)\)[\s\S]*?'accessory'/);
  assert.match(repair, /NEW\.quantity := 1/);
  assert.match(repair, /generate_series\(1, extra_count\)/);
  assert.match(repair, /WHERE lower\(btrim\(si\.type\)\) = 'accessory'[\s\S]*?COALESCE\(ui\.quantity, 1\) > 1/);
  assert.match(repair, /SELECT s\.user_id, s\.shop_item_id, s\.acquired_at, false, 1/);
});

test("legacy duplicate equipment ids are remapped onto real spare copies", () => {
  assert.match(repair, /PARTITION BY pea\.accessory_inventory_id/);
  assert.match(repair, /NOT EXISTS \([\s\S]*?in_use\.accessory_inventory_id = ui\.id/);
  assert.match(repair, /SET accessory_inventory_id = spare_inventory_id/);
  assert.match(repair, /more equipped rows than owned copies/);
});

test("database prevents one accessory copy or pet slot from being equipped twice", () => {
  assert.match(repair, /CREATE UNIQUE INDEX IF NOT EXISTS pet_equipped_accessories_inventory_uidx[\s\S]*?accessory_inventory_id/);
  assert.match(repair, /CREATE UNIQUE INDEX IF NOT EXISTS pet_equipped_accessories_pet_slot_uidx[\s\S]*?pet_inventory_id, slot/);
  assert.match(repair, /FOREIGN KEY \(accessory_inventory_id\)[\s\S]*?REFERENCES user_inventory\(id\)[\s\S]*?ON DELETE CASCADE/);
});

test("current accessory API still rejects cross-pet reuse and global bag filtering reads equipment ids", () => {
  assert.match(routes, /WHERE ui\.user_id = \$\{user\.id\}[\s\S]*?equipped-accessory-ids/);
  assert.match(routes, /petEquippedAccessories\.accessoryInventoryId, accessoryInventoryId/);
  assert.match(routes, /That accessory is already equipped to a pet/);
});
