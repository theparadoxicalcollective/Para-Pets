import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../server/db";
import { fulfillStripePurchase } from "../server/payments/fulfillStripePurchase";
import { COIN_PACKAGES } from "../server/payments/config";

// Dedicated disposable CI database only. Never fall back to the game's DATABASE_URL.
const connectionString = process.env.PURCHASE_TEST_DATABASE_URL;
test("PostgreSQL purchase fulfillment with the existing partial founder index", {
  skip: !connectionString && "Set PURCHASE_TEST_DATABASE_URL to a disposable PostgreSQL database",
}, async t => {
  const pool = new pg.Pool({ connectionString, max: 4 });
  const schema = `purchase_test_${randomUUID().replaceAll("-", "")}`;
  const dialect = new PgDialect();
  await pool.query(`CREATE SCHEMA ${schema}`);
  const query = async (sql: string, params: unknown[] = []) => {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`);
      return await client.query(sql, params);
    } finally { client.release(); }
  };
  const snapshot = async () => {
    const result: Record<string, unknown> = {};
    for (const table of ["coin_purchases", "reward_bundles", "reward_bundle_items", "user_rewards", "purchase_monthly_progress", "founders"]) {
      result[table] = (await query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
    }
    return result;
  };
  const mock = t.mock.method(db, "transaction", async (callback: any) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO ${schema}`);
      const result = await callback({ execute: (statement: any) => {
        const q = dialect.sqlToQuery(statement);
        return client.query(q.sql, q.params);
      } });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });
  try {
    await query(`
      CREATE TABLE users (id text PRIMARY KEY, username text, is_admin boolean DEFAULT false);
      CREATE TABLE shop_items (id text PRIMARY KEY, name text, type text);
      CREATE TABLE coin_purchases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text REFERENCES users(id),
        amount_usd int, coins_received int, stripe_session_id text UNIQUE,
        stripe_payment_intent_id text, stripe_event_id text, package_id text,
        amount_cents int, currency text, fulfillment_status text,
        updated_at timestamp, fulfilled_at timestamp, result_metadata jsonb
      );
      CREATE TABLE reward_bundles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, coin_amount int, message text);
      CREATE TABLE reward_bundle_items (bundle_id uuid REFERENCES reward_bundles(id), shop_item_id text REFERENCES shop_items(id));
      CREATE TABLE user_rewards (user_id text REFERENCES users(id), bundle_id uuid REFERENCES reward_bundles(id));
      CREATE TABLE user_contribution_cycles (user_id text PRIMARY KEY, cycle int);
      CREATE TABLE purchase_monthly_progress (user_id text, month_year text, points int, PRIMARY KEY(user_id, month_year));
      CREATE TABLE founders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, user_id text, tier text, added_by text);
      CREATE UNIQUE INDEX uq_founders_user_id ON founders(user_id) WHERE user_id IS NOT NULL;
      INSERT INTO users VALUES ('buyer', 'Buyer', false), ('neighbor', 'Neighbor', false), ('admin', 'Admin', true);
      INSERT INTO user_contribution_cycles VALUES ('buyer', 3);
    `);
    for (const pack of COIN_PACKAGES) {
      if (pack.eggBonus) await query("INSERT INTO shop_items VALUES ($1, $2, 'pet')", [`pet-${pack.id}`, pack.eggBonus.shopItemName]);
    }
    // Demonstrate the production error on precisely the deployed index shape.
    await assert.rejects(query(`INSERT INTO founders (user_id, tier) VALUES ('buyer', 'bronze')
      ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier`),
    (error: any) => error.code === "42P10");

    const checkout = (index: number, id: string) => ({
      id, payment_status: "paid", status: "complete", currency: "usd",
      amount_total: COIN_PACKAGES[index].priceUsd * 100,
      metadata: { userId: "buyer", packId: COIN_PACKAGES[index].id },
    });
    const expected = [[133, 100, 0], [1330, 500, 0], [3325, 1000, 0], [9975, 2500, 50], [26600, 5000, 100], [66500, 10000, 500]];
    let points = 0;
    for (const [index, pack] of COIN_PACKAGES.entries()) {
      const session = checkout(index, `cs_package_${index}`);
      assert.equal((await fulfillStripePurchase(session)).status, "fulfilled");
      const purchase = (await query("SELECT * FROM coin_purchases WHERE stripe_session_id = $1", [session.id])).rows[0];
      const [coins, addedPoints, communityCoins] = expected[index];
      points += addedPoints;
      assert.equal(purchase.fulfillment_status, "fulfilled");
      assert.equal(purchase.coins_received, coins);
      assert.equal(purchase.result_metadata.communityCoins, communityCoins);
      const bundleId = purchase.result_metadata.purchaserRewardBundleId;
      assert.equal((await query("SELECT coin_amount FROM reward_bundles WHERE id = $1", [bundleId])).rows[0].coin_amount, coins);
      assert.deepEqual((await query("SELECT user_id FROM user_rewards WHERE bundle_id = $1", [bundleId])).rows, [{ user_id: "buyer" }]);
      assert.deepEqual((await query("SELECT shop_item_id FROM reward_bundle_items WHERE bundle_id = $1", [bundleId])).rows,
        pack.eggBonus ? [{ shop_item_id: `pet-${pack.id}` }] : []);
      assert.equal((await query("SELECT points FROM purchase_monthly_progress WHERE user_id = 'buyer' AND month_year = 'c-3'")).rows[0].points, points);
      const before = await snapshot();
      assert.equal((await fulfillStripePurchase(session)).status, "already_fulfilled");
      assert.deepEqual(await snapshot(), before);
    }
    assert.deepEqual((await query("SELECT tier FROM founders WHERE user_id = 'buyer'")).rows, [{ tier: "silver" }]);
    // A smaller purchase after qualification still fulfills without downgrading.
    await fulfillStripePurchase(checkout(0, "cs_small_existing_founder"));
    assert.equal((await query("SELECT tier FROM founders WHERE user_id = 'buyer'")).rows[0].tier, "silver");

    // Fail after reward/progress writes, prove rollback, then retry the same session.
    await query("ALTER TABLE founders ADD CONSTRAINT reject_gold CHECK (tier <> 'gold')");
    // Seed prior spending so the next $1 payment reaches exactly $500 lifetime.
    await query("INSERT INTO coin_purchases (user_id, amount_usd, stripe_session_id, fulfillment_status) VALUES ('buyer', 307, 'legacy_fixture', 'fulfilled')");
    const retrySession = checkout(0, "cs_retry_after_rollback");
    const beforeFailure = await snapshot();
    await assert.rejects(fulfillStripePurchase(retrySession), (error: any) => error.code === "23514");
    assert.deepEqual(await snapshot(), beforeFailure);
    await query("ALTER TABLE founders DROP CONSTRAINT reject_gold");
    const results = await Promise.all([fulfillStripePurchase(retrySession), fulfillStripePurchase(retrySession)]);
    assert.deepEqual(results.map(r => r.status).sort(), ["already_fulfilled", "fulfilled"]);
    assert.equal((await query("SELECT COUNT(*)::int AS count FROM coin_purchases WHERE stripe_session_id = $1", [retrySession.id])).rows[0].count, 1);
    assert.equal((await query("SELECT tier FROM founders WHERE user_id = 'buyer'")).rows[0].tier, "gold");
    assert.equal((await query("SELECT points FROM purchase_monthly_progress WHERE user_id = 'buyer'")).rows[0].points, points + 200);
  } finally {
    mock.mock.restore();
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
});
