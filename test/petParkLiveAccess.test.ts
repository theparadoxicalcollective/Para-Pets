import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { Express, Request, RequestHandler, Response } from "express";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { db } from "../server/db";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";
import { petParkDeposits, petParkSettings } from "../shared/schema";
import { claimablePetParkDurationMs, PET_PARK_BASE_REWARD_RATES } from "../shared/petParkAccrual";

const route = (url: string) => "/api/admin/pet-park/" + url;
const noRates = { coinsPerHour: 0, essencePerHour: 0, petXpPerHour: 0 };
const customRates = { coinsPerHour: 15, essencePerHour: 3, petXpPerHour: 70 };
const ratesOf = ({ coinsPerHour, essencePerHour, petXpPerHour }: typeof noRates) =>
  ({ coinsPerHour, essencePerHour, petXpPerHour });

function harness(database: typeof db) {
  const handlers = new Map<string, RequestHandler>();
  const isAdmin: RequestHandler = (_req, _res, next) => next();
  const app = Object.fromEntries(["get", "post", "patch", "delete", "put"].map(method => [
    method, (path: string, ...chain: RequestHandler[]) => {
      assert.equal(chain[0], isAdmin, path + " must require admin access");
      handlers.set(method + " " + path, chain[1]);
    },
  ])) as unknown as Express;
  registerPetParkAdminRoutes(app, { db: database, isAdmin, processWorldImage: async () => "" });
  return async (method: string, path: string, body?: unknown) => {
    const handler = handlers.get(method + " " + route(path));
    assert.ok(handler, "registered " + method + " " + path);
    let code = 200;
    let result: any;
    const headers: Record<string, string> = {};
    const res = {
      status: (status: number) => { code = status; return res; },
      json: (value: unknown) => { result = value; return res; },
      set: (name: string, value: string) => { headers[name] = value; return res; },
    };
    await handler({ body } as Request, res as unknown as Response, () => {});
    return { code, result, headers };
  };
}

function mockDatabase(initialRates = noRates, active = false) {
  let row = { id: "main", enabledForPlayers: false, enabledForModerators: false, ...initialRates };
  const depositWrites: Record<string, unknown>[] = [];
  let transactions = 0;
  const database = {
    select: (fields?: Record<string, unknown>) => ({ from: (table: unknown) => ({
      where: () => {
        if (table === petParkSettings) {
          const values = [fields ? Object.fromEntries(Object.keys(fields).map(key => [key, row[key as keyof typeof row]])) : row];
          return {
            for: (lock: string) => { assert.equal(lock, "update"); return Promise.resolve(values); },
            then: (resolve: any, reject: any) => Promise.resolve(values).then(resolve, reject),
          };
        }
        assert.equal(table, petParkDeposits);
        return { limit: () => Promise.resolve(active ? [{ id: "active" }] : []) };
      },
    }) }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => { transactions++; return fn(database); },
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({
      where: () => {
        if (table === petParkDeposits) { depositWrites.push(values); return Promise.resolve([]); }
        assert.equal(table, petParkSettings);
        return { returning: async () => { row = { ...row, ...values }; return [row]; } };
      },
    }) }),
  };
  return { call: harness(database as unknown as typeof db), depositWrites, transactions: () => transactions };
}

test("admin access: initialize empty rates at first open, retain independent flags and saved rates", async () => {
  const { call, depositWrites } = mockDatabase();
  const read = await call("get", "settings");
  assert.equal(read.headers["Cache-Control"], "private, no-store");
  assert.deepEqual(read.result, { enabledForPlayers: false, enabledForModerators: false, ...noRates });
  const moderators = await call("patch", "availability", { enabledForModerators: true });
  assert.equal(moderators.code, 200);
  assert.deepEqual(ratesOf(moderators.result), noRates);
  assert.equal(depositWrites.length, 0);
  const opened = await call("patch", "availability", { enabledForPlayers: true });
  assert.equal(opened.code, 200);
  assert.deepEqual(ratesOf(opened.result), PET_PARK_BASE_REWARD_RATES);
  assert.equal(opened.result.enabledForModerators, true);
  assert.equal(depositWrites.length, 1);
  const closed = await call("patch", "availability", { enabledForPlayers: false });
  assert.equal(closed.result.enabledForPlayers, false);
  assert.equal(depositWrites.length, 2);
  assert.ok(depositWrites[1].pausedAt instanceof Date);
  assert.equal((await call("put", "reward-rates", customRates)).code, 200);
  const reopened = await call("patch", "availability", { enabledForPlayers: true });
  assert.deepEqual(ratesOf(reopened.result), customRates);
  assert.equal(reopened.result.enabledForModerators, true);
});

test("admin access: existing deposited pets never get repriced even with old zero rates", async () => {
  for (const initialRates of [noRates, customRates]) {
    const { call, depositWrites } = mockDatabase(initialRates, true);
    const opened = await call("patch", "availability", { enabledForPlayers: true });
    assert.equal(opened.code, 200);
    assert.equal(opened.result.enabledForPlayers, true);
    assert.deepEqual(ratesOf(opened.result), initialRates);
    const rejected = await call("put", "reward-rates", PET_PARK_BASE_REWARD_RATES);
    assert.equal(rejected.code, 409);
    assert.deepEqual(ratesOf((await call("get", "settings")).result), initialRates);
    assert.equal(depositWrites.length, 1, "rate rejection does not pause or resume deposits");
  }
});

