import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { isValidRedeemCode, normalizeRedeemCode, parseMaxRedemptions } from "../server/redeemCode";

const root = path.resolve(import.meta.dirname, "..");

test("redeem codes are canonical and reject unsafe values", () => {
  assert.equal(normalizeRedeemCode(" moon-gift "), "MOON-GIFT");
  assert.equal(normalizeRedeemCode("m o o n"), "MOON");
  assert.equal(isValidRedeemCode("MOON-GIFT"), true);
  assert.equal(isValidRedeemCode("NO"), false);
  assert.equal(isValidRedeemCode("BAD_CODE"), false);
});

test("new code redemption limits require a positive whole number", () => {
  assert.equal(parseMaxRedemptions("100"), 100);
  for (const value of [undefined, "", 0, -1, 1.5, "abc", true, 1_000_001]) {
    assert.equal(parseMaxRedemptions(value), null);
  }
});

test("redemption is verified-account-only and atomically unique per account and code", () => {
  const route = readFileSync(path.join(root, "server", "routes", "redeemCode.routes.ts"), "utf8");
  const migration = readFileSync(path.join(root, "server", "startup", "migrations", "runEssentialBoot.ts"), "utf8");
  assert.match(route, /SELECT email_verified FROM users/);
  assert.match(route, /ON CONFLICT \(code_id, user_id\) DO NOTHING/);
  assert.match(route, /INSERT INTO user_rewards/);
  assert.match(migration, /UNIQUE\(code_id, user_id\)/);
});

test("Hub and administration surfaces expose redeem-code controls", () => {
  const hub = readFileSync(path.join(root, "client", "src", "pages", "ParaPetsHubPage.tsx"), "utf8");
  const admin = readFileSync(path.join(root, "client", "src", "pages", "AdminPage.tsx"), "utf8");
  const card = readFileSync(path.join(root, "client", "src", "components", "RedeemCodeCard.tsx"), "utf8");
  assert.match(hub, /<RedeemCodeCard user=\{user\}/);
  assert.match(card, /chestAssets\.closed/);
  assert.match(card, /data-testid="img-redeem-code-chest"/);
  assert.match(card, /padding: "16px 14px"/);
  assert.doesNotMatch(card, /<Gift/);
  assert.match(admin, /\{ key: "code", label: "Code" \}/);
  assert.match(admin, /rewardsTab === "code" && <RedeemCodeAdminPanel/);
});

test("admin redeem-code editing is server-locked until the first redemption", () => {
  const route = readFileSync(path.join(root, "server", "routes", "redeemCode.routes.ts"), "utf8");
  const panel = readFileSync(path.join(root, "client", "src", "components", "RedeemCodeAdminPanel.tsx"), "utf8");

  assert.match(route, /app\.put\("\/api\/admin\/redeem-codes\/:id", requireAdmin/);
  assert.match(route, /SELECT id, bundle_id FROM redeem_codes[\s\S]*?FOR UPDATE/);
  assert.match(route, /SELECT COUNT\(\*\)::int AS total[\s\S]*?FROM redeem_code_redemptions/);
  assert.match(route, /CODE_ALREADY_REDEEMED/);
  assert.match(route, /can no longer be edited/);
  assert.match(route, /UPDATE reward_bundles/);
  assert.match(route, /DELETE FROM reward_bundle_items/);
  assert.match(route, /DELETE FROM reward_bundle_cards/);

  assert.match(panel, /button-edit-code-/);
  assert.match(panel, /const canEdit = redemptionCount === 0/);
  assert.match(panel, /disabled=\{!canEdit/);
  assert.match(panel, /Editing locked after first redemption/);
  assert.match(panel, /apiRequest\("PUT",/);
});

test("admins can delete redeem codes without breaking already-delivered rewards", () => {
  const route = readFileSync(path.join(root, "server", "routes", "redeemCode.routes.ts"), "utf8");
  const panel = readFileSync(path.join(root, "client", "src", "components", "RedeemCodeAdminPanel.tsx"), "utf8");

  assert.match(route, /app\.delete\("\/api\/admin\/redeem-codes\/:id", requireAdmin/);
  assert.match(route, /DELETE FROM redeem_codes WHERE id/);
  assert.match(route, /NOT EXISTS \(SELECT 1 FROM user_rewards WHERE bundle_id/);
  assert.match(route, /DELETE FROM reward_bundles/);

  assert.match(panel, /button-delete-code-/);
  assert.match(panel, /window\.confirm\(warning\)/);
  assert.match(panel, /Existing rewards already delivered to players will stay intact/);
  assert.match(panel, /apiRequest\("DELETE",/);
});

test("admin code list includes reward contents so zero-redemption codes can be fully edited", () => {
  const route = readFileSync(path.join(root, "server", "routes", "redeemCode.routes.ts"), "utf8");
  const panel = readFileSync(path.join(root, "client", "src", "components", "RedeemCodeAdminPanel.tsx"), "utf8");

  assert.match(route, /AS shop_item_ids/);
  assert.match(route, /json_build_object\('cardId', rbc\.card_id, 'quantity', rbc\.quantity\)/);
  assert.match(panel, /shop_item_ids\?: string\[\]/);
  assert.match(panel, /cards\?: Array<\{ cardId: string; quantity: number \}>/);
  assert.match(panel, /setItems\(resolvedItems\)/);
  assert.match(panel, /setCards\(resolvedCards\)/);
});
