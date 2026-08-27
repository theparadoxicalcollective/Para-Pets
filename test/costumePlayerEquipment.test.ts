import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const section = readFileSync("client/src/components/PetCostumeEquipmentSection.tsx", "utf8");
const accessoryPage = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const routes = readFileSync("server/routes/costumePlayer.routes.ts", "utf8");
const boot = readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
const schema = readFileSync("shared/costumeSchema.ts", "utf8");
const marketplace = readFileSync("server/marketplace/transactions.ts", "utf8");
const adminEditor = readFileSync("client/src/components/PetDatabasePanel.tsx", "utf8");

test("The Closet uses the supplied artwork and keeps accessory and costume controls together", () => {
  assert.match(accessoryPage, /ClosetBG\.png/);
  assert.match(accessoryPage, /ClosetCloseButton\.png/);
  assert.match(accessoryPage, /THE CLOSET/);
  assert.match(accessoryPage, /aria-label="Accessory slots"/);
  assert.match(accessoryPage, /data-testid="accessory-bag-drawer"/);
  assert.match(accessoryPage, /import PetCostumeEquipmentSection/);
  const accessories = accessoryPage.indexOf('aria-label="Accessory slots"');
  const costumes = accessoryPage.indexOf("<PetCostumeEquipmentSection");
  assert.ok(accessories >= 0 && costumes > accessories);
  assert.match(accessoryPage, /closetMode/);
  assert.match(section, /data-testid="section-costume-equipment"/);
  assert.match(section, /COSTUMES/);
  assert.match(section, /TAP AN EMPTY SLOT TO CHOOSE A COSTUME/);
  assert.match(section, /setSelectedSlot\(slot\)/);
  assert.match(section, /data-testid="costume-slot-inventory"/);
  assert.match(section, /slot: selectedSlot/);
  assert.doesNotMatch(section, /nextEmptySlot/);
  assert.match(section, /Array\.from\(\{ length: COSTUME_SLOT_COUNT \}/);
});

test("Player costume controls use the shared slot count and unlock prices", () => {
  assert.match(section, /getUnlockedCostumeSlotCount/);
  assert.match(section, /getCostumeSlotUnlockCost/);
  assert.match(section, /\/api\/pet\/\$\{petInventoryId\}\/costumes\/equip/);
  assert.match(section, /\/api\/pet\/\$\{petInventoryId\}\/costumes\/unequip/);
  assert.match(section, /\/api\/pet\/\$\{petInventoryId\}\/costumes\/unlock/);
  assert.match(section, /item\.type === "costume"/);
  assert.match(accessoryPage, /petInventoryId=\{petInventoryId\}/);
  assert.doesNotMatch(section, /EquippedCostumePreview/);
  assert.doesNotMatch(accessoryPage, /depth="back"|depth="front"/);
});

test("Costume APIs validate pet ownership, item ownership, slots, and fitted definitions", () => {
  assert.match(routes, /requireAuthenticated/);
  assert.match(routes, /pet\.userId !== userId/);
  assert.match(routes, /eq\(userInventory\.userId, user\.id\)/);
  assert.match(routes, /costumeItem\.type !== "costume"/);
  assert.match(routes, /slot < 1 \|\| slot > COSTUME_SLOT_COUNT/);
  assert.match(routes, /This costume has not been fitted for this pet yet/);
  assert.match(routes, /getUnlockedCostumeSlotCount/);
  assert.match(routes, /\.for\("update"\)/);
  assert.match(routes, /costumeInventory\.isListed/);
  assert.match(routes, /copyIndex >= costumeInventory\.quantity/);
  assert.match(routes, /petCostumeDefinitions\.placements/);
  assert.match(routes, /petTemplateParts\.partType/);
});

test("Stacked costume copies are counted and unequipped individually", () => {
  assert.match(schema, /copyIndex: integer\("copy_index"\)/);
  assert.match(schema, /pet_equipped_costumes_inventory_copy_unique/);
  assert.match(routes, /equipped-costume-counts/);
  assert.match(section, /item\.quantity > \(equippedCounts\[item\.inventoryId\]/);
  assert.match(routes, /eq\(petEquippedCostumes\.id, equippedCostumeId\)/);
});

test("A pet cannot equip two costumes attached to the same saved layer", () => {
  assert.match(routes, /requestedLayers = new Set/);
  assert.match(routes, /requestedLayers\.has\(placement\.anchorPart\)/);
  assert.match(routes, /another costume on the same pet layer/);
  assert.match(routes, /eq\(userInventory\.id, petInventoryId\)[\s\S]*?\.for\("update"\)/);
});

test("Admin costume library marks pieces already fitted for the selected pet", () => {
  assert.match(adminEditor, /const fittedForPet = costumeDefinitions\.some/);
  assert.match(adminEditor, /data-testid={`costume-fitted-\$\{item\.id\}`}/);
  assert.match(adminEditor, /Placement saved for this pet/);
});

test("Marketplace refuses to list or transfer an equipped costume", () => {
  assert.match(marketplace, /Unequip this costume before listing it/);
  assert.match(marketplace, /Listed costume is still equipped/);
});

test("Production boot creates both player costume persistence tables safely", () => {
  assert.match(boot, /CREATE TABLE IF NOT EXISTS pet_costume_slot_unlocks/);
  assert.match(boot, /extra_slots INTEGER NOT NULL DEFAULT 0 CHECK\(extra_slots BETWEEN 0 AND 2\)/);
  assert.match(boot, /CREATE TABLE IF NOT EXISTS pet_equipped_costumes/);
  assert.match(boot, /copy_index INTEGER NOT NULL DEFAULT 0/);
  assert.match(boot, /UNIQUE\(costume_inventory_id, copy_index\)/);
  assert.match(boot, /DROP CONSTRAINT IF EXISTS pet_equipped_costumes_costume_inventory_id_key/);
  assert.match(boot, /UNIQUE\(pet_inventory_id, slot\)/);
});

test("public costume display is read-only and does not require pet ownership", () => {
  assert.match(routes, /app\.get\("\/api\/pet\/:petInventoryId\/costumes\/public"/);
  assert.match(routes, /petEquippedCostumes\.petInventoryId, petInventoryId/);
  assert.match(routes, /return res\.json\(\{ equipped, anchors, extraSlots: 0 \}\)/);
  const publicRoute = routes.slice(
    routes.indexOf('app.get("/api/pet/:petInventoryId/costumes/public"'),
    routes.indexOf('app.get("/api/pet/:petInventoryId/costumes"', routes.indexOf('app.get("/api/pet/:petInventoryId/costumes/public"')),
  );
  assert.doesNotMatch(publicRoute, /ownedPet|\.post\(|\.delete\(|\.update\(/);
});
