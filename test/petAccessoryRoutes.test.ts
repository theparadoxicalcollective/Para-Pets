import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetAccessoryRoutes } from "../server/routes/petAccessory.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  get(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "GET", path, handlers });
    return this;
  }

  post(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "POST", path, handlers });
    return this;
  }
}

const authenticated: RequestHandler = (_req, _res, next) => next();

function response() {
  const state: any = { statusCode: 200, body: undefined };
  return Object.assign(state, {
    status(code: number) {
      state.statusCode = code;
      return state;
    },
    json(body: unknown) {
      state.body = body;
      return state;
    },
  });
}

function setup(options: {
  equippedElsewhere?: boolean;
  coinsAvailable?: boolean;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    inventoryIds: [] as string[],
    equippedReads: [] as string[],
    shopReads: [] as string[],
    equip: [] as any[],
    unequip: [] as any[],
    updateInventory: [] as any[],
    deductCoins: [] as any[],
    dbExecute: 0,
  };

  const inventory: Record<string, any> = {
    "pet-1": {
      id: "pet-1",
      userId: "user-1",
      shopItemId: "pet-shop",
      isHatched: true,
      accessoryExtraSlots: 1,
      petAtk: 100,
      petDef: 80,
      petHealth: 900,
    },
    "pet-other": {
      id: "pet-other",
      userId: "user-2",
      shopItemId: "pet-shop",
      isHatched: true,
      accessoryExtraSlots: 0,
      petAtk: 50,
      petDef: 50,
      petHealth: 500,
    },
    "acc-1": {
      id: "acc-1",
      userId: "user-1",
      shopItemId: "acc-shop",
      isListed: false,
    },
  };

  const equippedByPet: Record<string, any[]> = {
    "pet-1": [],
  };

  const db = {
    execute: async () => {
      calls.dbExecute += 1;
      return { rows: [{ id: "acc-1" }, { id: "acc-2" }] };
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => options.equippedElsewhere
            ? [{ petInventoryId: "other-pet" }]
            : [],
        }),
      }),
    }),
  };

  const storage = {
    getInventoryItemById: async (id: string) => {
      calls.inventoryIds.push(id);
      return inventory[id] ?? null;
    },
    getPetEquippedAccessories: async (id: string) => {
      calls.equippedReads.push(id);
      return equippedByPet[id] ?? [];
    },
    getShopItem: async (id: string) => {
      calls.shopReads.push(id);
      if (id === "acc-shop") {
        return {
          id,
          type: "accessory",
          atkBoost: 7,
          defBoost: 3,
          healthBoost: 25,
        };
      }
      return { id, type: "pet" };
    },
    equipAccessory: async (petId: string, accessoryId: string, maxSlots: number) => {
      calls.equip.push([petId, accessoryId, maxSlots]);
      return { id: "equipped-1", petInventoryId: petId, accessoryInventoryId: accessoryId };
    },
    unequipAccessory: async (petId: string, accessoryId: string) => {
      calls.unequip.push([petId, accessoryId]);
    },
    updateInventoryItem: async (id: string, patch: any) => {
      calls.updateInventory.push([id, patch]);
      Object.assign(inventory[id], patch);
      return inventory[id];
    },
    atomicDeductCoins: async (userId: string, amount: number) => {
      calls.deductCoins.push([userId, amount]);
      return options.coinsAvailable === false ? null : { coins: 4200 };
    },
  };

  registerPetAccessoryRoutes(app as any, {
    storage: storage as any,
    db: db as any,
    isAuthenticated: authenticated,
  });

  return { app, calls, inventory, equippedByPet };
}

function route(app: RouteRecorder, method: string, path: string) {
  const found = app.routes.find(candidate => candidate.method === method && candidate.path === path);
  assert.ok(found, `${method} ${path}`);
  return found;
}

async function call(
  app: RouteRecorder,
  method: string,
  path: string,
  req: any = {},
) {
  const res = response();
  await route(app, method, path).handlers.at(-1)!(
    req,
    res,
    (() => {}) as any,
  );
  return res;
}

test("pet accessory module preserves the six legacy routes and authentication middleware", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/user/equipped-accessory-ids",
      "GET /api/pet/:inventoryId/accessories/public",
      "GET /api/pet/:inventoryId/accessories",
      "POST /api/pet/:inventoryId/equip",
      "POST /api/pet/:inventoryId/unequip",
      "POST /api/pet/:petInventoryId/unlock-accessory-slot",
    ],
  );

  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], authenticated);
  }
});

test("accessory reads preserve global equipped-id, public pet, and owner-only pet shapes", async () => {
  const { app, calls } = setup();

  const ids = await call(app, "GET", "/api/user/equipped-accessory-ids", {
    user: { id: "user-1" },
  });
  assert.deepEqual(ids.body, ["acc-1", "acc-2"]);
  assert.equal(calls.dbExecute, 1);

  const publicRead = await call(app, "GET", "/api/pet/:inventoryId/accessories/public", {
    params: { inventoryId: "pet-other" },
    user: { id: "user-1" },
  });
  assert.deepEqual(publicRead.body, []);

  const ownedRead = await call(app, "GET", "/api/pet/:inventoryId/accessories", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
  });
  assert.deepEqual(ownedRead.body, { equipped: [], extraSlots: 1 });

  const foreignPet = await call(app, "GET", "/api/pet/:inventoryId/accessories", {
    params: { inventoryId: "pet-other" },
    user: { id: "user-1" },
  });
  assert.deepEqual([foreignPet.statusCode, foreignPet.body], [404, { message: "Pet not found" }]);
});

