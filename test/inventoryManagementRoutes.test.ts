import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerInventoryManagementRoutes } from "../server/routes/inventoryManagement.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  post(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "POST", path, handlers });
    return this;
  }

  delete(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "DELETE", path, handlers });
    return this;
  }

  patch(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "PATCH", path, handlers });
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
  activePetId?: string | null;
  scarfInventoryId?: string | null;
  badWords?: string[];
} = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    removed: [] as string[],
    updates: [] as any[],
    coinChanges: [] as any[],
  };

  const inventory: Record<string, any> = {
    "item-stack": {
      id: "item-stack",
      userId: "user-1",
      shopItemId: "item-shop",
      quantity: 5,
    },
    "pet-1": {
      id: "pet-1",
      userId: "user-1",
      shopItemId: "pet-shop",
      quantity: 1,
    },
    "fish-1": {
      id: "fish-1",
      userId: "user-1",
      shopItemId: "fish-shop",
      quantity: 1,
    },
    "scarf-1": {
      id: "scarf-1",
      userId: "user-1",
      shopItemId: "scarf-shop",
      quantity: 1,
    },
    "foreign-item": {
      id: "foreign-item",
      userId: "user-2",
      shopItemId: "item-shop",
      quantity: 2,
    },
  };

  const storage = {
    getInventoryItemById: async (id: string) => inventory[id] ?? null,
    getShopItem: async (id: string) => {
      if (id === "pet-shop") return { id, type: "pet" };
      if (id === "fish-shop") return { id, type: "item", fishingType: "fish" };
      return { id, type: "item", fishingType: null };
    },
    removeFromInventory: async (id: string) => {
      calls.removed.push(id);
      delete inventory[id];
    },
    updateInventoryItem: async (id: string, patch: any) => {
      calls.updates.push([id, patch]);
      Object.assign(inventory[id], patch);
      return inventory[id];
    },
    addCoins: async (userId: string, amount: number) => {
      calls.coinChanges.push([userId, amount]);
      return { coins: 100 + amount };
    },
    getUserInventory: async (userId: string) =>
      Object.values(inventory).filter((item: any) => item.userId === userId),
  };

  const scarfInventoryId = options.scarfInventoryId ?? null;
  const db = {
    execute: async () => ({
      rows: scarfInventoryId
        ? [{ value: JSON.stringify({ status: "taken", kills: 5, scarfInventoryId }) }]
        : [],
    }),
  };

  const badWords = new Set((options.badWords ?? []).map(word => word.toLowerCase()));
  const containsBadWord = async (text: string) => badWords.has(text.toLowerCase());

  registerInventoryManagementRoutes(app as any, {
    storage: storage as any,
    db: db as any,
    isAuthenticated: authenticated,
    containsBadWord,
  });

  const user = {
    id: "user-1",
    activePetId: options.activePetId ?? null,
  };

  return { app, calls, inventory, user };
}

function route(app: RouteRecorder, method: string, path: string) {
  const found = app.routes.find(candidate => candidate.method === method && candidate.path === path);
  assert.ok(found, `${method} ${path}`);
  return found;
}

async function call(app: RouteRecorder, method: string, path: string, req: any) {
  const res = response();
  await route(app, method, path).handlers.at(-1)!(req, res, (() => {}) as any);
  return res;
}

test("inventory management module preserves three authenticated routes in legacy order", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "POST /api/shop/sell-items",
      "DELETE /api/inventory/:inventoryId",
      "PATCH /api/inventory/:inventoryId/nickname",
    ],
  );

  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], authenticated);
  }
});

