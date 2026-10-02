import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const admin = fs.readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const picker = fs.readFileSync("client/src/components/ItemDatabaseSection.tsx", "utf8");
const routes = fs.readFileSync("server/routes.ts", "utf8");
const boot = fs.readFileSync("server/startup/migrations/runEssentialBoot.ts", "utf8");
const schema = fs.readFileSync("shared/schema.ts", "utf8");
const claimModal = fs.readFileSync("client/src/components/RewardClaimModal.tsx", "utf8");

test("admin reward picker loads and sends Home Bundle and Home Decor catalogs", () => {
  assert.match(admin, /queryKey: \["\/api\/admin\/house-bundles"\]/);
  assert.match(admin, /queryKey: \["\/api\/admin\/home-decor"\]/);
  assert.match(admin, /homeRewards: selectedHomeRewards\.map/);
  assert.match(admin, /type: "house_bundle"/);
  assert.match(admin, /type: "home_decor"/);
  assert.match(admin, /homeBundles=\{rewardHouseBundles/);
  assert.match(admin, /homeDecor=\{rewardHomeDecor\}/);
});

test("reward picker exposes correct Home and Object filters without changing normal picker defaults", () => {
  assert.match(picker, /label: "Home Bundles"/);
  assert.match(picker, /label: "Home Decor"/);
  assert.match(picker, /\{ key: "objects",\s+label: "Objects"/);
  assert.match(picker, /if \(item\.type === "object"\) return "objects"/);
  assert.match(picker, /activeCategory === "home_bundles"/);
  assert.match(picker, /activeCategory === "home_decor"/);
  assert.match(picker, /bundle\.name\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(picker, /decor\.name\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(routes, /const catalogItems = items\.filter\(i => !\(i\.fishingType === "bait" && i\.locationId !== null\)\)/);
});

test("server validates and persists Home rewards atomically with ordinary reward bundles", () => {
  assert.match(routes, /parseHomeRewards\(req\.body\.homeRewards\)/);
  assert.match(routes, /SELECT id FROM house_bundles WHERE id = \$\{/);
  assert.match(routes, /SELECT id FROM home_decor_items WHERE id = \$\{/);
  assert.match(routes, /INSERT INTO reward_bundle_home_items/);
  assert.match(routes, /INSERT INTO user_house_bundles \(user_id, bundle_id\)/);
  assert.match(routes, /NOT EXISTS \([\s\S]*FROM user_house_bundles/);
  assert.match(routes, /UPDATE user_home_decor_inventory[\s\S]*SET quantity = quantity \+/);
  assert.match(routes, /INSERT INTO user_home_decor_inventory/);
});

test("pending rewards surface Home Bundle and Home Decor entries before claim", () => {
  assert.match(routes, /JOIN house_bundles hb ON r\.reward_type = 'house_bundle'/);
  assert.match(routes, /JOIN home_decor_items hd ON r\.reward_type = 'home_decor'/);
  assert.match(routes, /description: homeReward\.reward_type === "house_bundle" \? "Home Bundle" : "Home Decor"/);
  assert.match(routes, /type: homeReward\.reward_type/);
});

test("reward home storage is startup-safe and represented in shared schema", () => {
  assert.match(boot, /CREATE TABLE IF NOT EXISTS reward_bundle_home_items/);
  assert.match(boot, /reward_type TEXT NOT NULL CHECK \(reward_type IN \('house_bundle', 'home_decor'\)\)/);
  assert.match(schema, /export const rewardBundleHomeItems = pgTable\("reward_bundle_home_items"/);
  assert.match(schema, /unique\("reward_bundle_home_items_bundle_type_target_uidx"\)/);
});

test("claim modal refreshes Home Bundle ownership and Home Decor inventory", () => {
  assert.match(claimModal, /queryKey: \["\/api\/pet-house\/decor\/inventory"\]/);
  assert.match(claimModal, /queryKey: \["\/api\/users", data\.user\.id, "house-bundles"\]/);
  assert.match(claimModal, /description: "Rewards have been added to your account"/);
});
