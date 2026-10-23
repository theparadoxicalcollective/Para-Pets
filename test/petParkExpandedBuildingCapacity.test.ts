import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";
import {
  isValidPetParkBuildingCapacity, PET_PARK_BUILDING_CAPACITY_MAX,
  PET_PARK_BUILDING_CAPACITY_MIN,
} from "../shared/petParkBuildingCapacity";
import { petParkBuildings } from "../shared/schema";

const form = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
const details = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
const player = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");

test("building capacity accepts every integer from 1 through 100, never exceeding 100", () => {
  assert.equal(PET_PARK_BUILDING_CAPACITY_MIN, 1);
  assert.equal(PET_PARK_BUILDING_CAPACITY_MAX, 100);
  for (const capacity of [1, 2, 3, 4, 5, 10, 20, 50, 75, 100]) {
    assert.equal(isValidPetParkBuildingCapacity(capacity), true, String(capacity));
  }
  for (const bad of [0, -1, 101, 3.5, 99.9, NaN, Infinity, "10", null, undefined]) {
    assert.equal(isValidPetParkBuildingCapacity(bad), false, String(bad));
  }
});

test("existing building schema restriction is migrated, per-player three slots stay separate", () => {
  assert.match(migration, /max_pets BETWEEN 1 AND 100/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS pet_park_buildings_max_pets_check/);
  assert.match(migration, /ADD CONSTRAINT pet_park_buildings_max_pets_check/);
  assert.match(migration, /unlocked_slots BETWEEN 1 AND 3/);
  assert.match(migration, /slot_number BETWEEN 1 AND 3/);
  assert.match(player, /slotNumber > 3/);
});

test("creation and editing forms allow typed capacities and respect the validated range", () => {
  assert.match(form, /type="number" inputMode="numeric"/);
  assert.match(form, /aria-label="Building pet capacity"/);
  assert.match(form, /isValidPetParkBuildingCapacity\(buildingCapacity\)/);
  assert.match(form, /\[1, 3, 5, 10, 20, 50\]/);
  assert.match(details, /aria-label="Park building capacity"/);
  assert.match(details, /type="number" inputMode="numeric"/);
  assert.match(details, /isValidPetParkBuildingCapacity\(capacity\)/);
  assert.match(details, /capacity < occupantCount/);
});

test("the real building creation route accepts 20 and 100 pets and rejects invalid values", async () => {
  const handlers: Record<string, RequestHandler> = {};
  const app = {
    get() {}, post(path: string, ...actions: RequestHandler[]) { handlers[path] = actions.at(-1)!; },
    put() {}, patch() {}, delete() {},
  };
  const values: Record<string, unknown>[] = [];
  const db = {
    insert(table: unknown) {
      assert.equal(table, petParkBuildings);
      return { values(data: Record<string, unknown>) {
        values.push(data);
        return { returning: async () => [{ id: "building-new", ...data }] };
      } };
    },
  };
  registerPetParkAdminRoutes(app as any, {
    db: db as any, isAdmin: ((_req: any, _res: any, next: any) => next()),
    processWorldImage: async (data: string) => "/world-assets/uploads/test.png",
  });
  const handler = handlers["/api/admin/pet-park/buildings"];
  assert.ok(handler, "creation route must be registered");
  const invoke = async (maxPets: unknown) => {
    const response: any = {
      statusCode: 200, data: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.data = value; return this; },
    };
    await handler({ body: { name: "Big House", imageData: "data:image/png;base64,YQ==", maxPets } } as any,
      response, (() => {}) as any);
    return response;
  };
  for (const capacity of [4, 20, 100]) {
    const response = await invoke(capacity);
    assert.equal(response.statusCode, 201);
    assert.equal(response.data.maxPets, capacity);
  }
  assert.equal(values.length, 3);
  for (const invalid of [0, 101, 2.5, "50"]) {
    const response = await invoke(invalid);
    assert.equal(response.statusCode, 400);
  }
  assert.equal(values.length, 3, "invalid capacity must not write to the database");
});
