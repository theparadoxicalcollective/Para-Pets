import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync("server/routes/petCare.routes.ts", "utf8");
const gift = routes.slice(routes.indexOf('app.post("/api/pet/:inventoryId/give-gift"'), routes.indexOf('app.post("/api/pet/:inventoryId/claim-loyalty-reward"'));

test("zero-reward gift definitions are rejected before inventory consumption", () => {
  const validation = gift.indexOf('if (points === 0 && expAdded === 0)');
  const transaction = gift.indexOf("await db.transaction(async (tx) =>");
  assert.ok(validation > 0 && transaction > validation);
  assert.match(gift, /GIFT_REWARD_NOT_CONFIGURED/);
  assert.match(gift, /return res.status\(422\)/);
  assert.match(gift, /shopItemId: itemShopItem.id/);
});

test("configured gifts retain transactional loyalty awarding and stack consumption", () => {
  assert.match(gift, /petLoyalty: newLoyalty/);
  assert.match(gift, /tryConsumeOneFromInventory\(tx, user.id, itemInv.id\)/);
  assert.match(gift, /loyaltyAdded:/);
});
