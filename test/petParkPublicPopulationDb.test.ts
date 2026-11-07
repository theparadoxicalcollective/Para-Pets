import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { db } from "../server/db";
import {
  visibleOtherParkOutdoorIds, PARK_PUBLIC_OUTDOOR_OWNER_BUDGET,
  PARK_ACTIVE_PRESENCE_MS,
} from "../server/petPark/publicOutdoorPopulation";

/** Runs against disposable, isolated CI Postgres tables. This exercises the
 * actual Drizzle DISTINCT ON / window-count / presence / limit query, instead
 * of merely checking source strings or testing a second JS implementation. */
test("Park public roster: first displayed slot, inactive eviction and bounded active owners", {
  skip: !process.env.PURCHASE_TEST_DATABASE_URL,
}, async () => {
  const schema = "park_population_" + randomUUID().replaceAll("-", "");
  const url = process.env.PURCHASE_TEST_DATABASE_URL!;
  const setup = new pg.Pool({ connectionString: url });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    await pool.query(`
      CREATE TABLE pet_park_deposits (
        id varchar PRIMARY KEY, user_id varchar NOT NULL, slot_number integer NOT NULL,
        show_in_park boolean NOT NULL DEFAULT false, building_id varchar,
        park_x_pct real, park_y_pct real, withdrawn_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      );
      CREATE TABLE pet_park_presence (
        user_id varchar PRIMARY KEY, last_seen_at timestamp NOT NULL
      );
    `);
    const database = drizzle(pool) as unknown as typeof db;
    const now = new Date("2026-11-07T19:00:00.000Z");
    const activeSince = new Date(now.getTime() - PARK_ACTIVE_PRESENCE_MS);
    const visible = async () => {
      const query = visibleOtherParkOutdoorIds(database, "viewer", activeSince);
      return (await query).map(row => row.id);
    };

    const add = async (id: string, owner: string, slot: number,
      display = true, building: string | null = null, withdrawn = false) => {
      await pool.query(`INSERT INTO pet_park_deposits
        (id,user_id,slot_number,show_in_park,building_id,park_x_pct,park_y_pct,withdrawn_at)
        VALUES ($1,$2,$3,$4,$5,0.5,0.5,$6)`,
      [id, owner, slot, display, building, withdrawn ? now : null]);
    };
    const present = async (id: string, lastSeen: Date) =>
      pool.query(`INSERT INTO pet_park_presence(user_id,last_seen_at) VALUES ($1,$2)
        ON CONFLICT(user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at`, [id, lastSeen]);

    // Small park: an inactive owner's first placed pet is still shown. An
    // equipped-but-idle slot 1 is private; slot 2 can represent that owner.
    await add("viewer-1", "viewer", 1);
    await add("viewer-2", "viewer", 2);
    await add("a-idle-1", "a", 1, false);
    await add("a-outdoor-2", "a", 2);
    await add("b-outdoor-1", "b", 1);
    await add("b-outdoor-2", "b", 2);
    await add("c-indoor-1", "c", 1, true, "cottage");
    await add("c-outdoor-2", "c", 2);
    await add("d-withdrawn-1", "d", 1, true, null, true);
    await add("d-outdoor-2", "d", 2);
    await add("e-unplaced-1", "e", 1, true);
    await pool.query("UPDATE pet_park_deposits SET park_x_pct=NULL WHERE id='e-unplaced-1'");
    await present("b", new Date(now.getTime() - 24 * 60 * 60_000));
    assert.deepEqual((await visible()).sort(),
      ["a-outdoor-2", "b-outdoor-1", "c-outdoor-2", "d-outdoor-2"].sort(),
      "uncrowded park includes inactive owners, excludes viewers, idle and indoor pets");

    // Cross the budget using many inactive owners. Only recent park visitors
    // now appear, and missing presence never counts as active.
    const many = PARK_PUBLIC_OUTDOOR_OWNER_BUDGET + 6;
    for (let i = 1; i <= many; i++) {
      await add(`crowd-${i}-1`, `crowd-${i}`, 1);
      await add(`crowd-${i}-2`, `crowd-${i}`, 2);
    }
    await present("a", new Date(now.getTime() - 1000));
    await present("b", new Date(now.getTime() - 2 * 60_000));
    await present("crowd-1", new Date(now.getTime() - 3 * 60_000));
    await present("crowd-2", new Date(now.getTime() - 30 * 60_000));
    const crowded = await visible();
    assert.deepEqual(crowded.sort(), ["a-outdoor-2", "b-outdoor-1", "crowd-1-1"].sort(),
      "crowded view suppresses inactive owner pets but retains recent visitors");

    // More active owners than the budget: newest activity wins. Showing only
    // their first slot saves expensive pet art/costume rendering on phones.
    for (let i = 1; i <= many; i++) {
      await present(`crowd-${i}`, new Date(now.getTime() - (many - i) * 1000));
    }
    const newest = await visible();
    assert.equal(newest.length, PARK_PUBLIC_OUTDOOR_OWNER_BUDGET);
    assert.equal(newest.includes("crowd-46-1"), true, "newest owner is visible");
    assert.equal(newest.includes("crowd-1-1"), false, "oldest owner is trimmed at capacity");
    assert.equal(newest.some(id => /-2$/.test(id) && id.startsWith("crowd-")), false,
      "a second outdoor pet from an owner never consumes another slot");
    assert.equal(newest.some(id => id.startsWith("viewer")), false);
    const all = await pool.query("SELECT count(*)::int AS total FROM pet_park_deposits");
    assert.equal(all.rows[0].total, 11 + many * 2,
      "public visibility changes are read-only and leave all deposits intact");
  } finally {
    await pool.end();
    await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await setup.end();
  }
});
