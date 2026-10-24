import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { petParkBuildings, petParkDeposits, petParkSceneItems, petParkSettings } from "../shared/schema";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";

const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const scene = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

function setup({ initialLevel = 1, missing = false }: { initialLevel?: number; missing?: boolean } = {}) {
  let groundLevel = initialLevel;
  const events: { table: unknown; values: Record<string, unknown> }[] = [];
  const state = { transactions: 0, locked: false };
  let handler: RequestHandler | undefined;
  const app = {
    get() {}, put() {}, post() {}, delete() {},
    patch(path: string, ...actions: RequestHandler[]) {
      if (path === "/api/admin/pet-park/ground") handler = actions.at(-1);
    },
  };
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        assert.equal(table, petParkSettings);
        return { where: () => ({ for: async (lock: string) => {
          assert.equal(lock, "update");
          state.locked = true;
          return missing ? [] : [{ id: "main", groundLevel }];
        } }) };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        events.push({ table, values });
        return {
          where() { return { returning: async () => {
            if (table === petParkSettings) {
              groundLevel = values.groundLevel as number;
              return [{ id: "main", groundLevel }];
            }
            return [];
          } }; },
          then(resolve: (value: any) => any) { return resolve([]); },
        };
      },
    }),
  };
  const db = { transaction: async (cb: (t: typeof tx) => Promise<unknown>) => {
    state.transactions++;
    return cb(tx);
  } };
  registerPetParkAdminRoutes(app as any, {
    db: db as any,
    isAdmin: ((_req: any, _res: any, next: any) => next()) as any,
    processWorldImage: async () => "artwork.png",
  });
  assert.ok(handler, "admin-only ground route must register");
  const invoke = async (body: unknown) => {
    const res: any = {
      statusCode: 200, body: null,
      status(code: number) { this.statusCode = code; return this; },
      json(value: any) { this.body = value; return this; },
    };
    await handler!({ body } as any, res, (() => {}) as any);
    return res;
  };
  return { invoke, events, state, level: () => groundLevel };
}

test("admin expands terrain one tier in a transaction without deleting buildings or deposits", async () => {
  const h = setup();
  const result = await h.invoke({ groundLevel: 2 });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.groundLevel, 2);
  assert.equal(h.level(), 2);
  assert.equal(h.state.transactions, 1);
  assert.equal(h.state.locked, true);
  assert.deepEqual(h.events.map(x => x.table),
    [petParkSceneItems, petParkBuildings, petParkDeposits, petParkSettings]);
  assert.deepEqual(Object.keys(h.events[0].values).sort(), ["xPct", "yPct"]);
  assert.deepEqual(Object.keys(h.events[1].values).sort(), ["xPct", "yPct"]);
  assert.deepEqual(Object.keys(h.events[2].values).sort(), ["parkXPct", "parkYPct"]);
  assert.deepEqual(Object.keys(h.events[3].values).sort(), ["groundLevel", "updatedAt"]);
  for (const update of h.events.slice(0, 3)) {
    assert.ok(!["checkpointAt", "withdrawnAt", "petInventoryId", "maxPets", "imageUrl"].some(key => key in update.values));
  }
});

test("expansion validation prevents skipping tiers, shrinking and stale overwrites", async () => {
  const h = setup({ initialLevel: 2 });
  for (const bad of [null, { groundLevel: 0 }, { groundLevel: 3.4 }, { groundLevel: 5 }, { groundLevel: "3" }]) {
    assert.equal((await h.invoke(bad)).statusCode, 400);
  }
  for (const stale of [1, 2, 4]) {
    assert.equal((await h.invoke({ groundLevel: stale })).statusCode, 409);
  }
  assert.equal(h.events.length, 0);
  assert.equal(h.level(), 2);
});

test("max ground size cannot increase beyond tier four", async () => {
  const h = setup({ initialLevel: 4 });
  assert.equal((await h.invoke({ groundLevel: 4 })).statusCode, 409);
  assert.equal((await h.invoke({ groundLevel: 5 })).statusCode, 400);
  assert.equal(h.events.length, 0);
});

test("a missing park settings row cannot expand or create a second park", async () => {
  const h = setup({ missing: true });
  assert.equal((await h.invoke({ groundLevel: 2 })).statusCode, 404);
  assert.equal(h.events.length, 0);
});

test("legacy map placement is remapped once, with reward and asset data untouched", () => {
  assert.match(migration, /ADD COLUMN ground_level integer NOT NULL DEFAULT 1/);
  assert.match(migration, /UPDATE pet_park_scene_items/);
  assert.match(migration, /UPDATE pet_park_buildings/);
  assert.match(migration, /UPDATE pet_park_deposits/);
  assert.match(migration, /IF NOT EXISTS \(/);
  assert.doesNotMatch(migration, /UPDATE pet_park_settings SET background_url = '\/world-assets/);
  assert.doesNotMatch(migration, /DROP TABLE pet_park/);
  assert.match(scene, /groundLevel: settings\?\.groundLevel \?\? 1/);
  assert.match(page, /backgroundColor: "#61864a"/);
  assert.match(page, /parkExpansionCameraPan\(/);
  assert.match(page, /parkZoomAnchorPan\(/);
});
