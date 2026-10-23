import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { petParkBuildings, petParkDeposits } from "../shared/schema";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };
class RouteRecorder {
  routes: Route[] = [];
  get(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "GET", path, handlers }); return this; }
  put(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "PUT", path, handlers }); return this; }
  post(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "POST", path, handlers }); return this; }
  patch(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "PATCH", path, handlers }); return this; }
  delete(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "DELETE", path, handlers }); return this; }
}
const admin: RequestHandler = (_req, _res, next) => next();

function setup({ occupants = 0, exists = true }: { occupants?: number; exists?: boolean } = {}) {
  const app = new RouteRecorder();
  const calls = { transaction: 0, locked: false, checkedOccupants: false, updateCount: 0, patches: [] as any[] };
  const building = { id: "building-1", name: "Cottage", maxPets: 10 };
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        if (table === petParkBuildings) return {
          where: () => ({
            for: async (mode: string) => {
              assert.equal(mode, "update");
              calls.locked = true;
              return exists ? [{ id: building.id }] : [];
            },
          }),
        };
        if (table === petParkDeposits) return {
          where: async () => {
            assert.ok(calls.locked, "check occupancy only after locking building");
            calls.checkedOccupants = true;
            return Array.from({ length: occupants }, (_, index) => ({ id: `deposit-${index}` }));
          },
        };
        throw new Error("Unexpected selected table");
      },
    }),
    update: (table: unknown) => {
      assert.equal(table, petParkBuildings);
      return {
        set: (patch: any) => ({
          where: () => ({
            returning: async () => {
              calls.updateCount++;
              calls.patches.push(patch);
              Object.assign(building, patch);
              return [{ ...building }];
            },
          }),
        }),
      };
    },
  };
  const db = {
    transaction: async (callback: (transaction: any) => Promise<any>) => {
      calls.transaction++;
      return callback(tx);
    },
    update: tx.update,
  };
  registerPetParkAdminRoutes(app as any, { db: db as any, isAdmin: admin, processWorldImage: async data => data });
  const route = app.routes.find(item => item.method === "PATCH" && item.path === "/api/admin/pet-park/buildings/:id");
  assert.ok(route);
  const invoke = async (body: Record<string, unknown>) => {
    const response: any = {
      statusCode: 200,
      body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(data: unknown) { this.body = data; return this; },
    };
    await route.handlers.at(-1)!({ params: { id: building.id }, body } as any, response, (() => {}) as any);
    return response;
  };
  return { invoke, calls, building };
}

test("admin capacity cannot be reduced below active occupancy", async () => {
  const { invoke, calls, building } = setup({ occupants: 15 });
  const result = await invoke({ name: "New Name", maxPets: 10 });
  assert.equal(result.statusCode, 409);
  assert.match(result.body.message, /15 active pets/);
  assert.equal(calls.transaction, 1);
  assert.equal(calls.locked, true);
  assert.equal(calls.checkedOccupants, true);
  assert.equal(calls.updateCount, 0);
  assert.equal(building.name, "Cottage", "reject the entire patch, including name");
});

test("capacity equal to active occupancy is permitted in same locked transaction", async () => {
  const { invoke, calls, building } = setup({ occupants: 10 });
  const result = await invoke({ name: "Updated", maxPets: 10 });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.maxPets, 10);
  assert.equal(building.name, "Updated");
  assert.equal(calls.transaction, 1);
  assert.equal(calls.locked, true);
  assert.equal(calls.updateCount, 1);
  assert.deepEqual(calls.patches[0], { name: "Updated", maxPets: 10 });
});

test("empty buildings can set minimum capacity without affecting deposits", async () => {
  const { invoke, calls } = setup({ occupants: 0 });
  const result = await invoke({ maxPets: 10 });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.maxPets, 10);
  assert.equal(calls.updateCount, 1);
});

test("missing building returns 404 without checking occupancy or writing", async () => {
  const { invoke, calls } = setup({ exists: false });
  const result = await invoke({ maxPets: 10 });
  assert.equal(result.statusCode, 404);
  assert.equal(calls.checkedOccupants, false);
  assert.equal(calls.updateCount, 0);
});

test("capacity can be raised to 25 while retaining locks and occupants", async () => {
  const { invoke, calls } = setup({ occupants: 10 });
  const result = await invoke({ maxPets: 25 });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.maxPets, 25);
  assert.equal(calls.transaction, 1);
  assert.equal(calls.locked, true);
  assert.equal(calls.updateCount, 1);
});

test("large buildings cannot reduce capacity below their active occupancy", async () => {
  const { invoke, calls } = setup({ occupants: 25 });
  const rejected = await invoke({ maxPets: 20 });
  assert.equal(rejected.statusCode, 409);
  assert.equal(calls.updateCount, 0);
  const accepted = await invoke({ maxPets: 25 });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.maxPets, 25);
  assert.equal(calls.updateCount, 1);
});

test("invalid capacity is rejected before starting transaction", async () => {
  const { invoke, calls } = setup({ occupants: 0 });
  for (const invalid of [0, 1, 3, 9, -1, 26, 101, 10.5, "20", null]) {
    const error = await invoke({ maxPets: invalid });
    assert.equal(error.statusCode, 400, `capacity ${String(invalid)} must be rejected`);
  }
  assert.equal(calls.transaction, 0);
});
