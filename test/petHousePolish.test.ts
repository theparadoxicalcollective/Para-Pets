import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ownerPage = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
const visitorPage = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");
const worldPage = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");
const routes = readFileSync("server/routes.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");

test("owner house pet taps expose only the placement-removal control", () => {
  assert.match(ownerPage, /data-testid="house-pet-removal-control"/);
  assert.match(ownerPage, /\{pending \? "Removing…" : "Remove from Home"\}/);
  assert.match(ownerPage, /setOutdoorPopupPetId\(current => current === drag\.inventoryId \? null : drag\.inventoryId\)/);
  assert.match(ownerPage, /setPopupPetId\(current => current === pet\.inventoryId \? null : pet\.inventoryId\)/);
  assert.doesNotMatch(ownerPage, /onCare=\{\(\) => \{ const id = outdoorPopupPet/);
  assert.doesNotMatch(ownerPage, /onFeedPet=\{/);
});

test("house removal is retry-safe, refreshes placements, and never deletes inventory", () => {
  assert.match(ownerPage, /disabled=\{pending\}/);
  assert.match(ownerPage, /if \(removingPetRef\.current\) return/);
  assert.match(ownerPage, /removingPetRef\.current = inventoryId/);
  assert.match(ownerPage, /finally \{\s*removingPetRef\.current = null/);
  assert.match(ownerPage, /invalidateQueries\(\{ queryKey: \["\/api\/users", user\.id, "pets"\] \}\)/);
  assert.match(ownerPage, /Could not remove this pet from your home/);

  const deleteRoute = routes.match(/app\.delete\("\/api\/pet-house-positions\/:inventoryId"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  assert.match(deleteRoute, /storage\.deletePetHousePosition\(user\.id, inventoryId\)/);
  assert.doesNotMatch(deleteRoute, /deleteInventory|release|sell/);

  const storageRemoval = storage.match(/async deletePetHousePosition[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(storageRemoval, /petHousePositions\.userId, userId/);
  assert.match(storageRemoval, /petHousePositions\.inventoryId, inventoryId/);
  assert.doesNotMatch(storageRemoval, /userInventory/);
});

test("visitors cannot see an owner removal action and regular world pets retain their menu", () => {
  assert.doesNotMatch(visitorPage, /Remove from Home|button-remove-pet-from-home/);
  assert.match(visitorPage, /PetStatPopup/);
  assert.match(worldPage, /onSelectPlayer=\{setSelectedPlayerId\}/);
});

test("Pet House uses context-specific scales and mobile-friendly targets", () => {
  assert.match(ownerPage, /PET_HOUSE_OUTDOOR_SCALE = 0\.82/);
  assert.match(ownerPage, /PET_HOUSE_INTERIOR_SCALE = 1/);
  assert.match(ownerPage, /RESPONSIVE_OUTDOOR_PET_SIZE \* PET_HOUSE_OUTDOOR_SCALE/);
  assert.match(ownerPage, /RESPONSIVE_INDOOR_PET_SIZE \* PET_HOUSE_INTERIOR_SCALE/);
  assert.match(ownerPage, /minHeight: 44/);
  assert.match(ownerPage, /Math\.max\(82, Math\.min/);
});

test("general profile and currency HUD is absent while house navigation remains", () => {
  assert.doesNotMatch(ownerPage, /<TopBar\b|<UserProfilePanel\b/);
  assert.doesNotMatch(ownerPage, /coinIconImg/);
  assert.match(ownerPage, /label: "Pets"/);
  assert.match(ownerPage, /label: "Home"/);
  assert.match(ownerPage, /label: "Decor"/);
  assert.match(ownerPage, /data-testid=\{`button-\$\{key\}-inventory`\}/);
});
