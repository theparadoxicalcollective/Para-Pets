import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { getTableColumns } from "drizzle-orm";
import { userInventory } from "../shared/schema";
import { db } from "../server/db";
import { registerGardenPlayerRoutes } from "../server/routes/gardenPlayer.routes";
import { registerGardenRefillRoutes } from "../server/routes/gardenRefill.routes";

// The normal CI verify job supplies a disposable Postgres 16 service. A
// private schema lets these tests execute actual Drizzle queries, row locks,
// foreign-looking inventory IDs, rollbacks and concurrent HTTP handler calls
// without ever touching Railway or another test suite's tables.
test("Garden server: real Postgres ownership, serial taps, escrow, cooldown, harvest and refill", {
  skip: !process.env.PURCHASE_TEST_DATABASE_URL,
}, async () => {
  const url = process.env.PURCHASE_TEST_DATABASE_URL!;
  const schema = "garden_pr2_" + randomUUID().replaceAll("-", "");
  const setupPool = new pg.Pool({ connectionString: url });
  await setupPool.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 5 });
  try {
    await pool.query(`
      CREATE TABLE users (
        id varchar PRIMARY KEY, is_admin boolean NOT NULL DEFAULT false,
        is_moderator boolean NOT NULL DEFAULT false
      );
      CREATE TABLE pet_park_settings (
        id varchar PRIMARY KEY, enabled_for_players boolean NOT NULL DEFAULT false,
        enabled_for_moderators boolean NOT NULL DEFAULT false
      );
      CREATE TABLE pet_park_scene_items (
        id varchar PRIMARY KEY, kind text NOT NULL, effect_type text,
        x_pct real NOT NULL DEFAULT 0.5, y_pct real NOT NULL DEFAULT 0.5,
        size integer NOT NULL DEFAULT 150,
        is_water_source boolean NOT NULL DEFAULT false
      );
      CREATE TABLE shop_items (
        id varchar PRIMARY KEY, name text NOT NULL, type text NOT NULL,
        image_url text, special_type text, special_amount integer,
        is_refillable boolean NOT NULL DEFAULT false
      );
      CREATE TABLE clearing_shop_purchases (id varchar PRIMARY KEY, inventory_id varchar);
      CREATE TABLE garden_crops (
        id varchar PRIMARY KEY, seed_item_id varchar NOT NULL, fruit_item_id varchar NOT NULL,
        planted_image_url text, seedling_image_url text, partial_image_url text,
        grown_image_url text, picked_image_url text,
        stage_placements jsonb NOT NULL DEFAULT '{}'::jsonb,
        planted_drops integer NOT NULL,
        seedling_drops integer NOT NULL, partial_drops integer NOT NULL,
        grown_drops integer NOT NULL, created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE garden_player_plots (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL,
        plot_item_id varchar NOT NULL, crop_id varchar, phase text NOT NULL DEFAULT 'empty',
        water_applied integer NOT NULL DEFAULT 0, harvest_ready boolean NOT NULL DEFAULT false,
        picked_until timestamp, passive_growth_at timestamp,
        updated_at timestamp NOT NULL DEFAULT now(),
        UNIQUE(user_id, plot_item_id)
      );
      CREATE TABLE garden_action_receipts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL,
        request_id varchar NOT NULL, plot_item_id varchar NOT NULL, action text NOT NULL,
        inventory_id varchar NOT NULL, result jsonb NOT NULL, created_at timestamp DEFAULT now(),
        UNIQUE(user_id, request_id)
      );
    `);
    // A Drizzle INSERT includes DEFAULT for every shared inventory column,
    // even for fields unrelated to gardens. Generate the test table from
    // the actual column metadata instead of maintaining an incomplete copy.
    const inventoryColumns = Object.values(getTableColumns(userInventory)).map(column => {
      if (column.name === "id") return '"id" varchar PRIMARY KEY DEFAULT gen_random_uuid()';
      if (column.name === "is_listed") return '"is_listed" boolean NOT NULL DEFAULT false';
      if (column.name === "quantity") return '"quantity" integer NOT NULL DEFAULT 1 CHECK (quantity >= 0)';
      if (column.name === "acquired_at") return '"acquired_at" timestamp NOT NULL DEFAULT now()';
      return `"${column.name}" ${column.getSQLType()}`;
    });
    await pool.query(`CREATE TABLE user_inventory (${inventoryColumns.join(", ")})`);
    await pool.query(`
      INSERT INTO users (id) VALUES ('alice'),('bob');
      INSERT INTO pet_park_settings(id) VALUES ('main');
      INSERT INTO pet_park_scene_items(id,kind,effect_type,is_water_source) VALUES
        ('plot1','terrain','garden_plot',false),
        ('path1','terrain','dirt_path',false),
        ('fountain','decor',null,true),
        ('plain-decor','decor',null,false);
      INSERT INTO shop_items(id,name,type,image_url,special_type,special_amount,is_refillable) VALUES
        ('hoe','Hoe','garden_tool','/hoe.png','hoe',null,false),
        ('scythe','Scythe','garden_tool','/scythe.png','scythe',null,false),
        ('pail','Watering Pail','garden_tool','/pail.png','watering_pail',100,true),
        ('seed','Marsh Seed','garden_seed','/seed.png',null,null,false),
        ('fruit','Marsh Berry','garden_fruit','/fruit.png',null,null,false),
        ('fake','Fake Item','garden_tool','/fake.png','hoe',null,true);
      INSERT INTO user_inventory (id,user_id,shop_item_id,quantity,garden_water_left,is_listed) VALUES
        ('alice-hoe','alice','hoe',1,null,false),
        ('alice-seed','alice','seed',2,null,false),
        ('alice-pail','alice','pail',1,100,false),
        ('alice-scythe','alice','scythe',1,null,false),
        ('bob-hoe','bob','hoe',1,null,false),
        ('bob-seed','bob','seed',1,null,false),
        ('alice-listed','alice','seed',3,null,true),
        ('alice-fruit-listed','alice','fruit',5,null,true),
        ('alice-fake','alice','fake',1,0,false);
      INSERT INTO garden_crops (id,seed_item_id,fruit_item_id,
        planted_image_url,seedling_image_url,partial_image_url,grown_image_url,picked_image_url,
        planted_drops,seedling_drops,partial_drops,grown_drops)
      VALUES ('crop1','seed','fruit','/planted.png','/seedling.png','/partial.png',
        '/grown.png','/picked.png',17,9,12,5);
    `);
    const database = drizzle(pool, { schema: (await import("../shared/schema")) }) as typeof db;
    const handlers = new Map<string, (req: any, res: any) => Promise<any>>();
    const app = {
      get(path: string, ...args: any[]) { handlers.set("GET " + path, args.at(-1)); },
      post(path: string, ...args: any[]) { handlers.set("POST " + path, args.at(-1)); },
    };
    const auth = (() => {}) as any;
    let now = Date.parse("2026-11-06T12:00:00.000Z");
    registerGardenPlayerRoutes(app as any, auth, database, () => .8, () => new Date(now));
    registerGardenRefillRoutes(app as any, auth, database);
    async function request(path: string, params: Record<string, string> = {},
      body: Record<string, unknown> = {}, userId = "alice") {
      const handler = handlers.get(path);
      assert.ok(handler, path);
      const response = {
        statusCode: 200, payload: null as any,
        status(code: number) { this.statusCode = code; return this; },
        json(payload: any) { this.payload = payload; return this; },
      };
      await handler({ user: { id: userId }, params, body }, response);
      return response;
    }
    const path = (action: string) => "POST /api/pet-park/garden/plots/:plotId/" + action;
    const itemCount = async (id: string) =>
      Number((await pool.query("SELECT COALESCE(SUM(quantity),0)::int AS n FROM user_inventory WHERE id = $1", [id])).rows[0]?.n ?? 0);
    const charges = async () =>
      Number((await pool.query("SELECT garden_water_left AS n FROM user_inventory WHERE id = 'alice-pail'")).rows[0]?.n);
    const key = () => randomUUID();

    const blocked = await request(path("hoe"), { plotId: "plot1" },
      { requestId: key(), inventoryId: "alice-hoe" });
    assert.equal(blocked.statusCode, 403, "park disabled means no writes");
    await pool.query("UPDATE pet_park_settings SET enabled_for_players = true WHERE id = 'main'");

    const initial = await request("GET /api/pet-park/garden");
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.payload.plots.length, 1, "only real admin-stamped garden plots");
    assert.equal(initial.payload.plots[0].phase, "empty");
    assert.equal(initial.payload.crops.length, 1, "image-complete crops only");

    const fake = await request(path("hoe"), { plotId: "path1" },
      { requestId: key(), inventoryId: "alice-hoe" });
    assert.equal(fake.statusCode, 404, "paths cannot be converted into garden plots");
    const notOwned = await request(path("hoe"), { plotId: "plot1" },
      { requestId: key(), inventoryId: "bob-hoe" });
    assert.equal(notOwned.statusCode, 422, "another account's hoe cannot be used");

    const hoeId = key();
    const hoe = await request(path("hoe"), { plotId: "plot1" },
      { requestId: hoeId, inventoryId: "alice-hoe" });
    assert.equal(hoe.statusCode, 200);
    assert.equal(hoe.payload.plot.phase, "tilled");
    const hoeAgain = await request(path("hoe"), { plotId: "plot1" },
      { requestId: hoeId, inventoryId: "alice-hoe" });
    assert.equal(hoeAgain.statusCode, 200);
    assert.equal(hoeAgain.payload.replayed, true);
    const mismatched = await request(path("plant"), { plotId: "plot1" },
      { requestId: hoeId, inventoryId: "alice-seed" });
    assert.equal(mismatched.statusCode, 409, "a request ID cannot be reused for another action");

    const planting = await request(path("plant"), { plotId: "plot1" },
      { requestId: key(), inventoryId: "alice-listed" });
    assert.equal(planting.statusCode, 422, "listed market escrow cannot be planted");
    const plantId = key();
    const plant = await request(path("plant"), { plotId: "plot1" },
      { requestId: plantId, inventoryId: "alice-seed" });
    assert.equal(plant.statusCode, 200);
    assert.equal(plant.payload.plot.phase, "planted");
    assert.equal(plant.payload.remainingQuantity, 1);
    assert.equal(await itemCount("alice-seed"), 1);
    assert.equal((await request(path("plant"), { plotId: "plot1" },
      { requestId: plantId, inventoryId: "alice-seed" })).payload.replayed, true);
    assert.equal(await itemCount("alice-seed"), 1, "plant retry did not debit twice");

    const waterId = key();
    const [firstWater, firstWaterReplay] = await Promise.all([
      request(path("water"), { plotId: "plot1" }, { requestId: waterId, inventoryId: "alice-pail" }),
      request(path("water"), { plotId: "plot1" }, { requestId: waterId, inventoryId: "alice-pail" }),
    ]);
    assert.equal(firstWater.statusCode, 200);
    assert.equal(firstWaterReplay.statusCode, 200);
    assert.equal(firstWater.payload.waterUsed, 10, "one watering pours ten actual drops");
    assert.equal(firstWater.payload.plot.phase, "planted", "a large stage may need multiple pours");
    assert.equal(firstWater.payload.plot.waterApplied, 10);
    assert.equal(firstWaterReplay.payload.waterUsed, 10);
    assert.equal((await charges()), 90, "concurrent duplicate requests charge the ten drops only once");
    // No batch can spill into the next stage, and the pail never loses
    // more than that stage needed, even when ten drops were available.
    for (const [expected, used, progress] of [
      ["seedling", 7, 0],
      ["partial", 9, 0],
      ["partial", 10, 10],
      ["grown", 2, 0],
      ["grown", 5, 5],
    ] as const) {
      const watered = await request(path("water"), { plotId: "plot1" },
        { requestId: key(), inventoryId: "alice-pail" });
      assert.equal(watered.statusCode, 200);
      assert.equal(watered.payload.plot.phase, expected);
      assert.equal(watered.payload.plot.waterApplied, progress);
      assert.equal(watered.payload.waterUsed, used);
    }
    assert.equal(await charges(), 57, "total 43 drops equals four admin-authored stage requirements");
    const ready = await request("GET /api/pet-park/garden");
    assert.equal(ready.payload.plots[0].harvestReady, true);
    const overwater = await request(path("water"), { plotId: "plot1" },
      { requestId: key(), inventoryId: "alice-pail" });
    assert.equal(overwater.statusCode, 409);
    assert.equal(await charges(), 57, "ready crops don't consume extra drops");

    const harvestId = key();
    const [harvest, duplicateHarvest] = await Promise.all([
      request(path("harvest"), { plotId: "plot1" }, { requestId: harvestId, inventoryId: "alice-scythe" }),
      request(path("harvest"), { plotId: "plot1" }, { requestId: harvestId, inventoryId: "alice-scythe" }),
    ]);
    assert.equal(harvest.statusCode, 200);
    assert.equal(duplicateHarvest.statusCode, 200);
    assert.deepEqual(harvest.payload.reward, { fruitItemId: "fruit", quantity: 2 });
    assert.equal((await pool.query("SELECT COALESCE(SUM(quantity),0)::int AS n FROM user_inventory WHERE user_id='alice' AND shop_item_id='fruit' AND is_listed=false")).rows[0].n, 2);
    assert.equal(await itemCount("alice-fruit-listed"), 5, "fruit escrow unchanged");
    assert.equal((await request(path("harvest"), { plotId: "plot1" },
      { requestId: key(), inventoryId: "alice-scythe" })).statusCode, 409,
    "new requests cannot harvest a picked plot");
    assert.equal((await request("GET /api/pet-park/garden")).payload.plots[0].phase, "picked");
    now += 30_000;
    assert.equal((await request("GET /api/pet-park/garden")).payload.plots[0].phase, "empty",
      "server clock, not client clock, releases the 30-second picked cooldown");

    const bob = await request("GET /api/pet-park/garden", {}, {}, "bob");
    assert.equal(bob.payload.plots[0].phase, "empty", "per-user plots never leak");
    const bobHoe = await request(path("hoe"), { plotId: "plot1" },
      { requestId: key(), inventoryId: "bob-hoe" }, "bob");
    assert.equal(bobHoe.statusCode, 200);
    assert.equal((await request("GET /api/pet-park/garden")).payload.plots[0].phase, "empty",
      "another user can hoe the same physical plot independently");

    const refill = await request("POST /api/pet-park/water-sources/:sourceId/refill",
      { sourceId: "fountain" }, { inventoryId: "alice-pail" });
    assert.equal(refill.statusCode, 200);
    assert.equal(refill.payload.waterLeft, 100);
    assert.equal((await request("POST /api/pet-park/water-sources/:sourceId/refill",
      { sourceId: "fountain" }, { inventoryId: "alice-pail" })).statusCode, 409);
    const fakeRefill = await request("POST /api/pet-park/water-sources/:sourceId/refill",
      { sourceId: "fountain" }, { inventoryId: "alice-fake" });
    assert.equal(fakeRefill.statusCode, 422, "refillable non-pail items cannot gain water");
    assert.equal((await request("POST /api/pet-park/water-sources/:sourceId/refill",
      { sourceId: "plain-decor" }, { inventoryId: "alice-pail" })).statusCode, 404);

    const receiptCount = Number((await pool.query("SELECT count(*)::int AS n FROM garden_action_receipts WHERE user_id='alice'")).rows[0].n);
    assert.equal(receiptCount, 9, "only successful unique mutations have committed receipts");

    // Server-clock accelerated time: natural progression is resolved on GET
    // (no background job or untrusted client clock), then incorporated into
    // the next serial, idempotent watering/harvest transaction.
    await pool.query("INSERT INTO pet_park_scene_items(id,kind,effect_type) VALUES ('plot2','terrain','garden_plot')");
    const plot2 = { plotId: "plot2" };
    assert.equal((await request(path("hoe"), plot2,
      { requestId: key(), inventoryId: "alice-hoe" })).statusCode, 200);
    assert.equal((await request(path("plant"), plot2,
      { requestId: key(), inventoryId: "alice-seed" })).payload.plot.phase, "planted");
    const getPlot2 = async () => (await request("GET /api/pet-park/garden")).payload.plots.find(
      (plot: { plotItemId: string }) => plot.plotItemId === "plot2");
    const startingWater = await charges();
    now += 59 * 60_000;
    assert.equal((await getPlot2()).waterApplied, 0, "59 minutes adds nothing");
    now += 60_000;
    assert.equal((await getPlot2()).waterApplied, 1, "one hour adds one passive stage unit");
    now += 2 * 3_600_000;
    assert.equal((await getPlot2()).waterApplied, 3);
    assert.equal(await charges(), startingWater, "natural growth never spends equipment water");
    const poured = await request(path("water"), plot2,
      { requestId: key(), inventoryId: "alice-pail" });
    assert.equal(poured.statusCode, 200);
    assert.equal(poured.payload.waterUsed, 10);
    assert.equal(poured.payload.plot.waterApplied, 13);
    now += 3_600_000;
    assert.equal((await getPlot2()).waterApplied, 14,
      "watering cannot reset the natural-growth hour checkpoint");
    now += 3 * 3_600_000;
    assert.equal((await getPlot2()).phase, "seedling",
      "passive growth crosses the first saved stage requirement");
    now += 26 * 3_600_000;
    const ripe = await getPlot2();
    assert.equal(ripe.phase, "grown");
    assert.equal(ripe.harvestReady, true);
    assert.equal(await charges(), startingWater - 10, "26 offline hours spent no pail water");
    const reaped = await request(path("harvest"), plot2,
      { requestId: key(), inventoryId: "alice-scythe" });
    assert.equal(reaped.statusCode, 200, "scythe is still required after natural ripening");
    assert.deepEqual(reaped.payload.reward, { fruitItemId: "fruit", quantity: 2 });
    assert.equal((await getPlot2()).phase, "picked");

  } finally {
    await pool.end();
    await setupPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await setupPool.end();
  }
});