test("equip preserves ownership, slot count, duplicate protection, and stat gains", async () => {
  const fixture = setup();
  const res = await call(fixture.app, "POST", "/api/pet/:inventoryId/equip", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
    body: { accessoryInventoryId: "acc-1" },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(fixture.calls.equip, [["pet-1", "acc-1", 4]]);
  assert.deepEqual(fixture.calls.updateInventory, [[
    "pet-1",
    { petAtk: 107, petDef: 83, petHealth: 925 },
  ]]);
  assert.deepEqual(res.body, {
    equipped: {
      id: "equipped-1",
      petInventoryId: "pet-1",
      accessoryInventoryId: "acc-1",
    },
    atkGain: 7,
    defGain: 3,
    healthGain: 25,
  });

  const elsewhere = setup({ equippedElsewhere: true });
  const conflict = await call(elsewhere.app, "POST", "/api/pet/:inventoryId/equip", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
    body: { accessoryInventoryId: "acc-1" },
  });
  assert.deepEqual(
    [conflict.statusCode, conflict.body],
    [409, { message: "That accessory is already equipped to a pet" }],
  );
});

test("unequip preserves stat-loss floor behavior and response shape", async () => {
  const fixture = setup();
  fixture.equippedByPet["pet-1"] = [{
    accessoryInventoryId: "acc-1",
    atkBoost: 150,
    defBoost: 20,
    healthBoost: 1000,
  }];

  const res = await call(fixture.app, "POST", "/api/pet/:inventoryId/unequip", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
    body: { accessoryInventoryId: "acc-1" },
  });

  assert.deepEqual(fixture.calls.unequip, [["pet-1", "acc-1"]]);
  assert.deepEqual(fixture.calls.updateInventory, [[
    "pet-1",
    { petAtk: 0, petDef: 60, petHealth: 0 },
  ]]);
  assert.deepEqual(res.body, {
    success: true,
    atkLoss: 150,
    defLoss: 20,
    healthLoss: 1000,
  });
});

test("extra accessory slot keeps the 3,000-coin cost and two-extra-slot ceiling", async () => {
  const fixture = setup({ coinsAvailable: true });

  const res = await call(fixture.app, "POST", "/api/pet/:petInventoryId/unlock-accessory-slot", {
    params: { petInventoryId: "pet-1" },
    user: { id: "user-1" },
  });

  assert.deepEqual(fixture.calls.deductCoins, [["user-1", 3000]]);
  assert.deepEqual(fixture.calls.updateInventory.at(-1), ["pet-1", { accessoryExtraSlots: 2 }]);
  assert.deepEqual(res.body, { extraSlots: 2, coins: 4200 });

  const maxed = await call(fixture.app, "POST", "/api/pet/:petInventoryId/unlock-accessory-slot", {
    params: { petInventoryId: "pet-1" },
    user: { id: "user-1" },
  });
  assert.deepEqual(
    [maxed.statusCode, maxed.body],
    [400, { message: "Maximum accessory slots already unlocked for this pet" }],
  );

  const poor = setup({ coinsAvailable: false });
  const insufficient = await call(poor.app, "POST", "/api/pet/:petInventoryId/unlock-accessory-slot", {
    params: { petInventoryId: "pet-1" },
    user: { id: "user-1" },
  });
  assert.deepEqual(
    [insufficient.statusCode, insufficient.body],
    [400, { message: "Not enough coins" }],
  );
});

test("legacy registry has one pet accessory registration boundary and no duplicate inline routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal((root.match(/registerPetAccessoryRoutes\(app,/g) ?? []).length, 1);
  for (const fragment of [
    'app.get("/api/user/equipped-accessory-ids"',
    'app.get("/api/pet/:inventoryId/accessories/public"',
    'app.get("/api/pet/:inventoryId/accessories"',
    'app.post("/api/pet/:inventoryId/equip"',
    'app.post("/api/pet/:inventoryId/unequip"',
    'app.post("/api/pet/:petInventoryId/unlock-accessory-slot"',
  ]) {
    assert.equal(root.includes(fragment), false, fragment);
  }

  const hatch = root.indexOf('app.post("/api/pet/:inventoryId/hatch-check"');
  const registration = root.indexOf("registerPetAccessoryRoutes(app,");
  const progression = root.indexOf("registerPetProgressionItemRoutes(app,");
  assert.ok(hatch >= 0);
  assert.ok(registration > hatch);
  assert.ok(progression > registration);
  assert.match(root, /registerPetAccessoryRoutes\(app, \{[\s\S]{0,160}storage,[\s\S]{0,160}db,[\s\S]{0,160}isAuthenticated/);
});
