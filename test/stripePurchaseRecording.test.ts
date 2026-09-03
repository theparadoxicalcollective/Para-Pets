import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../server/db";
import { fulfillStripePurchase } from "../server/payments/fulfillStripePurchase";
import { COIN_PACKAGES } from "../server/payments/config";

// Exercise the production fulfillment SQL, without connecting to player data.
// This verifies query wiring/amounts; database isolation is not simulated here.
const dialect = new PgDialect();
type Query = { sql: string; params: unknown[] };
const checkout = (pack: typeof COIN_PACKAGES[number]) => ({
  id: "cs_recording", payment_status: "paid", status: "complete",
  amount_total: pack.priceUsd * 100, currency: "usd",
  metadata: { userId: "player", packId: pack.id },
});

test("every paid bundle records the purchase, contribution and exact claimable bonuses together", async t => {
  const expected = [
    [133, 100, 0, null], [1330, 500, 0, null], [3325, 1000, 0, null],
    [9975, 2500, 50, null], [26600, 5000, 100, "Midnight Juggler"], [66500, 10000, 500, "The Paradox"],
  ];
  for (const [index, pack] of COIN_PACKAGES.entries()) {
    const queries: Query[] = [];
    let bundle = 0;
    const mock = t.mock.method(db, "transaction", async (callback: any) => callback({
      execute: async (statement: any) => {
        const q = dialect.sqlToQuery(statement); queries.push(q);
        const sql = q.sql.replace(/\s+/g, " ").trim();
        if (sql.startsWith("SELECT user_id, fulfillment_status")) return { rows: [{ user_id: "player", fulfillment_status: "processing" }] };
        if (sql.startsWith("SELECT id, username FROM users")) return { rows: [{ id: "player", username: "Player" }] };
        if (sql.includes("FROM shop_items")) return { rows: sql.includes("WHERE name") ? [{ id: "bonus-pet" }] : [] };
        if (sql.startsWith("SELECT cycle")) return { rows: [{ cycle: 3 }] };
        if (sql.startsWith("SELECT COALESCE(SUM")) return { rows: [{ total: pack.priceUsd }] };
        if (sql.startsWith("INSERT INTO reward_bundles")) return { rows: [{ id: `bundle-${++bundle}` }] };
        if (sql.startsWith("UPDATE coin_purchases")) return { rows: [{ id: "purchase" }] };
        return { rows: [] };
      },
    }));
    try {
      const result = await fulfillStripePurchase(checkout(pack));
      assert.equal(result.status, "fulfilled");
      assert.equal(mock.mock.callCount(), 1);
      const [coins, points, community, petName] = expected[index];
      const record = queries.find(q => q.sql.includes("INSERT INTO coin_purchases"))!;
      assert.deepEqual(record.params.slice(0, 4), ["player", pack.priceUsd, coins, "cs_recording"]);
      const progress = queries.find(q => q.sql.includes("INSERT INTO purchase_monthly_progress"))!;
      assert.deepEqual(progress.params, ["player", "c-3", points]);
      const bundles = queries.filter(q => q.sql.includes("INSERT INTO reward_bundles"));
      assert.equal(bundles[0].params[1], coins);
      assert.equal(bundles.length, community ? 2 : 1);
      if (community) assert.equal(bundles[1].params[0], community);
      const bonus = queries.find(q => q.sql.includes("INSERT INTO reward_bundle_items"));
      if (petName) {
        assert.deepEqual(bonus?.params, ["bundle-1", "bonus-pet"]);
        assert.ok(queries.some(q => q.sql.includes("WHERE name") && q.params.includes(petName)));
      } else assert.equal(bonus, undefined);
      assert.ok(queries.some(q => q.sql.includes("INSERT INTO user_rewards") && q.params[0] === "player" && q.params[1] === "bundle-1"));
      assert.ok(queries.some(q => q.sql.includes("INSERT INTO founders")) === (pack.priceUsd >= 50));
      assert.ok(queries.every(q => !/UPDATE users SET coins|INSERT INTO user_inventory/.test(q.sql)));
      const completed = queries.at(-1)!;
      assert.match(completed.sql, /fulfillment_status = 'fulfilled'/);
      const metadata = JSON.parse(completed.params[1] as string);
      assert.equal(metadata.coins, coins);
      assert.equal(metadata.purchaserRewardBundleId, "bundle-1");
      assert.equal(metadata.communityCoins, community);
    } finally { mock.mock.restore(); }
  }
});

test("replaying an already recorded payment cannot add rewards, points or founder updates", async t => {
  const queries: string[] = [];
  t.mock.method(db, "transaction", async (callback: any) => callback({ execute: async (statement: any) => {
    const q = dialect.sqlToQuery(statement); queries.push(q.sql);
    return { rows: [{ user_id: "player", fulfillment_status: "fulfilled" }] };
  } }));
  const result = await fulfillStripePurchase(checkout(COIN_PACKAGES[5]));
  assert.equal(result.status, "already_fulfilled");
  assert.equal(queries.length, 2);
  assert.match(queries[0], /ON CONFLICT \(stripe_session_id\) DO NOTHING/);
  assert.match(queries[1], /FOR UPDATE/);
});

test("an ambiguous bonus pet rejects the transaction before rewards or progress are written", async t => {
  const queries: string[] = [];
  t.mock.method(db, "transaction", async (callback: any) => callback({ execute: async (statement: any) => {
    const q = dialect.sqlToQuery(statement); queries.push(q.sql);
    if (q.sql.includes("fulfillment_status FROM")) return { rows: [{ user_id: "player", fulfillment_status: "processing" }] };
    if (q.sql.includes("FROM users")) return { rows: [{ id: "player" }] };
    if (q.sql.includes("FROM shop_items")) return { rows: [{ id: "one" }, { id: "two" }] };
    return { rows: [] };
  } }));
  await assert.rejects(fulfillStripePurchase(checkout(COIN_PACKAGES[4])), /ambiguously/);
  assert.ok(queries.every(sql => !/INSERT INTO reward|INSERT INTO purchase_monthly_progress|UPDATE coin_purchases/.test(sql)));
});
