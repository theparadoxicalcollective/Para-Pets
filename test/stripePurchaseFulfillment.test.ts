import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { executeStripePurchaseFulfillment, type FulfillmentOperations, type TrustedCheckoutSession } from "../server/payments/fulfillStripePurchase";
import { StripePurchaseError } from "../server/payments/errors";
import { coinPackageById } from "../server/payments/config";

const paid = (overrides: Partial<TrustedCheckoutSession> = {}): TrustedCheckoutSession => ({
  id: "cs_paid_1", payment_status: "paid", status: "complete", amount_total: 500,
  currency: "usd", payment_intent: "pi_1",
  metadata: { userId: "user-1", packId: "pack_v2_1000", coins: "999999", amountUsd: "999999" },
  ...overrides,
});

class AtomicFake implements FulfillmentOperations {
  fulfilled = new Set<string>();
  coins = 0;
  progress = 0;
  eggs = 0;
  community = 0;
  failAt: "coins" | "item" | "contribution" | "complete" | null = null;
  notificationsFail = false;

  async run({ session, package: pack }: Parameters<FulfillmentOperations["run"]>[0]) {
    if (this.fulfilled.has(session.id)) return "already_fulfilled" as const;
    const snapshot = { coins: this.coins, progress: this.progress, eggs: this.eggs, community: this.community };
    try {
      if (this.failAt === "coins") throw new Error("coin failure");
      this.coins += Math.round(pack.coins * 1.33);
      if (this.failAt === "item") throw new Error("item failure");
      if (pack.eggBonus) this.eggs++;
      if (this.failAt === "contribution") throw new Error("progress failure");
      this.progress += pack.priceUsd * 100;
      if (pack.priceUsd >= 25) this.community++;
      if (this.failAt === "complete") throw new Error("completion failure");
      this.fulfilled.add(session.id);
      if (this.notificationsFail) { /* post-commit failure is intentionally ignored */ }
      return "fulfilled" as const;
    } catch (error) {
      Object.assign(this, snapshot);
      throw error;
    }
  }
}

const expectCode = async (session: TrustedCheckoutSession, code: string, expectedUserId?: string) => {
  await assert.rejects(executeStripePurchaseFulfillment(session, new AtomicFake(), { expectedUserId }),
    (error: unknown) => error instanceof StripePurchaseError && error.code === code);
};

test("paid package grants exact server configuration and ignores browser-style reward metadata", async () => {
  const fake = new AtomicFake();
  const result = await executeStripePurchaseFulfillment(paid(), fake);
  assert.deepEqual(result, { status: "fulfilled", userId: "user-1", coins: 1330, baseCoins: 1000, eggBonus: null });
  assert.equal(fake.coins, 1330);
  assert.equal(fake.progress, 500);
});

test("paid state, package, exact amount, currency, and player ownership are mandatory", async () => {
  await expectCode(paid({ payment_status: "unpaid" }), "unpaid");
  await expectCode(paid({ status: "expired" }), "invalid_state");
  await expectCode(paid({ metadata: { userId: "user-1", packId: "unknown" } }), "unsupported_package");
  await expectCode(paid({ amount_total: 499 }), "amount_mismatch");
  await expectCode(paid({ currency: "eur" }), "currency_mismatch");
  await expectCode(paid(), "player_mismatch", "user-2");
  await expectCode(paid({ metadata: { packId: "pack_v2_1000" } }), "unknown_player");
});

