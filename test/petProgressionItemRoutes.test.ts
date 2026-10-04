import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetProgressionItemRoutes } from "../server/routes/petProgressionItem.routes";

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

function setup() {
  const app = new RouteRecorder();
  const inventory: Record<string, any> = {
    "pet-1": {
      id: "pet-1",
      userId: "user-1",
      shopItemId: "pet-shop",
      isHatched: true,
      petLevel: 2,
      petLevelPoints: 25,
      itemsUsedThisLevel: 0,
      petHealth: 1000,
      petAtk: 50,
      petDef: 50,
      hatchStartedAt: new Date("2026-10-04T00:00:00Z"),
    },
    "pet-unhatched": {
      id: "pet-unhatched",
      userId: "user-1",
      shopItemId: "pet-shop",
      isHatched: false,
      petLevel: 1,
      petLevelPoints: 0,
      itemsUsedThisLevel: 0,
      petHealth: 1000,
      petAtk: 50,
      petDef: 50,
      hatchStartedAt: new Date("2026-10-04T00:00:00Z"),
    },
    "power-1": {
      id: "power-1",
      userId: "user-1",
      shopItemId: "power-shop",
      quantity: 1,
      isListed: false,
    },
    "special-1": {
      id: "special-1",
      userId: "user-1",
      shopItemId: "special-shop",
      quantity: 1,
      isListed: false,
    },
    "foreign-item": {
      id: "foreign-item",
      userId: "user-2",
      shopItemId: "power-shop",
      quantity: 1,
      isListed: false,
    },
  };

  const storage = {
    getInventoryItemById: async (id: string) => inventory[id] ?? null,
    getShopItem: async (id: string) => {
      if (id === "pet-shop") return { id, type: "pet", rarity: 3, hatchTime: 24 };
      if (id === "power-shop") return { id, type: "power_up", statBoostType: "atk", statBoostAmount: 10 };
      if (id === "special-shop") return { id, type: "special", specialType: "level", specialAmount: 10 };
      return null;
    },
  };

  const db = {
    transaction: async (callback: any) => callback({}),
    execute: async () => ({ rows: [] }),
  };

  registerPetProgressionItemRoutes(app as any, {
    storage: storage as any,
    db: db as any,
    isAuthenticated: authenticated,
    applyPetXp: (level, points, amount) => ({ newLevel: level, newPoints: points + amount }),
    incrementQuestProgress: async () => {},
  });

  return { app };
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

test("pet progression item module preserves the two authenticated legacy routes in order", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "POST /api/pet/:inventoryId/power-up",
      "POST /api/pet/:inventoryId/use-special",
    ],
  );

  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], authenticated);
  }
});

test("power-up and special-item routes preserve owner and hatch validation before mutation", async () => {
  const { app } = setup();

  const missingPet = await call(app, "/api/pet/:inventoryId/power-up", {
    params: { inventoryId: "missing" },
    user: { id: "user-1" },
    body: { itemInventoryId: "power-1" },
  });
  assert.deepEqual([missingPet.statusCode, missingPet.body], [404, { message: "Pet not found" }]);

  const unhatched = await call(app, "/api/pet/:inventoryId/power-up", {
    params: { inventoryId: "pet-unhatched" },
    user: { id: "user-1" },
    body: { itemInventoryId: "power-1" },
  });
  assert.deepEqual([unhatched.statusCode, unhatched.body], [400, { message: "Pet has not hatched yet" }]);

  const foreignItem = await call(app, "/api/pet/:inventoryId/use-special", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
    body: { itemInventoryId: "foreign-item" },
  });
  assert.deepEqual([foreignItem.statusCode, foreignItem.body], [404, { message: "Item not found in inventory" }]);
});

test("extracted source preserves power-up slot rules, atomic consumption, quest progress, and tutorial authorization", () => {
  const source = fs.readFileSync("server/routes/petProgressionItem.routes.ts", "utf8");

  assert.match(source, /const maxItemsPerLevel = rawRarity <= 2 \? 1 : rawRarity === 3 \? 2 : 3/);
  assert.match(source, /const totalAllowances = petLevel \* maxItemsPerLevel/);
  assert.match(source, /tryConsumeOneFromInventory\(tx, user\.id, itemInv\.id\)/);
  assert.match(source, /incrementQuestProgress\(user\.id, "use_powerup"\)\.catch/);
  assert.match(source, /tutorial_hatch_potions_claimed, tutorial_quest_completed/);
  assert.match(source, /BEGIN_JOURNEY_TUTORIAL\.hatchPotion\.quantity/);
  assert.match(source, /specialAmount \* 60 \* 1000/);
  assert.match(source, /applyPetXp\(currentLevel, petInv\.petLevelPoints \|\| 0, specialAmount\)/);
});

test("legacy registry keeps one progression registration between accessories and petting", () => {
  const routes = fs.readFileSync("server/routes.ts", "utf8");

  assert.doesNotMatch(routes, /app\.post\("\/api\/pet\/:inventoryId\/power-up"/);
  assert.doesNotMatch(routes, /app\.post\("\/api\/pet\/:inventoryId\/use-special"/);

  const accessories = routes.indexOf("registerPetAccessoryRoutes(app");
  const progression = routes.indexOf("registerPetProgressionItemRoutes(app");
  const petting = routes.indexOf("registerPetPettingRewardRoute(app");

  assert.ok(accessories >= 0);
  assert.ok(progression > accessories);
  assert.ok(petting > progression);
  assert.equal(routes.match(/registerPetProgressionItemRoutes\(app/g)?.length, 1);
});
