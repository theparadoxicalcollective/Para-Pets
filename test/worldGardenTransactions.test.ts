import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableColumns } from "drizzle-orm";
import { userInventory } from "../shared/schema";
import { db } from "../server/db";
import { registerWorldGardenRoutes } from "../server/routes/worldGarden.routes";
import { registerWorldGardenRefillRoutes } from "../server/routes/worldGardenRefill.routes";
import { gardenItemNeedsRefill } from "../shared/garden";

/**
 * An isolated PostgreSQL schema tests real row locks, shared pail debits,
 * idempotency, world-ID boundaries, and refill validation. No Railway data.
 */
test("World garden: same inventory across worlds, scoped plots and water sources", {
  skip: !process.env.PURCHASE_TEST_DATABASE_URL,
}, async () => {
  const schema = "world_garden_" + randomUUID().replaceAll("-", "");
  const bootstrap = new pg.Pool({ connectionString: process.env.PURCHASE_TEST_DATABASE_URL });
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({
    connectionString: process.env.PURCHASE_TEST_DATABASE_URL,
    options: `-c search_path=${schema}`, max: 6,
  });
  try {
    await pool.query(`
      CREATE TABLE users (id varchar PRIMARY KEY, is_admin boolean NOT NULL DEFAULT false);
      CREATE TABLE world_scene_placements (
        id varchar PRIMARY KEY, world_id text NOT NULL, kind text NOT NULL,
        effect_type text, x_pct real NOT NULL DEFAULT .5,
        y_pct real NOT NULL DEFAULT .5, size integer NOT NULL DEFAULT 150,
        is_water_source boolean NOT NULL DEFAULT false
      );
      CREATE TABLE shop_items (
        id varchar PRIMARY KEY, name text NOT NULL, type text NOT NULL,
        image_url text, special_type text, special_amount integer,
        is_refillable boolean NOT NULL DEFAULT false
      );
      CREATE TABLE garden_crops (
        id varchar PRIMARY KEY, seed_item_id varchar NOT NULL, fruit_item_id varchar NOT NULL,
        planted_image_url text, seedling_image_url text, partial_image_url text,
        grown_image_url text, picked_image_url text,
        stage_placements jsonb NOT NULL DEFAULT '{}'::jsonb,
        planted_drops integer NOT NULL, seedling_drops integer NOT NULL,
        partial_drops integer NOT NULL, grown_drops integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE world_garden_player_plots (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(), world_id text NOT NULL,
        user_id varchar NOT NULL, plot_item_id varchar NOT NULL, crop_id varchar,
        phase text NOT NULL DEFAULT 'empty', water_applied integer NOT NULL DEFAULT 0,
        harvest_ready boolean NOT NULL DEFAULT false, picked_until timestamp,
        passive_growth_at timestamp, updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE(user_id,world_id,plot_item_id)
      );
      CREATE TABLE world_garden_action_receipts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(), world_id text NOT NULL,
        user_id varchar NOT NULL, request_id varchar NOT NULL, plot_item_id varchar NOT NULL,
        action text NOT NULL, inventory_id varchar NOT NULL, result jsonb NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(), UNIQUE(user_id,request_id)
      );
      CREATE TABLE clearing_shop_purchases (id varchar PRIMARY KEY, inventory_id varchar);
    `);
    const inventoryColumns = Object.values(getTableColumns(userInventory)).map(column => {
      if (column.name === "id") return '"id" varchar PRIMARY KEY DEFAULT gen_random_uuid()';
      if (column.name === "is_listed") return '"is_listed" boolean NOT NULL DEFAULT false';
      if (column.name === "quantity") return '"quantity" integer NOT NULL DEFAULT 1 CHECK (quantity >= 0)';
      if (column.name === "acquired_at") return '"acquired_at" timestamp NOT NULL DEFAULT now()';
      return `"${column.name}" ${column.getSQLType()}`;
    });
    await pool.query(`CREATE TABLE user_inventory (${inventoryColumns.join(", ")})`);
    await pool.query(`
      INSERT INTO users (id,is_admin) VALUES ('admin',true),('visitor',false);
      INSERT INTO world_scene_placements(id,world_id,kind,effect_type,is_water_source) VALUES
        ('woods-plot','haunted_woods','terrain','garden_plot',false),
        ('swamp-plot','swamp','terrain','garden_plot',false),
        ('woods-path','haunted_woods','terrain','dirt_path',false),
        ('woods-spring','haunted_woods','decor',null,true),
        ('swamp-water','swamp','terrain','water_path',false),
        ('swamp-decor','swamp','decor',null,false);
      INSERT INTO shop_items(id,name,type,image_url,special_type,special_amount,is_refillable) VALUES
        ('hoe','Hoe','garden_tool','/hoe.png','hoe',null,false),
        ('scythe','Scythe','garden_tool','/scythe.png','scythe',null,false),
        ('pail','Watering Pail','garden_tool','/pail.png','watering_pail',100,true),
        ('seed','Garden Seed','garden_seed','/seed.png',null,null,false),
        ('fruit','Garden Fruit','garden_fruit','/fruit.png',null,null,false);
      INSERT INTO user_inventory(id,user_id,shop_item_id,quantity,garden_water_left,is_listed) VALUES
        ('owner-hoe','admin','hoe',1,null,false),
        ('owner-scythe','admin','scythe',1,null,false),
        ('owner-pail','admin','pail',1,100,false),
        ('owner-seeds','admin','seed',2,null,false),
        ('visitor-hoe','visitor','hoe',1,null,false);
      INSERT INTO garden_crops(id,seed_item_id,fruit_item_id,planted_image_url,seedling_image_url,
        partial_image_url,grown_image_url,picked_image_url,planted_drops,seedling_drops,partial_drops,grown_drops)
      VALUES ('crop','seed','fruit','/planted.png','/seedling.png','/partial.png',
        '/grown.png','/picked.png',2,2,2,2);
    `);
    const database = drizzle(pool, { schema: (await import("../shared/schema")) }) as typeof db;
    const handlers = new Map<string, (req: any, res: any) => Promise<unknown>>();
    const app = {
      get(path: string, ...handlersList: any[]) { handlers.set("GET " + path, handlersList.at(-1)); },
      post(path: string, ...handlersList: any[]) { handlers.set("POST " + path, handlersList.at(-1)); },
    };
    const middleware = ((_req: unknown, _res: unknown, next: () => void) => next()) as any;
    let now = Date.parse("2026-11-07T15:00:00.000Z");
    registerWorldGardenRoutes(app as any, middleware, database, () => .8, () => new Date(now));
    registerWorldGardenRefillRoutes(app as any, middleware, database);
    async function request(method: string, endpoint: string, worldId: string,
      params: Record<string, string> = {}, body: Record<string, unknown> = {}, userId = "admin") {
      const handler = handlers.get(method + " " + endpoint);
      assert.ok(handler, endpoint);
      const response = {
        statusCode: 200, payload: null as any,
        status(code: number) { this.statusCode = code; return this; },
        json(payload: any) { this.payload = payload; return this; },
      };
      await handler({ user: { id: userId }, params: { ...params, worldId }, body }, response);
      return response;
    }
    const base = "/api/admin/world-editor/:worldId";
    const action = (type: string, worldId: string, plotId: string, inventoryId: string, requestId = randomUUID()) =>
      request("POST", base + "/garden/plots/:plotId/" + type, worldId,
        { plotId }, { requestId, inventoryId });
    const fill = (worldId: string, sourceId: string, inventoryId = "owner-pail") =>
      request("POST", base + "/water-sources/:sourceId/refill", worldId, { sourceId }, { inventoryId });
    const waterLeft = async () => Number((await pool.query(
      "SELECT garden_water_left FROM user_inventory WHERE id='owner-pail'")).rows[0]?.garden_water_left);
    const seedsLeft = async () => Number((await pool.query(
      "SELECT COALESCE(SUM(quantity),0)::int AS total FROM user_inventory WHERE user_id='admin' AND shop_item_id='seed'")).rows[0]?.total);

    const denied = await request("GET", base + "/garden", "swamp", {}, {}, "visitor");
    assert.equal(denied.statusCode, 403, "unpublished worlds remain private");
    assert.equal((await request("GET", base + "/garden", "not_a_world")).statusCode, 404);
    assert.equal((await request("GET", base + "/garden", "haunted_woods")).payload.plots.length, 1);
    assert.equal((await request("GET", base + "/garden", "swamp")).payload.plots.length, 1);

    assert.equal((await action("hoe", "haunted_woods", "swamp-plot", "owner-hoe")).statusCode, 404,
      "cross-world plots must be rejected before inventory access");
    assert.equal((await action("hoe", "haunted_woods", "woods-path", "owner-hoe")).statusCode, 404);
    const hoeKey = randomUUID();
    assert.equal((await action("hoe", "haunted_woods", "woods-plot", "owner-hoe", hoeKey)).statusCode, 200);
    assert.equal((await action("hoe", "haunted_woods", "woods-plot", "owner-hoe", hoeKey)).payload.replayed, true);
    assert.equal((await action("hoe", "swamp", "swamp-plot", "owner-hoe", hoeKey)).statusCode, 409,
      "one request ID cannot be replayed against another world");
    assert.equal((await action("hoe", "swamp", "swamp-plot", "owner-hoe")).statusCode, 200);

    assert.equal((await action("plant", "haunted_woods", "woods-plot", "owner-seeds")).statusCode, 200);
    assert.equal(await seedsLeft(), 1, "planting in Haunted Woods charges shared seed inventory");
    assert.equal((await action("plant", "swamp", "swamp-plot", "owner-seeds")).statusCode, 200);
    assert.equal(await seedsLeft(), 0, "Bayou planting uses the SAME seed stack");
    assert.equal((await action("water", "haunted_woods", "woods-plot", "owner-pail")).statusCode, 200);
    assert.equal(await waterLeft(), 98);
    assert.equal((await action("water", "swamp", "swamp-plot", "owner-pail")).statusCode, 200);
    assert.equal(await waterLeft(), 96, "water used in another world remains depleted");

    const illegalSource = await fill("haunted_woods", "swamp-water");
    assert.equal(illegalSource.statusCode, 404);
    assert.equal((await fill("swamp", "swamp-decor")).statusCode, 404);
    assert.equal((await fill("haunted_woods", "woods-spring")).statusCode, 200);
    assert.equal(await waterLeft(), 100, "refill restores the same inventory row across worlds");
    assert.equal((await fill("haunted_woods", "woods-spring")).statusCode, 409,
      "full pails cannot be reset or mint an item");
    assert.equal((await action("water", "swamp", "swamp-plot", "owner-pail")).statusCode, 200);
    assert.equal(await waterLeft(), 98);

    for (let i = 0; i < 3; i++) {
      const response = await action("water", "haunted_woods", "woods-plot", "owner-pail");
      assert.equal(response.statusCode, 200);
    }
    const harvestKey = randomUUID();
    const harvest = await action("harvest", "haunted_woods", "woods-plot", "owner-scythe", harvestKey);
    assert.equal(harvest.statusCode, 200);
    assert.deepEqual(harvest.payload.reward, { fruitItemId: "fruit", quantity: 2 });
    assert.equal((await action("harvest", "haunted_woods", "woods-plot", "owner-scythe", harvestKey)).payload.replayed, true);
    const fruit = await pool.query(
      "SELECT COALESCE(SUM(quantity),0)::int AS total FROM user_inventory WHERE user_id='admin' AND shop_item_id='fruit' AND is_listed=false");
    assert.equal(fruit.rows[0].total, 2, "harvest credits the global player inventory once");
  } finally {
    await pool.end();
    await bootstrap.query(`DROP SCHEMA "${schema}" CASCADE`);
    await bootstrap.end();
  }
});

test("World garden refill and growth use the existing shared item contract", () => {
  assert.equal(gardenItemNeedsRefill({
    isRefillable: true, isListed: false, quantity: 1, gardenWaterLeft: 62,
  }), true);
  assert.equal(gardenItemNeedsRefill({
    isRefillable: true, isListed: false, quantity: 1, gardenWaterLeft: 100,
  }), false);
});
