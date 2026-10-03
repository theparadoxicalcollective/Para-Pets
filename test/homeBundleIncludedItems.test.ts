import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOUSE_BUNDLE_INCLUDED_ITEM_MAX_QUANTITY,
  getHouseBundleIncludedItemGrantDelta,
  sanitizeHouseBundleIncludedItemQuantity,
} from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");

test("Home Bundle included-item quantities are explicit, bounded, and monotonic per player", () => {
  assert.equal(HOUSE_BUNDLE_INCLUDED_ITEM_MAX_QUANTITY, 99);
  assert.equal(sanitizeHouseBundleIncludedItemQuantity(undefined), 1);
  assert.equal(sanitizeHouseBundleIncludedItemQuantity(0), 1);
  assert.equal(sanitizeHouseBundleIncludedItemQuantity(4.4), 4);
  assert.equal(sanitizeHouseBundleIncludedItemQuantity(400), 99);

  assert.equal(getHouseBundleIncludedItemGrantDelta(0, 1), 1);
  assert.equal(getHouseBundleIncludedItemGrantDelta(1, 1), 0);
  assert.equal(getHouseBundleIncludedItemGrantDelta(3, 1), 0);
  assert.equal(getHouseBundleIncludedItemGrantDelta(3, 4), 1);
});

test("included Home items have a persistent entitlement list and per-player delivery ledger", () => {
  const schema = read("shared/schema.ts");
  const boot = read("server/startup/migrations/runEssentialBoot.ts");

  assert.match(schema, /houseBundleIncludedItems = pgTable\("house_bundle_included_items"/);
  assert.match(schema, /bundleCatalogItemUnique: unique\("house_bundle_included_items_bundle_type_item_key"\)/);
  assert.match(schema, /userHouseBundleItemGrants = pgTable\("user_house_bundle_item_grants"/);
  assert.match(schema, /grantedQuantity: integer\("granted_quantity"\)/);
  assert.match(schema, /xPct: real\("x_pct"\)/);
  assert.match(schema, /yPct: real\("y_pct"\)/);
  assert.match(schema, /templateAppliedAt: timestamp\("template_applied_at"\)/);
  assert.match(boot, /CREATE TABLE IF NOT EXISTS house_bundle_included_items/);
  assert.match(boot, /UNIQUE INDEX IF NOT EXISTS house_bundle_included_items_bundle_type_item_key/);
  assert.match(boot, /CREATE TABLE IF NOT EXISTS user_house_bundle_item_grants/);
  assert.match(boot, /UNIQUE INDEX IF NOT EXISTS user_house_bundle_item_grants_user_item_key/);
});

test("delivery is idempotent and never adds included Objects onto marketplace escrow rows", () => {
  const helper = read("server/housing/bundleContents.ts");

  assert.match(helper, /SELECT id FROM users WHERE id = \$\{userId\} FOR UPDATE/);
  assert.match(helper, /getHouseBundleIncludedItemGrantDelta\(previouslyGranted, entitlement\.quantity\)/);
  assert.match(helper, /eq\(userInventory\.isListed, false\)/);
  assert.match(helper, /nextGrantedQuantity > previouslyGranted/);
  assert.match(helper, /grantedQuantity: nextGrantedQuantity/);
  assert.match(helper, /applyActiveHouseBundleIncludedItemTemplates/);
  assert.match(helper, /tx\.insert\(placedHomeDecor\)/);
  assert.match(helper, /templateAppliedAt: new Date\(\)/);
  assert.match(helper, /eq\(userInventory\.isListed, false\)/);
});

test("every Home Bundle acquisition/return path uses the same included-item delivery helper", () => {
  const storage = read("server/storage.ts");
  const market = read("server/marketplace/transactions.ts");
  const routes = read("server/routes.ts");
  const bundleRoutes = read("server/routes/houseBundle.routes.ts");

  assert.match(storage, /async grantUserHouseBundle[\s\S]{0,500}grantHouseBundleIncludedItemsInTransaction/);
  assert.match(market, /grantHouseBundleIncludedItemsInTransaction\(tx, input\.actorId, listing\.shopItemId\)/);
  assert.match(routes, /grantHouseBundleIncludedItemsInTransaction\(tx, user\.id, homeItem\.target_id\)/);
  assert.match(bundleRoutes, /ensureAllOwnedHouseBundleIncludedItemsGranted/);
  assert.match(bundleRoutes, /ensureIncludedItemsGranted\(userId\)/);
});

test("Admin can manage bundle Decor and Objects from both outside and building editors without double-tap duplication", () => {
  const admin = read("client/src/components/HomeBundleSection.tsx");
  const routes = read("server/routes/houseBundle.routes.ts");

  assert.match(admin, /button-add-bundle-items-outside/);
  assert.match(admin, /button-add-bundle-items-interior/);
  assert.match(admin, /BUNDLE DECOR \/ OBJECTS/);
  assert.match(admin, /Increase included quantity/);
  assert.match(admin, /Decrease included quantity/);
  assert.match(admin, /bundle-template-item-/);
  assert.match(admin, /Make included item smaller/);
  assert.match(admin, /Flip included item/);
  assert.match(admin, /first included copy starts at the position you set/);

  assert.match(routes, /This item is already included in the Home Bundle/);
  assert.match(routes, /active: false/);
  assert.match(routes, /quantity: 1/);
  assert.match(routes, /sanitizeHouseBundleIncludedItemQuantity/);
  assert.match(routes, /updates\.xPct/);
  assert.match(routes, /updates\.yPct/);
  assert.match(routes, /updates\.flipped/);
});

test("first activation moves, rather than copies, the included scene item", () => {
  const helper = read("server/housing/bundleContents.ts");
  const homeRoutes = read("server/routes/homeDecor.routes.ts");
  const bundleRoutes = read("server/routes/houseBundle.routes.ts");

  assert.match(helper, /quantity: sql`\$\{userHomeDecorInventory\.quantity\} - 1`/);
  assert.match(helper, /quantity: sql`\$\{userInventory\.quantity\} - 1`/);
  assert.match(helper, /location: entitlement\.buildingId \?\? "outside"/);
  assert.match(homeRoutes, /await applyBundleTemplates\(userId\)/);
  assert.match(bundleRoutes, /await applyIncludedItemTemplates\(user\.id, bundleId\)/);
});