test("sell-items preserves two-coins-per-item stack behavior", async () => {
  const fixture = setup();

  const res = await call(fixture.app, "POST", "/api/shop/sell-items", {
    user: fixture.user,
    body: { items: [{ inventoryId: "item-stack", quantity: 3 }] },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { coinsEarned: 6, newBalance: 106 });
  assert.deepEqual(fixture.calls.updates, [["item-stack", { quantity: 2 }]]);
  assert.deepEqual(fixture.calls.coinChanges, [["user-1", 6]]);
  assert.equal(fixture.calls.removed.length, 0);
});

test("sell-items still excludes pets, fish, foreign inventory, and empty requests", async () => {
  const fixture = setup();

  const empty = await call(fixture.app, "POST", "/api/shop/sell-items", {
    user: fixture.user,
    body: { items: [] },
  });
  assert.deepEqual([empty.statusCode, empty.body], [400, { message: "items array required" }]);

  const invalidOnly = await call(fixture.app, "POST", "/api/shop/sell-items", {
    user: fixture.user,
    body: {
      items: [
        { inventoryId: "pet-1", quantity: 1 },
        { inventoryId: "fish-1", quantity: 1 },
        { inventoryId: "foreign-item", quantity: 1 },
      ],
    },
  });
  assert.deepEqual([invalidOnly.statusCode, invalidOnly.body], [400, { message: "No valid items to sell" }]);
  assert.equal(fixture.calls.coinChanges.length, 0);
});

test("delete route preserves active-pet and Lonelle scarf protections", async () => {
  const active = setup({ activePetId: "pet-1" });
  const activeResult = await call(active.app, "DELETE", "/api/inventory/:inventoryId", {
    user: active.user,
    params: { inventoryId: "pet-1" },
  });
  assert.deepEqual(
    [activeResult.statusCode, activeResult.body],
    [400, { message: "Cannot delete your active pet" }],
  );
  assert.equal(active.calls.removed.length, 0);

  const scarf = setup({ scarfInventoryId: "scarf-1" });
  const scarfResult = await call(scarf.app, "DELETE", "/api/inventory/:inventoryId", {
    user: scarf.user,
    params: { inventoryId: "scarf-1" },
  });
  assert.deepEqual(
    [scarfResult.statusCode, scarfResult.body],
    [409, { message: "Return Lonelle's quest scarf before deleting it" }],
  );
  assert.equal(scarf.calls.removed.length, 0);
});

test("delete route removes a normal owned item", async () => {
  const fixture = setup();

  const res = await call(fixture.app, "DELETE", "/api/inventory/:inventoryId", {
    user: fixture.user,
    params: { inventoryId: "item-stack" },
  });

  assert.deepEqual(res.body, { success: true });
  assert.deepEqual(fixture.calls.removed, ["item-stack"]);
});

test("nickname route preserves moderation, ownership, trimming, and 20-character limit", async () => {
  const blocked = setup({ badWords: ["blocked"] });
  const blockedResult = await call(blocked.app, "PATCH", "/api/inventory/:inventoryId/nickname", {
    user: blocked.user,
    params: { inventoryId: "item-stack" },
    body: { nickname: "blocked" },
  });
  assert.deepEqual(
    [blockedResult.statusCode, blockedResult.body],
    [400, { message: "That name contains a forbidden word. Please choose another." }],
  );

  const fixture = setup();
  const res = await call(fixture.app, "PATCH", "/api/inventory/:inventoryId/nickname", {
    user: fixture.user,
    params: { inventoryId: "item-stack" },
    body: { nickname: "   1234567890123456789012345   " },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.petNickname, "12345678901234567890");
  assert.deepEqual(
    fixture.calls.updates,
    [["item-stack", { petNickname: "12345678901234567890" }]],
  );

  const foreign = await call(fixture.app, "PATCH", "/api/inventory/:inventoryId/nickname", {
    user: fixture.user,
    params: { inventoryId: "foreign-item" },
    body: { nickname: "Mine" },
  });
  assert.deepEqual([foreign.statusCode, foreign.body], [404, { message: "Item not found" }]);
});

test("legacy registry delegates inventory management once between inventory read and shop purchase", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  const source = fs.readFileSync("server/routes/inventoryManagement.routes.ts", "utf8");

  for (const fragment of [
    'app.post("/api/shop/sell-items"',
    'app.delete("/api/inventory/:inventoryId"',
    'app.patch("/api/inventory/:inventoryId/nickname"',
  ]) {
    assert.equal(root.includes(fragment), false, fragment);
  }

  const inventoryRead = root.indexOf('app.get("/api/inventory"');
  const management = root.indexOf("registerInventoryManagementRoutes(app");
  const shopPurchase = root.indexOf('app.post("/api/shop/:worldId/buy/:itemId"');

  assert.ok(inventoryRead >= 0);
  assert.ok(management > inventoryRead);
  assert.ok(shopPurchase > management);
  assert.equal(root.match(/registerInventoryManagementRoutes\(app/g)?.length, 1);

  assert.match(source, /const COINS_PER_ITEM = 2/);
  assert.match(source, /shopItem\?\.type === "pet"/);
  assert.match(source, /shopItem\?\.fishingType === "fish"/);
  assert.match(source, /item\.id === user\.activePetId/);
  assert.match(source, /LONELLE_KEY\(user\.id\)/);
  assert.match(source, /parseLonelleProgress/);
  assert.match(source, /slice\(0, 20\)/);
  assert.match(source, /containsBadWord\(trimmed\)/);
});
