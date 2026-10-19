import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const gifts = readFileSync("server/gifts/transactions.ts", "utf8");
const rewards = readFileSync("server/clearingRewardChests.ts", "utf8");
const market = readFileSync("server/marketplace/transactions.ts", "utf8");
const aquarium = readFileSync("server/routes/fishing.routes.ts", "utf8");

test("gift acceptance grants fish as individual aquarium inventory records, not generic stacks", () => {
  assert.match(gifts, /if \(catalog\.fishingType === "fish"\)/);
  assert.match(gifts, /tx\.insert\(playerFishInventory\)\.values\(/);
  assert.match(gifts, /Array\.from\(\{ length: gift\.itemQuantity \}/);
  assert.match(gifts, /if \(gift\.status === "accepted"\) return gift/);
});

test("clearing reward claims grant fish in the same transaction with correct quantity", () => {
  assert.match(rewards, /INSERT INTO player_fish_inventory\(user_id, shop_item_id\)/);
  assert.match(rewards, /generate_series\(1, \$\{quantity\}::integer\)/);
  assert.match(rewards, /catalog\.fishing_type = 'fish'/);
  assert.match(rewards, /catalog\.fishing_type IS DISTINCT FROM 'fish'/);
});

test("market fish purchases already use fish inventory; aquarium still excludes placed fish", () => {
  assert.match(market, /tx\.insert\(playerFishInventory\)\.values\(\{ userId: input\.actorId, shopItemId: escrow\.shopItemId \}\)/);
  assert.match(aquarium, /storage\.getPlayerFishInventory\(user\.id\)/);
});