test("admin access: validate requests before writes and retain legacy client compatibility", async () => {
  const { call, transactions } = mockDatabase();
  for (const body of [null, {}, [], { enabledForPlayers: "true" }, { enabledForPlayers: true, coinsPerHour: 9 }, { enabledForModerators: 1 }]) {
    assert.equal((await call("patch", "availability", body)).code, 400);
  }
  for (const body of [{}, { ...customRates, coinsPerHour: -1 }, { ...customRates, coinsPerHour: 1.1 }, { ...customRates, petXpPerHour: 10001 }]) {
    assert.equal((await call("put", "reward-rates", body)).code, 400);
  }
  assert.equal(transactions(), 0);
  assert.equal((await call("put", "publishing", { enabledForPlayers: true, enabledForModerators: false, ...noRates })).code, 400);
  const legacy = await call("put", "publishing", { enabledForPlayers: true, enabledForModerators: true, ...customRates });
  assert.equal(legacy.code, 200);
  assert.deepEqual(ratesOf(legacy.result), customRates);
});

// The same real server handlers run against an isolated Postgres schema in CI.
// A long closure must not overflow the integer pause field or change earned time.
test("Postgres: reopening after 45 days preserves earned time, withdrawn rows and custom rates", {
  skip: !process.env.PURCHASE_TEST_DATABASE_URL,
}, async () => {
  const schema = "park_access_" + randomUUID().replaceAll("-", "");
  const url = process.env.PURCHASE_TEST_DATABASE_URL!;
  const setup = new pg.Pool({ connectionString: url });
  await setup.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema} -c timezone=UTC` });
  try {
    await pool.query(`
      CREATE TABLE pet_park_settings (
        id varchar PRIMARY KEY, enabled_for_players boolean NOT NULL DEFAULT false,
        enabled_for_moderators boolean NOT NULL DEFAULT false, background_url text,
        ground_level integer NOT NULL DEFAULT 1, ground_theme text NOT NULL DEFAULT 'grass',
        coins_per_hour integer NOT NULL DEFAULT 0, essence_per_hour integer NOT NULL DEFAULT 0,
        pet_xp_per_hour integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now()
      );
      INSERT INTO pet_park_settings (id) VALUES ('main');
      CREATE TABLE pet_park_deposits (
        id varchar PRIMARY KEY, checkpoint_at timestamp NOT NULL, paused_at timestamp,
        paused_duration_ms integer NOT NULL DEFAULT 0, withdrawn_at timestamp
      );
    `);
    const call = harness(drizzle(pool) as unknown as typeof db);
    assert.deepEqual(ratesOf((await call("patch", "availability", { enabledForPlayers: true })).result), PET_PARK_BASE_REWARD_RATES);
    assert.equal((await call("patch", "availability", { enabledForPlayers: false })).code, 200);
    assert.equal((await call("put", "reward-rates", customRates)).code, 200);
    const pauseAt = new Date(Date.now() - 45 * 86400000);
    const checkpoint = new Date(pauseAt.getTime() - 7200000);
    await pool.query("INSERT INTO pet_park_deposits VALUES ('active',$1,$2,1800000,NULL), ('withdrawn',$1,$2,1800000,$2)", [checkpoint.toISOString(), pauseAt.toISOString()]);
    const before = (await pool.query("SELECT * FROM pet_park_deposits ORDER BY id")).rows;
    const mod = await call("patch", "availability", { enabledForModerators: true });
    assert.equal(mod.code, 200);
    assert.deepEqual((await pool.query("SELECT * FROM pet_park_deposits ORDER BY id")).rows, before);
    const reopened = await call("patch", "availability", { enabledForPlayers: true });
    assert.equal(reopened.code, 200);
    assert.deepEqual(ratesOf(reopened.result), customRates);
    const after = (await pool.query("SELECT * FROM pet_park_deposits ORDER BY id")).rows;
    const checkpointMs = Number((await pool.query("SELECT EXTRACT(EPOCH FROM checkpoint_at) * 1000 AS ms FROM pet_park_deposits WHERE id='active'")).rows[0].ms);
    assert.equal(after[0].paused_at, null);
    assert.equal(after[0].paused_duration_ms, 2147483647);
    const duration = claimablePetParkDurationMs({ checkpointMs,
      pausedAtMs: null, pausedDurationMs: after[0].paused_duration_ms }, new Date(reopened.result.updatedAt).getTime());
    assert.equal(duration, 5400000, "90 minutes earned before closing remain exactly 90 minutes");
    assert.deepEqual(after[1], before[1], "withdrawn deposits are untouched");
    assert.equal((await call("put", "reward-rates", PET_PARK_BASE_REWARD_RATES)).code, 409);
    const closed = await call("patch", "availability", { enabledForPlayers: false });
    assert.equal(closed.code, 200);
    const frozen = (await pool.query("SELECT * FROM pet_park_deposits WHERE id='active'")).rows[0];
    assert.ok(frozen.paused_at instanceof Date);
    assert.equal((await call("patch", "availability", { enabledForPlayers: true })).code, 200);
    const resumed = (await pool.query("SELECT * FROM pet_park_deposits WHERE id='active'")).rows[0];
    assert.equal(resumed.paused_at, null);
    assert.equal(resumed.paused_duration_ms, 2147483647);
  } finally {
    await pool.end();
    await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await setup.end();
  }
});
