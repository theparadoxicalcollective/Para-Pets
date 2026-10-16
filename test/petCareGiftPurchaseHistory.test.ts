import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const consumption = readFileSync("server/inventoryConsumption.ts", "utf8");
const care = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
const routes = readFileSync("server/routes/petCare.routes.ts", "utf8");

test("single-item and multi-item consumption retain referenced exhausted purchase rows", () => {
  const guardedDeletes = consumption.match(/NOT EXISTS \(SELECT 1 FROM clearing_shop_purchases csp WHERE csp\.inventory_id = \$\{userInventory\.id\}\)/g) ?? [];
  assert.equal(guardedDeletes.length, 2);
  assert.match(consumption, /sql`\$\{userInventory\.quantity\} > 0`/);
  assert.match(consumption, /sql`\$\{userInventory\.quantity\} >= \$\{quantity\}`/);
});

test("gift transaction awards loyalty and consumes inventory atomically", () => {
  const gift = routes.slice(routes.indexOf('app.post("/api/pet/:inventoryId/give-gift"'), routes.indexOf('app.post("/api/pet/:inventoryId/claim-loyalty-reward"'));
  assert.match(gift, /await db\.transaction\(async \(tx\) =>/);
  assert.match(gift, /petLoyalty: newLoyalty/);
  assert.match(gift, /await tryConsumeOneFromInventory\(tx, user\.id, itemInv\.id\)/);
  assert.match(gift, /loyaltyAdded:/);
});

test("Pet Care jars do not offer consumed zero-quantity gift or edible records", () => {
  assert.match(care, /it\.type === "gift" && Number\(it\.quantity \?\? 0\) > 0/);
  assert.match(care, /it\.type === "edibles" && Number\(it\.quantity \?\? 0\) > 0/);
});
