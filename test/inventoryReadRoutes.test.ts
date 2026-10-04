import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerInventoryReadRoutes } from "../server/routes/inventoryRead.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  get(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "GET", path, handlers });
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

function setup() {
  const app = new RouteRecorder();
  const calls: any = { updates: [] as any[] };

  const rows: any[] = [
    {
      inventory: {
        id: "pet-1",
        userId: "user-1",
        shopItemId: "pet-shop",
        acquiredAt: new Date("2026-10-01T00:00:00Z"),
        isListed: false,
        petNickname: "Buddy",
        hatchStartedAt: new Date("2026-10-01T00:00:00Z"),
        isHatched: true,
        isEvolved: false,
        petHealth: 1000,
        petAtk: 50,
        petDef: 50,
        petLevel: 2,
        petLevelPoints: 10,
        petFeedPoints: 4,
        petHunger: -1,
        petMood: 100,
        petLoyalty: 25,
        lastFedAt: null,
        lastPettedAt: null,
        lastBattleDefeatAt: null,
        petStatsUpdatedAt: null,
        itemsUsedThisLevel: 0,
        quantity: 1,
      },
      shopItem: {
        id: "pet-shop",
        name: "Bayou Pet",
        description: null,
        type: "pet",
        worldId: "bayou",
        rarity: 2,
        starRarity: 2,
        hatchTime: 1,
        imageUrl: "pet.png",
        eggImageUrl: "egg.png",
        hatchedImageUrl: "hatched.png",
        petTemplateId: "template-1",
        canFly: false,
      },
    },
    {
      inventory: {
        id: "pole-1",
        userId: "user-1",
        shopItemId: "pole-shop",
        acquiredAt: new Date("2026-10-01T00:00:00Z"),
        isListed: false,
        poleUsesLeft: null,
        quantity: 1,
      },
      shopItem: {
        id: "pole-shop",
        name: "Fishing Pole",
        description: "Pole",
        type: "item",
        worldId: "bayou",
        fishingType: "pole",
        poleMaxUses: 20,
        imageUrl: "pole.png",
      },
    },
  ];

  const storage = {
    getUserInventoryWithItems: async (userId: string) =>
      userId === "user-1" ? rows : [],
    updateInventoryItem: async (id: string, patch: any) => {
      calls.updates.push([id, patch]);
      const row = rows.find(entry => entry.inventory.id === id);
      if (row) Object.assign(row.inventory, patch);
      return row?.inventory ?? null;
    },
  };

  registerInventoryReadRoutes(app as any, {
    storage: storage as any,
    isAuthenticated: authenticated,
  });

  return { app, calls, rows };
}

async function call(app: RouteRecorder) {
  const registered = app.routes.find(route => route.method === "GET" && route.path === "/api/inventory");
  assert.ok(registered);
  const res = response();
  await registered.handlers.at(-1)!(
    { user: { id: "user-1" } } as any,
    res,
    (() => {}) as any,
  );
  return res;
}

test("inventory read module preserves the authenticated GET route", () => {
  const { app } = setup();
  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    ["GET /api/inventory"],
  );
  assert.equal(app.routes[0].handlers[0], authenticated);
});

test("inventory read preserves pole-use backfill and core response fields", async () => {
  const fixture = setup();
  const res = await call(fixture.app);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 2);

  const pet = res.body.find((item: any) => item.inventoryId === "pet-1");
  assert.ok(pet);
  assert.equal(pet.name, "Bayou Pet");
  assert.equal(pet.type, "pet");
  assert.equal(pet.petNickname, "Buddy");
  assert.equal(pet.petHunger, 1000);
  assert.equal(pet.petMood, 100);
  assert.equal(pet.petLoyalty, 25);
  assert.equal(pet.quantity, 1);

  const pole = res.body.find((item: any) => item.inventoryId === "pole-1");
  assert.ok(pole);
  assert.equal(pole.fishingType, "pole");
  assert.equal(pole.poleMaxUses, 20);
  assert.equal(pole.poleUsesLeft, 20);
  assert.deepEqual(fixture.calls.updates[0], ["pole-1", { poleUsesLeft: 20 }]);
});

test("inventory read source preserves pet decay formulas and write throttle", () => {
  const source = fs.readFileSync("server/routes/inventoryRead.routes.ts", "utf8");

  assert.match(source, /const HUNGER_DECAY_PER_MIN = 1000 \/ 360/);
  assert.match(source, /const MOOD_STARVE_DECAY_PER_MIN = 0\.5/);
  assert.match(source, /const HUNGRY_THRESHOLD_PCT = 0\.5/);
  assert.match(source, /const maxHunger = 1000/);
  assert.match(source, /inv\.petHunger == null \|\| inv\.petHunger < 0 \? maxHunger : inv\.petHunger/);
  assert.match(source, /if \(changed && minutes >= 2\)/);
  assert.match(source, /petStatsUpdatedAt: new Date\(\)/);
  assert.match(source, /shopItem\?\.type === "pet" && inv\.isHatched/);
  assert.match(source, /shopItem\?\.fishingType === "pole"/);
});

test("legacy registry delegates inventory read once before management and shop purchase", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.doesNotMatch(root, /app\.get\("\/api\/inventory"/);
  assert.doesNotMatch(root, /function applyPetTimeDecay/);

  const housePosition = root.indexOf("registerPetHousePositionRoutes(app");
  const inventoryRead = root.indexOf("registerInventoryReadRoutes(app");
  const management = root.indexOf("registerInventoryManagementRoutes(app");
  const shopPurchase = root.indexOf('app.post("/api/shop/:worldId/buy/:itemId"');

  assert.ok(housePosition >= 0);
  assert.ok(inventoryRead > housePosition);
  assert.ok(management > inventoryRead);
  assert.ok(shopPurchase > management);
  assert.equal(root.match(/registerInventoryReadRoutes\(app/g)?.length, 1);
});
