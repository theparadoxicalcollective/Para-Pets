import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_DAILY_CLAIM_CONFIG,
  dailyClaimConfigSchema,
  parseDailyClaimConfig,
} from "../server/dailyClaimConfig";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("daily reward config accepts two unique items and rejects duplicates", () => {
  const valid = dailyClaimConfigSchema.safeParse({
    coinAmount: 250,
    essenceAmount: 75,
    itemIds: ["item-one", "item-two"],
  });
  assert.equal(valid.success, true);

  const duplicate = dailyClaimConfigSchema.safeParse({
    coinAmount: 250,
    essenceAmount: 75,
    itemIds: ["item-one", "item-one"],
  });
  assert.equal(duplicate.success, false);
});

test("missing or corrupt daily reward settings safely use defaults", () => {
  assert.deepEqual(parseDailyClaimConfig(null), DEFAULT_DAILY_CLAIM_CONFIG);
  assert.deepEqual(parseDailyClaimConfig("{not-json"), DEFAULT_DAILY_CLAIM_CONFIG);
  assert.deepEqual(parseDailyClaimConfig(JSON.stringify({
    coinAmount: -1,
    essenceAmount: 100,
    itemIds: [],
  })), DEFAULT_DAILY_CLAIM_CONFIG);
});

test("daily reward UI uses the standalone essence token and admin controls", () => {
  const daily = readFileSync(path.join(repoRoot, "client/src/components/DailyClaimCard.tsx"), "utf8");
  const admin = readFileSync(path.join(repoRoot, "client/src/components/DailyRewardsAdminPanel.tsx"), "utf8");
  const routes = readFileSync(path.join(repoRoot, "server/routes/dailyClaim.routes.ts"), "utf8");

  assert.match(daily, /currencyAssets\.essenceToken/);
  assert.doesNotMatch(daily, /Photoroom_20260709_24152_PM_1783626130265/);
  assert.match(admin, /input-daily-reward-coins/);
  assert.match(admin, /input-daily-reward-essence/);
  assert.match(admin, /daily-reward-item-slot-/);
  assert.match(routes, /requireAdmin/);
  assert.match(routes, /config\.itemIds/);
  assert.match(routes, /grantConfiguredItem/);
});