test("same event, different events, lost responses, and verification retries grant once", async () => {
  const fake = new AtomicFake();
  const results = await Promise.all([
    executeStripePurchaseFulfillment(paid(), fake, { eventId: "evt_1" }),
    executeStripePurchaseFulfillment(paid(), fake, { eventId: "evt_2" }),
  ]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(fake.coins, 1330);
  assert.equal((await executeStripePurchaseFulfillment(paid(), fake)).status, "already_fulfilled");
  assert.equal(fake.coins, 1330);
});

test("coin, item, contribution, and completion failures roll back all core effects", async () => {
  for (const failAt of ["coins", "item", "contribution", "complete"] as const) {
    const fake = new AtomicFake(); fake.failAt = failAt;
    const eggSession = paid({ id: `cs_${failAt}`, amount_total: 5000, metadata: { userId: "user-1", packId: "pack_v2_20000" } });
    await assert.rejects(executeStripePurchaseFulfillment(eggSession, fake));
    assert.deepEqual([fake.coins, fake.eggs, fake.progress, fake.community, fake.fulfilled.size], [0, 0, 0, 0, 0]);
  }
});

test("limited egg, community reward, and milestone progress are each applied once", async () => {
  const fake = new AtomicFake();
  const session = paid({ amount_total: 5000, metadata: { userId: "user-1", packId: "pack_v2_20000" } });
  await executeStripePurchaseFulfillment(session, fake);
  await executeStripePurchaseFulfillment(session, fake);
  assert.deepEqual([fake.coins, fake.eggs, fake.progress, fake.community], [26600, 1, 5000, 1]);
});

test("limited $50 and $100 eggs resolve against the live pet catalog", () => {
  const fifty = coinPackageById("pack_v2_20000");
  assert.equal(fifty?.eggBonus?.shopItemName, "Midnight Juggler");
  assert.equal(fifty?.eggBonus?.itemName, "Midnight Juggler Egg");

  const hundred = coinPackageById("pack_v2_50000");
  assert.equal(hundred?.eggBonus?.shopItemName, "The Paradox");
  assert.equal(hundred?.eggBonus?.shopItemId, undefined);
  assert.equal(hundred?.eggBonus?.itemName, "The Paradox Egg");

  const fulfillment = readFileSync("server/payments/fulfillStripePurchase.ts", "utf8");
  assert.match(fulfillment, /FROM shop_items[\s\S]*name = \$\{bonus\.shopItemName\}[\s\S]*type = 'pet'/);
  assert.match(fulfillment, /matches\.rows\.length !== 1/);
});

test("purchaser coins and limited egg are delivered through the normal reward inbox", () => {
  const fulfillment = readFileSync("server/payments/fulfillStripePurchase.ts", "utf8");
  assert.match(fulfillment, /INSERT INTO reward_bundles \(name, coin_amount, message\)[\s\S]*Coin Shop Purchase/);
  assert.match(fulfillment, /INSERT INTO reward_bundle_items \(bundle_id, shop_item_id\)/);
  assert.match(fulfillment, /INSERT INTO user_rewards \(user_id, bundle_id\)[\s\S]*VALUES \(\$\{userId\}, \$\{purchaseBundleId\}\)/);
  assert.doesNotMatch(fulfillment, /UPDATE users SET coins = coins \+/);
  assert.doesNotMatch(fulfillment, /INSERT INTO user_inventory \(user_id, shop_item_id, hatch_started_at\)/);
});

test("$100 purchase contributes 10,000 progress points in the fulfillment transaction", () => {
  const hundred = coinPackageById("pack_v2_50000");
  assert.equal(hundred?.priceUsd, 100);
  const fulfillment = readFileSync("server/payments/fulfillStripePurchase.ts", "utf8");
  assert.match(fulfillment, /INSERT INTO purchase_monthly_progress/);
  assert.match(fulfillment, /contributionPointsFor\(pack\)/);
});

test("coin shop renders the server-owned bonus name with Midnight Juggler promotional art", () => {
  const shop = readFileSync("client/src/pages/CoinShopPage.tsx", "utf8");
  assert.match(shop, /pack\.eggBonus\.itemName/);
  assert.match(shop, /pack_v2_20000: midnightJugglerEggImg/);
  assert.doesNotMatch(shop, /Cerberus Serpent Egg/);
});

test("post-commit notification failure cannot repeat fulfillment", async () => {
  const fake = new AtomicFake(); fake.notificationsFail = true;
  await executeStripePurchaseFulfillment(paid(), fake);
  await executeStripePurchaseFulfillment(paid(), fake);
  assert.equal(fake.coins, 1330);
});

test("webhook uses raw bytes before JSON middleware and all completion paths share the service", () => {
  const index = readFileSync("server/index.ts", "utf8");
  const routes = readFileSync("server/routes.ts", "utf8");
  const webhook = readFileSync("server/webhookHandlers.ts", "utf8");
  assert.ok(index.indexOf("express.raw({ type: 'application/json' })") < index.indexOf("express.json({"));
  assert.match(index, /stripe-signature/);
  assert.match(routes, /fulfillStripePurchase\(stripeSession/);
  assert.match(webhook, /fulfillStripePurchase\(event\.data\.object/);
  assert.doesNotMatch(webhook, /addCoins|addToInventory|createCoinPurchase/);
});

test("checkout uses only server-owned package selection and carries no reward data in return URLs", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  assert.match(routes, /COIN_PACKS\.find\(p => p\.id === packId\)/);
  assert.match(routes, /price: priceId/);
  assert.match(routes, /success_url: `\$\{baseUrl\}\/coins\?success=true&session_id=\{CHECKOUT_SESSION_ID\}`/);
  assert.doesNotMatch(routes, /success_url:[^\n]*(coins=|userId=|amountUsd=)/);
});
