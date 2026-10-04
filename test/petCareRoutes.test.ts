import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetFeedingRoute, registerPetPettingRewardRoute } from "../server/routes/petCare.routes";

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
  const calls: any = {
    addCoins: [] as any[],
    pettingStateWrites: [] as any[],
  };

  const inventory: Record<string, any> = {
    "pet-1": {
      id: "pet-1",
      userId: "user-1",
      shopItemId: "pet-shop",
      isHatched: true,
      petLevel: 2,
      petLevelPoints: 10,
      petHunger: 500,
      petMood: 60,
      petFeedPoints: 12,
    },
    "pet-unhatched": {
      id: "pet-unhatched",
      userId: "user-1",
      shopItemId: "pet-shop",
      isHatched: false,
      petLevel: 1,
      petLevelPoints: 0,
      petHunger: 1000,
      petMood: 100,
    },
    "edible-1": {
      id: "edible-1",
      userId: "user-1",
      shopItemId: "edible-shop",
      quantity: 2,
      isListed: false,
    },
  };

  const storage = {
    getPetPettingState: async (userId: string, inventoryId: string) => {
      if (userId !== "user-1" || inventoryId !== "pet-1") return null;
      return { lastPettingRewardAt: null, pettingRewardsToday: 0 };
    },
    getInventoryItemById: async (id: string) => inventory[id] ?? null,
    updateInventoryItem: async (id: string, patch: any) => {
      Object.assign(inventory[id], patch);
      return inventory[id];
    },
    addCoins: async (userId: string, amount: number) => {
      calls.addCoins.push([userId, amount]);
      return { coins: 250 + amount };
    },
    setPetPettingState: async (...args: any[]) => {
      calls.pettingStateWrites.push(args);
    },
    getUser: async () => ({ coins: 250 }),
    getShopItem: async (id: string) => {
      if (id === "edible-shop") return { id, type: "edibles", statBoostAmount: 5, petExp: 0 };
      if (id === "pet-shop") return { id, type: "pet" };
      return null;
    },
  };

  const deps = {
    storage: storage as any,
    db: { transaction: async () => { throw new Error("transaction should not run in validation tests"); } } as any,
    isAuthenticated: authenticated,
    applyPetXp: (level: number, points: number, amount: number) => ({ newLevel: level, newPoints: points + amount }),
    incrementQuestProgress: async () => {},
  };

  registerPetPettingRewardRoute(app as any, deps);
  registerPetFeedingRoute(app as any, deps);

  return { app, calls };
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

test("pet care module preserves the petting and feeding routes with authentication", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "POST /api/pets/:inventoryId/petting-reward",
      "POST /api/pet/:inventoryId/feed-edible",
    ],
  );

  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], authenticated);
  }
});

test("first daily petting reward remains 10 coins for the owned pet", async () => {
  const { app, calls } = setup();
  const res = await call(app, "/api/pets/:inventoryId/petting-reward", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.rewarded, true);
  assert.equal(res.body.amount, 10);
  assert.deepEqual(calls.addCoins, [["user-1", 10]]);
  assert.equal(calls.pettingStateWrites.length, 1);
  assert.equal(calls.pettingStateWrites[0][0], "user-1");
  assert.equal(calls.pettingStateWrites[0][1], "pet-1");
  assert.equal(calls.pettingStateWrites[0][3], 1);
});

test("feeding preserves request validation and hatched-pet ownership boundary", async () => {
  const { app } = setup();

  const missingItem = await call(app, "/api/pet/:inventoryId/feed-edible", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
    body: {},
  });
  assert.deepEqual([missingItem.statusCode, missingItem.body], [400, { message: "itemInventoryId required" }]);

  const invalidQuantity = await call(app, "/api/pet/:inventoryId/feed-edible", {
    params: { inventoryId: "pet-1" },
    user: { id: "user-1" },
    body: { itemInventoryId: "edible-1", quantity: 0 },
  });
  assert.deepEqual([invalidQuantity.statusCode, invalidQuantity.body], [400, { message: "Quantity must be a positive integer" }]);

  const unhatched = await call(app, "/api/pet/:inventoryId/feed-edible", {
    params: { inventoryId: "pet-unhatched" },
    user: { id: "user-1" },
    body: { itemInventoryId: "edible-1", quantity: 1 },
  });
  assert.deepEqual([unhatched.statusCode, unhatched.body], [400, { message: "Pet has not hatched yet" }]);
});

test("pet care source preserves mood, reward, hunger, XP, consumption, and quest rules", () => {
  const source = fs.readFileSync("server/routes/petCare.routes.ts", "utf8");

  assert.match(source, /const BATTLE_DEFEAT_RECENT_MINUTES = 60/);
  assert.match(source, /const BATTLE_DEFEAT_MOOD_CAP = 70/);
  assert.match(source, /const MAX_REWARDS_PER_DAY = 5/);
  assert.match(source, /const EXTRA_REWARD_CHANCE = 0\.30/);
  assert.match(source, /const amount = 3 \+ Math\.floor\(Math\.random\(\) \* 3\)/);
  assert.match(source, /const maxHunger = 1000/);
  assert.match(source, /const moodGain = wasHungry \? 1 : 3/);
  assert.match(source, /applyPetXp\(Number\(current\.pet_level\), Number\(current\.pet_level_points\), expAdded\)/);
  assert.match(source, /tryConsumeInventoryQuantity\(tx, user\.id, itemInv\.id, quantity\)/);
  assert.match(source, /incrementQuestProgress\(user\.id, "feed_pet"\)\.catch/);
});

test("legacy registry keeps original pet care registration order around Molten Blocks", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.doesNotMatch(root, /app\.post\("\/api\/pets\/:inventoryId\/petting-reward"/);
  assert.doesNotMatch(root, /app\.post\("\/api\/pet\/:inventoryId\/feed-edible"/);

  const progression = root.indexOf("registerPetProgressionItemRoutes(app");
  const petting = root.indexOf("registerPetPettingRewardRoute(app");
  const molten = root.indexOf("registerMoltenBlocksRoutes(app");
  const feeding = root.indexOf("registerPetFeedingRoute(app");
  const gift = root.indexOf('app.post("/api/pet/:inventoryId/give-gift"');

  assert.ok(progression >= 0);
  assert.ok(petting > progression);
  assert.ok(molten > petting);
  assert.ok(feeding > molten);
  assert.ok(gift > feeding);
  assert.equal(root.match(/registerPetPettingRewardRoute\(app/g)?.length, 1);
  assert.equal(root.match(/registerPetFeedingRoute\(app/g)?.length, 1);
});
