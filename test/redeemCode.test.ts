import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { isValidRedeemCode, normalizeRedeemCode } from "../server/redeemCode";

const root = path.resolve(import.meta.dirname, "..");

test("redeem codes are canonical and reject unsafe values", () => {
  assert.equal(normalizeRedeemCode(" moon-gift "), "MOON-GIFT");
  assert.equal(normalizeRedeemCode("m o o n"), "MOON");
  assert.equal(isValidRedeemCode("MOON-GIFT"), true);
  assert.equal(isValidRedeemCode("NO"), false);
  assert.equal(isValidRedeemCode("BAD_CODE"), false);
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
  assert.match(hub, /<RedeemCodeCard user=\{user\}/);
  assert.match(admin, /\{ key: "code", label: "Code" \}/);
  assert.match(admin, /rewardsTab === "code" && <RedeemCodeAdminPanel/);
});

