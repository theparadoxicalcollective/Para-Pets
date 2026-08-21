import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync("server/soulExchange.ts", "utf8");
const polish = fs.readFileSync("client/src/soulExchangeCardPolish.css", "utf8");

test("Soul Exchange ignores stale Clearing reward rows but still protects active pets and regular accessories", () => {
  const blockedReason = server.match(/function blockedReason\(row: any\)[\s\S]*?\n}\n\nconst petStateSelect/)?.[0];
  assert.ok(blockedReason, "blockedReason should remain explicit and testable");
  assert.match(blockedReason, /row\.active \? "active"/);
  assert.match(blockedReason, /row\.accessories \? "accessories"/);
  assert.doesNotMatch(blockedReason, /row\.clearing|\? "clearing"/);

  assert.match(server, /EXISTS\(SELECT 1 FROM pet_equipped_accessories x WHERE x\.pet_inventory_id=ui\.id\) accessories/);
  assert.doesNotMatch(server, /user_clearing_loadouts[\s\S]*accessories/);

  const chestCleanup = server.indexOf("DELETE FROM clearing_reward_chests");
  const petDelete = server.indexOf("DELETE FROM user_inventory");
  assert.ok(chestCleanup >= 0 && petDelete > chestCleanup, "stale Clearing chest references must be removed before the pet row");
  assert.match(server, /DELETE FROM clearing_reward_chests WHERE user_id=\$\{userId\} AND pet_inventory_id IN \(\$\{idList\}\)/);
});

test("Soul Exchange card identity shows stars above names and lifts the footer label three more pixels", () => {
  assert.match(polish, /> div > span \{[\s\S]*order: 1/);
  assert.match(polish, /> div > b \{[\s\S]*order: 2/);
  assert.match(polish, /main:has\(\.soul-exchange-zone\) > footer button > img \+ span[\s\S]*translateY\(-5px\)/);
});
