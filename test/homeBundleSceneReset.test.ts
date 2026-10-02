import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync("server/routes/houseBundle.routes.ts", "utf8");
const transactions = readFileSync("server/housing/decorTransactions.ts", "utf8");
const page = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

test("switching bundles stores the current Home scene before activating a different bundle", () => {
  assert.match(routes, /currentBundle\?\.id !== bundleId/);
  assert.match(routes, /await storeAllHomeScene\(user\.id\)/);
  assert.match(routes, /await storage\.setActiveHouseBundle\(user\.id, bundleId\)/);
});

test("deactivating a bundle also returns all scene placements", () => {
  assert.match(routes, /app\.post\("\/api\/house-bundles\/deactivate"/);
  assert.match(routes, /await storeAllHomeScene\(user\.id\);[\s\S]*await storage\.setActiveHouseBundle\(user\.id, null\)/);
});

test("scene reset returns Decor, Objects, and clears Pet House positions", () => {
  assert.match(transactions, /userHomeDecorInventory/);
  assert.match(transactions, /userInventory/);
  assert.match(transactions, /returnedDecor\+\+/);
  assert.match(transactions, /returnedObjects\+\+/);
  assert.match(transactions, /delete\(placedHomeDecor\)/);
  assert.match(transactions, /delete\(petHousePositions\)/);
  assert.match(transactions, /returnedPets: petPlacements\.length/);
});

test("bundle activation refreshes returned inventories immediately", () => {
  assert.match(page, /queryKey: \["\/api\/pet-house\/decor\/inventory"\]/);
  assert.match(page, /queryKey: \["\/api\/pet-house\/decor\/placed"\]/);
  assert.match(page, /queryKey: \["\/api\/pet-house-positions"\]/);
  assert.match(page, /queryKey: \["\/api\/users", user\.id, "pets"\]/);
  assert.match(page, /Placed pets, Decor, and Objects were returned to inventory/);
});
