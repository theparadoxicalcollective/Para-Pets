import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { petParkSceneItems, shopItems } from "../shared/schema";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";
import { registerGardenAdminRoutes } from "../server/routes/gardenAdmin.routes";

const read = (path: string) => readFileSync(path, "utf8");
const parkSource = read("server/routes/petParkAdmin.routes.ts");
const gardenSource = read("server/routes/gardenAdmin.routes.ts");

function stubRoutes(register: (app: any, args: any) => void) {
  const routes = new Map<string, any[]>();
  const writes: { table: unknown; data: any; mode: string }[] = [];
  const guard = (_req: unknown, _res: unknown, next: () => void) => next();
  const methods = ["get", "post", "put", "patch", "delete"] as const;
  const app: Record<string, any> = {};
  for (const method of methods) app[method] = (url: string, ...handlers: any[]) =>
    routes.set(`${method.toUpperCase()} ${url}`, handlers);
  const db = {
    // Decor role/water updates first read the source artwork group so every
    // linked copy can receive the same behavior. Preserve this real route flow.
    select() { return { from(table: unknown) {
      return { async where() {
        return table === petParkSceneItems
          ? [{ id: "existing-item", kind: "decor", appearanceGroupId: "linked-decor",
            isWaterSource: false, decorSurface: "barrier" }] : [];
      } };
    } }; },
    insert(table: unknown) { return { values(data: any) {
      writes.push({ table, data, mode: "insert" });
      return { returning: async () => [{ id: "new-item", kind: data.kind, ...data }] };
    } }; },
    update(table: unknown) { return { set(data: any) {
      return { where(_where: unknown) {
        writes.push({ table, data, mode: "update" });
        return { returning: async () => [{ id: "existing-item", ...data }] };
      } };
    } }; },
  };
  register(app, { db, isAdmin: guard, processWorldImage: async () => "/assets/park-source.png" });
  async function call(method: string, url: string, body: unknown, id = "existing-item") {
    const handlers = routes.get(`${method} ${url}`);
    assert.ok(handlers, `${method} ${url}`);
    assert.equal(handlers[0], guard, "only admins may set refill flags");
    const result: { statusCode: number; body: any } = { statusCode: 200, body: undefined };
    const res = {
      status(code: number) { result.statusCode = code; return this; },
      json(data: unknown) { result.body = data; return this; },
    };
    await handlers.at(-1)({ body, params: { id } }, res);
    return result;
  }
  return { call, writes, routes };
}

