import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";

/**
 * This executes the ACTUAL SQL source of the two startup migrations against
 * PostgreSQL (the same PostgreSQL 16 service used by CI). A TypeScript build
 * and regex-only tests do not detect invalid PL/pgSQL DO-dollar quotes.
 *
 * Each scenario uses a transaction-local schema and ROLLBACK. Never run
 * this test against a production database.
 */
const purchaseDb = process.env.PURCHASE_TEST_DATABASE_URL;
function migrationSQL(path: string) {
  const source = readFileSync(path, "utf8");
  const match = source.match(/await db\.execute\(sql`([\s\S]*?)`\);/);
  assert.ok(match, "Cannot extract migration SQL from " + path);
  assert.doesNotMatch(match[1], /\$\{/,"Migration contains dynamic interpolation; update this SQL test");
  return match[1];
}

const clothing = migrationSQL("server/startup/migrations/ensurePlayerClothingStorage.ts");
const equipment = migrationSQL("server/startup/migrations/ensurePlayerAvatarEquipmentStorage.ts");

test("avatar startup SQL runs on PostgreSQL for both existing and fresh databases",{
  skip: !purchaseDb && "Requires CI PURCHASE_TEST_DATABASE_URL (isolated test Postgres)",
},async()=>{
  for(const existing of [true,false]){
    const client = new Client({ connectionString: purchaseDb });
    await client.connect();
    try{
      await client.query("BEGIN");
      const schema = "avatar_migration_" + randomUUID().replaceAll("-","");
      await client.query('CREATE SCHEMA "'+schema+'"');
      await client.query('SET LOCAL search_path TO "'+schema+'"');
      // Required foreign-key targets; no production player/account tables.
      await client.query(`
        CREATE TABLE player_character_bases (id varchar PRIMARY KEY);
        CREATE TABLE shop_items (id varchar PRIMARY KEY, type text, description text);
        CREATE TABLE users (id varchar PRIMARY KEY);
        CREATE TABLE user_inventory (id varchar PRIMARY KEY);
      `);
      if(existing){
        await client.query(`
          CREATE TABLE player_clothing_drafts (
            id varchar PRIMARY KEY,
            base_id varchar NOT NULL,
            base_published_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            name text NOT NULL,
            category text NOT NULL CHECK (category IN ('head','hair','face','top','bottom','shoes','back')),
            published_segments jsonb,
            shop_item_id varchar,
            revision integer NOT NULL DEFAULT 0
          );
          CREATE TABLE player_avatar_profiles (user_id varchar PRIMARY KEY);
          CREATE TABLE player_avatar_equipment (
            user_id varchar NOT NULL,
            category text NOT NULL CHECK (category IN ('head','hair','face','top','bottom','shoes','back')),
            inventory_id varchar NOT NULL,
            CONSTRAINT player_avatar_equipment_owner_category_uidx UNIQUE (user_id,category)
          );
          INSERT INTO player_clothing_drafts (id,base_id,name,category)
          VALUES ('old-shirt','base1','Old Shirt','top');
          INSERT INTO player_avatar_equipment (user_id,category,inventory_id)
          VALUES ('existing-player','shoes','old-boots');
        `);
      }
      // These statements execute exactly as they do at startup, rather than
      // checking for particular string patterns.
      await client.query(clothing);
      await client.query(equipment);
      await client.query("INSERT INTO player_character_bases (id) VALUES ('base1')");
      await client.query("INSERT INTO users (id) VALUES ('new-player')");
      await client.query("INSERT INTO user_inventory (id) VALUES ('new-accessory-inventory')");
      if(!existing) {
        await client.query(`
          INSERT INTO player_avatar_profiles (user_id,base_id,base_published_at,base_parts)
          VALUES ('new-player','base1',CURRENT_TIMESTAMP,'[]'::jsonb)
        `);
      }
      await client.query(`
        INSERT INTO player_clothing_drafts (id,base_id,base_published_at,name,category)
        VALUES ('new-accessory','base1',CURRENT_TIMESTAMP,'New Accessory','accessories')
      `);
      await client.query(`
        INSERT INTO player_avatar_equipment (user_id,category,inventory_id)
        VALUES ('new-player','accessories','new-accessory-inventory')
      `);
      const [drafts,items] = await Promise.all([
        client.query("SELECT category FROM player_clothing_drafts ORDER BY category"),
        client.query("SELECT category FROM player_avatar_equipment ORDER BY category"),
      ]);
      assert.ok(drafts.rows.some(x=>x.category==="accessories"));
      assert.ok(items.rows.some(x=>x.category==="accessories"));
      if(existing){
        assert.ok(drafts.rows.some(x=>x.category==="top"));
        assert.ok(items.rows.some(x=>x.category==="shoes"));
      }
      // Re-run both migrations: no duplicate constraints, no data loss.
      await client.query(clothing);
      await client.query(equipment);
      assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM player_clothing_drafts")).rows[0].count,
        existing?2:1);
    }finally{
      await client.query("ROLLBACK").catch(()=>{});
      await client.end();
    }
  }
});
