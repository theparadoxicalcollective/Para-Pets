import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetStateRoutes } from "../server/routes/petState.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

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

function setup(options: { coins?: number } = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    addCoins: [] as any[],
    unequipAll: [] as string[],
    updates: [] as any[],
  };

  const user = {
    id: "user-1",
    username: "player",
    coins: options.coins ?? 1000,
    password: "secret",
  };

  const inventory: Record<string, any> = {
    "pet-1": {
      id: "pet-1",
      userId: "user-1",
      shopItemId: "pet-shop",
      isHatched: true,
      petMood: 80,
      petHealth: 1500,
      petAtk: 75,
      petDef: 70,
      petLevel: 8,
      petLevelPoints: 45,
      itemsUsedThisLevel: 3,
      hatchStartedAt: new Date("2026-10-01T00:00:00Z"),
    },
    "pet-foreign": {
      id: "pet-foreign",
      userId: "user-2",
      shopItemId: "pet-shop",
      isHatched: true,
      petMood: 50,
    },
  };

  const storage = {
    getInventoryItemById: async (id: string) => inventory[id] ?? null,
    updateInventoryItem: async (id: string, patch: any) => {
      calls.updates.push([id, patch]);
      Object.assign(inventory[id], patch);
      return inventory[id];
    },
    getUser: async (id: string) => id === "user-1" ? user : null,
    getShopItem: async (id: string) => id === "pet-shop" ? { id, type: "pet" } : null,
    addCoins: async (userId: string, amount: number) => {
      calls.addCoins.push([userId, amount]);
      user.coins += amount;
      return user;
    },
    unequipAllPetAccessories: async (petId: string) => {
      calls.unequipAll.push(petId);
    },
  };

  registerPetStateRoutes(app as any, {
    storage: storage as any,
    isAuthenticated: authenticated,
  });

  return { app, calls, inventory, user };
}

function route(app: RouteRecorder, path: string) {
  const found = app.routes.find(candidate => candidate.method === "POST" && candidate.path === path);
  assert.ok(found, `POST ${path}`);
  return found;
}

async function call(app: RouteRecorder, path: string, req: any) {
  const res = response();
  await route(app, path).handlers.at(-1)!(req, res, (() => {}) as any);
  return res;
}

test("pet state module preserves three authenticated routes in legacy order", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "POST /api/pet/:inventoryId/world-defeat",
      "POST /api/pet/:inventoryId/reset-stats",
      "POST /api/pet/:inventoryId/revert-to-egg",
    ],
  );

  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], authenticated);
  }
});

test("world defeat preserves the 3-point mood penalty and owned-pet boundary", async () => {
  const fixture = setup();

  const ok = await call(fixture.app, "/api/pet/:inventoryId/world-defeat", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.petMood, 77);
  assert.ok(ok.body.lastBattleDefeatAt instanceof Date);
  assert.equal(fixture.calls.updates.length, 1);

  const foreign = await call(fixture.app, "/api/pet/:inventoryId/world-defeat", {
    params: { inventoryId: "pet-foreign" },
    user: { id: "user-1" },
  });
  assert.deepEqual([foreign.statusCode, foreign.body], [404, { message: "Pet not found" }]);
});

test("stat reset preserves 300-coin cost, accessory unequip, and base stats", async () => {
  const fixture = setup();

  const res = await call(fixture.app, "/api/pet/:inventoryId/reset-stats", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(fixture.calls.addCoins, [["user-1", -300]]);
  assert.deepEqual(fixture.calls.unequipAll, ["pet-1"]);
  assert.equal(res.body.pet.petHealth, 1000);
  assert.equal(res.body.pet.petAtk, 50);
  assert.equal(res.body.pet.petDef, 50);
  assert.equal(res.body.pet.petLevel, 1);
  assert.equal(res.body.pet.petLevelPoints, 0);
  assert.equal(res.body.pet.itemsUsedThisLevel, 0);
  assert.equal(res.body.user.coins, 700);
  assert.equal("password" in res.body.user, false);
});

test("stat reset still rejects insufficient coins before changing the pet", async () => {
  const fixture = setup({ coins: 299 });

  const res = await call(fixture.app, "/api/pet/:inventoryId/reset-stats", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
  });

  assert.deepEqual(
    [res.statusCode, res.body],
    [400, { message: "Not enough coins. Stat reset costs 300 coins." }],
  );
  assert.equal(fixture.calls.addCoins.length, 0);
  assert.equal(fixture.calls.updates.length, 0);
  assert.equal(fixture.calls.unequipAll.length, 0);
});

test("revert-to-egg preserves stats while clearing hatch state and accessories", async () => {
  const fixture = setup();

  const before = {
    petHealth: fixture.inventory["pet-1"].petHealth,
    petAtk: fixture.inventory["pet-1"].petAtk,
    petDef: fixture.inventory["pet-1"].petDef,
    petLevel: fixture.inventory["pet-1"].petLevel,
    petLevelPoints: fixture.inventory["pet-1"].petLevelPoints,
  };

  const res = await call(fixture.app, "/api/pet/:inventoryId/revert-to-egg", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.pet.isHatched, false);
  assert.equal(res.body.pet.hatchStartedAt, null);
  assert.deepEqual(fixture.calls.unequipAll, ["pet-1"]);
  for (const [key, value] of Object.entries(before)) {
    assert.equal(res.body.pet[key], value);
  }
});

test("legacy registry delegates pet state routes once before marketplace details", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  const source = fs.readFileSync("server/routes/petState.routes.ts", "utf8");

  for (const fragment of [
    'app.post("/api/pet/:inventoryId/world-defeat"',
    'app.post("/api/pet/:inventoryId/reset-stats"',
    'app.post("/api/pet/:inventoryId/revert-to-egg"',
  ]) {
    assert.equal(root.includes(fragment), false, fragment);
  }

  const petCare = root.indexOf("registerPetGiftLoyaltyRoutes(app");
  const state = root.indexOf("registerPetStateRoutes(app");
  const marketplace = root.indexOf('registerMarketplaceRoutes(app, marketplaceRouteDependencies, "details")');

  assert.ok(petCare >= 0);
  assert.ok(state > petCare);
  assert.ok(marketplace > state);
  assert.equal(root.match(/registerPetStateRoutes\(app/g)?.length, 1);

  assert.match(source, /Math\.max\(0, \(petInv\.petMood \?\? 100\) - 3\)/);
  assert.match(source, /currentUser\.coins < 300/);
  assert.match(source, /addCoins\(user\.id, -300\)/);
  assert.match(source, /petHealth: 1000/);
  assert.match(source, /petAtk: 50/);
  assert.match(source, /petDef: 50/);
  assert.match(source, /petLevel: 1/);
  assert.match(source, /itemsUsedThisLevel: 0/);
  assert.match(source, /isHatched: false/);
  assert.match(source, /hatchStartedAt: null/);
});
