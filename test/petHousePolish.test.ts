import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ownerPage = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
const visitorPage = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");
const worldPage = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");
const positionRoutes = readFileSync("server/routes/petHousePosition.routes.ts", "utf8");
const storage = readFileSync("server/storage.ts", "utf8");

test("owner house pet taps expose the Home edit panel without opening care/feed", () => {
  assert.match(ownerPage, /data-testid="house-pet-control-panel"/);
  assert.match(ownerPage, /data-testid="button-pet-home-size-minus"/);
  assert.match(ownerPage, /data-testid="button-pet-home-size-plus"/);
  assert.match(ownerPage, /data-testid="button-pet-home-flip"/);
  assert.match(ownerPage, /data-testid="button-pet-home-closet"/);
  assert.match(ownerPage, /\{pending \? "Removing…" : "Remove from Home"\}/);
  assert.match(ownerPage, /if \(outdoorPopupPetId !== pet\.inventoryId\)/);
  assert.match(ownerPage, /if \(popupPetId !== pet\.inventoryId\)/);
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

  const deleteRoute = positionRoutes.match(/app\.delete\("\/api\/pet-house-positions\/:inventoryId"[\s\S]*?\n  \}\);/)?.[0] ?? "";
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

test("Pet House uses shared pet baselines and mobile-friendly edit controls", () => {
  assert.match(ownerPage, /PET_HOUSE_OUTDOOR_PET_BASE_SIZE/);
  assert.match(ownerPage, /PET_HOUSE_INTERIOR_PET_BASE_SIZE/);
  assert.match(ownerPage, /petHouseDisplaySize/);
  assert.doesNotMatch(ownerPage, /petHouseDepthSize/);
  assert.doesNotMatch(visitorPage, /petHouseDepthSize/);
  assert.match(ownerPage, /minHeight: 34/);
  assert.match(ownerPage, /Math\.max\(120, Math\.min/);
});

test("general profile and currency HUD is absent while house navigation remains", () => {
  assert.doesNotMatch(ownerPage, /<TopBar\b|<UserProfilePanel\b/);
  assert.doesNotMatch(ownerPage, /coinIconImg/);
  assert.match(ownerPage, /label: "Pets"/);
  assert.match(ownerPage, /label: "Home"/);
  assert.match(ownerPage, /label: "Decor"/);
  assert.match(ownerPage, /data-testid=\{`button-\$\{key\}-inventory`\}/);
});