test("Garden equipment supports an opt-in refillable label while only pails have 100 water drops", async () => {
  const t = stubRoutes(registerGardenAdminRoutes);
  const good = await t.call("POST", "/api/admin/garden/tools", {
    kind: "watering_pail", name: "Watering Pail", imageData: "data:image/png;base64,AA==",
    price: 0, isRefillable: true,
  });
  assert.equal(good.statusCode, 201);
  assert.deepEqual(t.writes[0].table, shopItems);
  assert.equal(t.writes[0].data.isRefillable, true);
  assert.equal(t.writes[0].data.specialAmount, 100);
  const bad = await t.call("POST", "/api/admin/garden/tools", {
    kind: "scythe", name: "Scythe", imageData: "data:image/png;base64,AA==",
    price: 0, isRefillable: true,
  });
  assert.equal(bad.statusCode, 201);
  assert.equal(t.writes[1].data.specialAmount, null, "scythes have no water capacity");
  assert.equal(t.writes[1].data.isRefillable, true, "flag alone never grants water");
  const invalid = await t.call("POST", "/api/admin/garden/tools", {
    kind: "scythe", name: "Scythe", imageData: "data:image/png;base64,AA==",
    price: 0, isRefillable: "true",
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(t.writes.length, 2, "invalid configuration cannot mutate shop items");
});

test("Admin can toggle refill eligibility without editing remaining player water", async () => {
  const t = stubRoutes(registerGardenAdminRoutes);
  assert.equal((await t.call("PATCH", "/api/admin/garden/tools/:id/refillable", { isRefillable: true })).statusCode, 200);
  assert.equal(t.writes.at(-1)?.data.isRefillable, true);
  assert.equal((await t.call("PATCH", "/api/admin/garden/tools/:id/refillable", { isRefillable: false })).statusCode, 200);
  assert.equal(t.writes.at(-1)?.data.isRefillable, false);
  const count = t.writes.length;
  assert.equal((await t.call("PATCH", "/api/admin/garden/tools/:id/refillable", { isRefillable: "true" })).statusCode, 400);
  assert.equal(t.writes.length, count);
  assert.match(gardenSource, /eq\(shopItems\.type, "garden_tool"\)/);
  assert.doesNotMatch(gardenSource, /gardenWaterLeft|userInventory/, "admin toggle must not refill itself");
});

test("Existing Pet Park decoration can become a Water Source without replacing its artwork", async () => {
  const t = stubRoutes(registerPetParkAdminRoutes);
  const valid = { kind: "decor", imageData: "data:image/png;base64,AA==",
    xPct: .45, yPct: .55, size: 120, flipped: false, layer: 0,
    isWaterSource: true };
  const created = await t.call("POST", "/api/admin/pet-park/items", valid);
  assert.equal(created.statusCode, 201);
  assert.equal(t.writes[0].table, petParkSceneItems);
  assert.equal(t.writes[0].data.isWaterSource, true);
  assert.equal(t.writes[0].data.xPct, .45, "placing water source must not re-map the scene");

  const count = t.writes.length;
  const invalid = await t.call("POST", "/api/admin/pet-park/items", {
    ...valid, kind: "sleep_spot",
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(t.writes.length, count);

  assert.equal((await t.call("PATCH", "/api/admin/pet-park/items/:id/water-source", { isWaterSource: true })).statusCode, 200);
  assert.equal((await t.call("PATCH", "/api/admin/pet-park/items/:id/water-source", { isWaterSource: false })).statusCode, 200);
  assert.equal((await t.call("PATCH", "/api/admin/pet-park/items/:id/water-source", { isWaterSource: 1 })).statusCode, 400);
  assert.match(parkSource, /eq\(petParkSceneItems\.kind, "decor"\)/, "only actual decor is refillable");
  assert.match(parkSource, /isWaterSource: original\.isWaterSource/, "duplicated decor keeps Water Source label");
  assert.doesNotMatch(parkSource, /gardenWaterLeft|UPDATE user_inventory/, "tagging decor must not grant water");
});

test("Admin Realm toggles preserve existing item and decor positioning workflows", () => {
  const parkAdmin = read("client/src/components/PetParkAdminPanel.tsx");
  const parkPage = read("client/src/pages/PetParkPage.tsx");
  const gardenAdmin = read("client/src/components/GardenAdminPanel.tsx");
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensureGardenStorage.ts");
  assert.match(parkAdmin, /aria-label="Water Source"/);
  assert.match(parkAdmin, /isWaterSource: newWaterSource/);
  assert.match(parkPage, /data-testid="park-decoration-water-source"/);
  assert.match(parkPage, /items\/\$\{id\}\/water-source/);
  assert.match(gardenAdmin, /aria-label="Refillable"/);
  const itemEditor = read("client/src/components/ItemDatabaseSection.tsx");
  assert.match(itemEditor, /data-testid="admin-item-refillable-toggle"/);
  assert.match(itemEditor, /isRefillable: !petOnly/);
  assert.match(gardenAdmin, /garden\/tools\/\$\{item\.id\}\/refillable/);
  assert.match(schema, /isWaterSource: boolean\("is_water_source"\)\.notNull\(\)\.default\(false\)/);
  assert.match(schema, /isRefillable: boolean\("is_refillable"\)\.notNull\(\)\.default\(false\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_water_source boolean NOT NULL DEFAULT false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_refillable boolean NOT NULL DEFAULT false/);
  assert.match(parkPage, /placementSave\.mutate/);
  assert.match(parkPage, /Double-tap artwork to move/);
  assert.doesNotMatch(parkPage, /DESIGN_W|DESIGN_H|390\s*[x×]\s*844/);
});
