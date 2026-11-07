import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GARDEN_WATER_CAPACITY, gardenItemNeedsRefill } from "../shared/garden";
import { registerGardenRefillRoutes } from "../server/routes/gardenRefill.routes";
import {
  petParkSceneItems, petParkSettings, shopItems, userInventory, users,
} from "../shared/schema";

test("water source and refillable are independent admin toggles, not item kinds", () => {
  const schema = readFileSync("shared/schema.ts", "utf8");
  const migration = readFileSync("server/startup/migrations/ensureGardenStorage.ts", "utf8");
  const decorAdmin = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
  const shop = readFileSync("client/src/components/ItemDatabaseSection.tsx", "utf8");
  const gardenAdmin = readFileSync("client/src/components/GardenAdminPanel.tsx", "utf8");
  const panel = readFileSync("client/src/components/PetParkAdminPanel.tsx", "utf8");
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(schema, /isWaterSource: boolean\("is_water_source"\)\.notNull\(\)\.default\(false\)/);
  assert.match(schema, /isRefillable: boolean\("is_refillable"\)\.notNull\(\)\.default\(false\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_water_source boolean NOT NULL DEFAULT false/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_refillable boolean NOT NULL DEFAULT false/);
  assert.match(decorAdmin, /app\.patch\("\/api\/admin\/pet-park\/items\/:id\/water-source", isAdmin/);
  assert.match(decorAdmin, /eq\(petParkSceneItems\.kind, "decor"\)/);
  assert.match(decorAdmin, /isWaterSource: original\.isWaterSource/);
  assert.match(panel, /aria-label="Water Source" type="checkbox"/);
  assert.match(page, /aria-label="Water Source" aria-pressed=/);
  assert.match(shop, /aria-label="Refillable" checked=\{isRefillable\}/);
  assert.match(gardenAdmin, /aria-label="Refillable" checked=\{toolRefillable\}/);
  assert.match(gardenAdmin, /\/api\/admin\/garden\/tools\/\$\{item\.id\}\/refillable/);
  assert.match(page, /data-testid="pet-park-water-source"/);
  assert.match(page, /parkImageHitAt\(image, event\.clientX, event\.clientY, item\.flipped\)/);
  assert.match(page, /data-testid="pet-park-refill-item"/);
  assert.match(page, /gardenItemNeedsRefill/);
  assert.match(page, /qc\.invalidateQueries\(\{ queryKey: \["\/api\/inventory"\] \}\)/);
  assert.match(readFileSync("server/routes.ts", "utf8"), /registerGardenRefillRoutes\(app, isAuthenticated\)/);
});

test("painted water terrain refills through the same secured route, without changing admin water toggles", () => {
  const refill = readFileSync("server/routes/gardenRefill.routes.ts", "utf8");
  const park = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(refill, /eq\(petParkSceneItems\.kind, "decor"\), eq\(petParkSceneItems\.isWaterSource, true\)/);
  assert.match(refill, /eq\(petParkSceneItems\.kind, "terrain"\), eq\(petParkSceneItems\.effectType, "water_path"\)/);
  assert.match(refill, /or\(/);
  assert.match(refill, /await database\.transaction/);
  assert.match(refill, /FOR UPDATE/);
  assert.match(park, /isWaterTile = item\.kind === "terrain" && item\.effectType === "water_path"/);
  assert.match(park, /data-testid="pet-park-water-tile-source"/);
  const tile = park.split('data-testid="pet-park-water-tile-source"')[1]?.split("</button>")[0];
  assert.ok(tile);
  assert.match(tile, /setSelectedWaterSourceId\(item\.id\)/);
  assert.match(tile, /polygon\(50% 0%, 100% 50%, 50% 100%, 0% 50%\)/);
  assert.doesNotMatch(tile, /Droplets|water-source-indicator/,
    "painted water is a source without a floating droplet indicator");
});

test("only non-full, unlisted, owned-capacity equipment is refillable", () => {
  assert.equal(GARDEN_WATER_CAPACITY, 100);
  const refillable = { isRefillable: true, gardenWaterLeft: 9, isListed: false, quantity: 1 };
  assert.equal(gardenItemNeedsRefill(refillable), true);
  assert.equal(gardenItemNeedsRefill({ ...refillable, gardenWaterLeft: 99 }), true);
  assert.equal(gardenItemNeedsRefill({ ...refillable, gardenWaterLeft: 0 }), true);
  for (const item of [
    { ...refillable, isRefillable: false },
    { ...refillable, isListed: true },
    { ...refillable, quantity: 0 },
    { ...refillable, gardenWaterLeft: 100 },
    { ...refillable, gardenWaterLeft: null },
    { ...refillable, gardenWaterLeft: -1 },
    { ...refillable, gardenWaterLeft: 101 },
  ]) assert.equal(gardenItemNeedsRefill(item), false);
});

type Scenario = {
  source?: boolean; owner?: boolean; open?: boolean; admin?: boolean;
  refillable?: boolean; listed?: boolean; waterLeft?: number | null; quantity?: number;
};
function simulate(options: Scenario = {}) {
  const scenario = { source: true, owner: true, open: true, admin: false,
    refillable: true, listed: false, waterLeft: 7, quantity: 1, ...options };
  const calls = { lock: 0, updates: 0, auth: 0 };
  const handlers = new Map<string, any[]>();
  const auth = (() => { calls.auth += 1; }) as any;
  const tx = {
    select() {
      return {
        from(table: unknown) {
          const records: any[] = table === petParkSettings
            ? [{ enabledForPlayers: scenario.open, enabledForModerators: false }]
            : table === users ? [{ isAdmin: scenario.admin, isModerator: false }]
            : table === petParkSceneItems ? scenario.source ? [{ id: "fountain" }] : []
            : [];
          return {
            async where() { return records; },
            innerJoin(itemTable: unknown) {
              assert.equal(table, userInventory);
              assert.equal(itemTable, shopItems);
              return { async where() {
                return scenario.owner ? [{
                  id: "pail", quantity: scenario.quantity, isListed: scenario.listed,
                  isRefillable: scenario.refillable, gardenWaterLeft: scenario.waterLeft,
                  name: "Forest Pail", type: "garden_tool", specialType: "watering_pail",
                }] : [];
              } };
            },
          };
        },
      };
    },
    async execute() { calls.lock++; return { rows: [{ id: "pail" }] }; },
    update(table: unknown) {
      assert.equal(table, userInventory);
      return { set(update: Record<string, unknown>) {
        calls.updates++;
        assert.deepEqual(update, { gardenWaterLeft: 100 });
        return { where() { return { async returning() { return [{ waterLeft: 100 }]; } }; } };
      } };
    },
  };
  const db = { transaction: async (cb: (dbTx: any) => Promise<unknown>) => cb(tx) };
  const app = { post(path: string, ...args: any[]) { handlers.set(path, args); } };
  registerGardenRefillRoutes(app as any, auth, db as any);
  const pathname = "/api/pet-park/water-sources/:sourceId/refill";
  const handler = handlers.get(pathname);
  assert.ok(handler, "the server route was registered");
  assert.equal(handler![0], auth, "authentication required");
  async function request({ userId = "owner", sourceId = "fountain", inventoryId = "pail" }: {
    userId?: string; sourceId?: string; inventoryId?: unknown;
  } = {}) {
    const response = {
      statusCode: 200,
      payload: null as any,
      status(value: number) { this.statusCode = value; return this; },
      json(value: any) { this.payload = value; return this; },
    };
    await handler!.at(-1)({
      user: { id: userId }, params: { sourceId }, body: { inventoryId },
    }, response);
    return response;
  }
  return { request, calls };
}

test("real water-source handler fills only eligible owned equipment in a transaction", async () => {
  const s = simulate();
  const result = await s.request();
  assert.equal(result.statusCode, 200);
  assert.deepEqual({ waterLeft: result.payload.waterLeft, capacity: result.payload.capacity }, {
    waterLeft: 100, capacity: 100,
  });
  assert.equal(s.calls.lock, 1, "inventory row must be serialized with watering operations");
  assert.equal(s.calls.updates, 1);
});

test("server rejects non-water decor, closed parks, strangers, listed/full/untagged items and malformed IDs", async () => {
  for (const [options, expected] of [
    [{ source: false }, 404],
    [{ open: false }, 403],
    [{ owner: false }, 422],
    [{ refillable: false }, 422],
    [{ listed: true }, 422],
    [{ quantity: 0 }, 422],
    [{ waterLeft: 100 }, 409],
    [{ waterLeft: null }, 409],
  ] as const) {
    const s = simulate(options);
    const result = await s.request();
    assert.equal(result.statusCode, expected, JSON.stringify(options));
    assert.equal(s.calls.updates, 0, "rejected request must not mutate inventory");
  }
  const s = simulate();
  assert.equal((await s.request({ inventoryId: {} })).statusCode, 400);
  assert.equal((await s.request({ sourceId: "" })).statusCode, 400);
  assert.equal(s.calls.updates, 0);
});
