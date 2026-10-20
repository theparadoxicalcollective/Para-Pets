import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { PgDialect } from "drizzle-orm/pg-core";
import { reconcileLegacyFishInventory } from "../server/legacyFishInventory";
import { fishBagItems, type FishBagRecord } from "../client/src/lib/fishBagInventory";

const connectionString = process.env.PURCHASE_TEST_DATABASE_URL;
test("legacy fish transfer preserves ownership, escrow, quantity, dates and repeat/concurrent safety", {
  skip: !connectionString && "Set PURCHASE_TEST_DATABASE_URL to a disposable PostgreSQL database",
}, async () => {
  const pool = new pg.Pool({ connectionString, max: 4 });
  const schema = `fish_test_${randomUUID().replaceAll("-", "")}`;
  const dialect = new PgDialect();
  await pool.query(`CREATE SCHEMA ${schema}`);
  const execute = async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${schema}`);
      const q = dialect.sqlToQuery(statement);
      return await client.query(q.sql, q.params);
    } finally { client.release(); }
  };
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE shop_items (id text PRIMARY KEY, type text, fishing_type text);
      CREATE TABLE user_inventory (id text PRIMARY KEY, user_id text, shop_item_id text, quantity int, is_listed boolean, acquired_at timestamp);
      CREATE TABLE player_market_listings (inventory_id text, status text);
      CREATE TABLE player_fish_inventory (id uuid DEFAULT gen_random_uuid(), user_id text, shop_item_id text, caught_at timestamp, in_aquarium boolean DEFAULT false, aquarium_slot text DEFAULT 'main');
      INSERT INTO shop_items VALUES ('fish','fishing','fish'),('pole','fishing','pole'),('item','item',NULL);
      INSERT INTO user_inventory VALUES
        ('stack','owner','fish',3,false,'2026-01-01'),
        ('single','owner','fish',1,false,'2026-01-02'),
        ('listed','owner','fish',2,true,'2026-01-01'),
        ('escrow','owner','fish',1,false,'2026-01-01'),
        ('other','other','fish',2,false,'2026-01-01'),
        ('pole','owner','pole',2,false,'2026-01-01'),
        ('item','owner','item',3,false,'2026-01-01'),
        ('zero','owner','fish',0,false,'2026-01-01');
      INSERT INTO player_market_listings VALUES ('escrow','active');
      INSERT INTO player_fish_inventory(user_id,shop_item_id,caught_at,in_aquarium,aquarium_slot)
      VALUES ('owner','fish','2025-01-01',true,'bayou');
    `);
    const beforeOther = (await client.query("SELECT * FROM user_inventory WHERE id NOT IN ('stack','single') ORDER BY id")).rows;
    await Promise.all([reconcileLegacyFishInventory({ execute }, "owner"), reconcileLegacyFishInventory({ execute }, "owner")]);
    await reconcileLegacyFishInventory({ execute }, "owner");
    assert.deepEqual((await client.query("SELECT * FROM user_inventory ORDER BY id")).rows, beforeOther);
    const fish = (await client.query("SELECT * FROM player_fish_inventory")).rows;
    assert.equal(fish.length, 5);
    assert.equal(fish.filter(f => f.in_aquarium && f.aquarium_slot === "bayou").length, 1);
    assert.equal(fish.filter(f => f.caught_at.toISOString().startsWith("2026-01-01")).length, 3);
    assert.equal(fish.filter(f => f.caught_at.toISOString().startsWith("2026-01-02")).length, 1);
    await client.query("INSERT INTO user_inventory VALUES ('rollback','owner','fish',2,false,'2026-01-03')");
    await client.query("ALTER TABLE player_fish_inventory ADD CONSTRAINT reject_new CHECK (caught_at <> '2026-01-03')");
    await assert.rejects(reconcileLegacyFishInventory({ execute }, "owner"));
    assert.equal((await client.query("SELECT quantity FROM user_inventory WHERE id='rollback'")).rows[0].quantity, 2);
    assert.equal((await client.query("SELECT * FROM player_fish_inventory")).rows.length, 5);
  } finally {
    client.release();
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
});

test("main bag uses the same unplaced fish copies as aquarium without losing quantity", () => {
  const record = { id: "one", shopItemId: "fish", caughtAt: "2026-01-01", inAquarium: false,
    item: { id: "fish", name: "Magma Minnow", starRarity: 3, imageUrl: "/fish.png" } } as FishBagRecord;
  const items = fishBagItems([record, { ...record, id: "two" }, { ...record, id: "tank", inAquarium: true }, { ...record, id: "missing", item: null }]);
  assert.equal(items.length, 2);
  assert.equal(items.reduce((sum, item) => sum + item.quantity, 0), 2);
  assert.deepEqual(items.map(item => item.inventoryId), ["one", "two"]);
  assert.equal(items[0].imageUrl, "/fish.png");
  assert.equal(items[0].fishingType, "fish");
});

test("fish acquisition refreshes the shared query and generic discard is hidden", () => {
  for (const path of ["client/src/components/GiftClaimModal.tsx", "client/src/components/ElysianClearingCombat.tsx"]) {
    assert.match(readFileSync(path, "utf8"), /invalidateQueries\(\{\s*queryKey:\s*\["\/api\/fishing\/inventory"\]/);
  }
  const bag = readFileSync("client/src/components/PetInventory.tsx", "utf8");
  assert.match(bag, /selectedItem\.fishingType !== "fish" && <div/);
  assert.match(bag, /item\.fishingType !== "fish"/);
  assert.match(bag, /\.\.\.fishBagItems\(fishInventory\)/);
});
