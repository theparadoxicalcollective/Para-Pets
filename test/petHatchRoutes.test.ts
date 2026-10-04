import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetHatchRoute } from "../server/routes/petHatch.routes";

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

function setup(options: {
  hatched?: boolean;
  hatchStartedAt?: Date | null;
  hatchTime?: number | null;
  petLevel?: number;
  itemType?: string;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = { updates: [] as any[] };

  const inventory: Record<string, any> = {
    "pet-1": {
      id: "pet-1",
      userId: "user-1",
      shopItemId: "pet-shop",
      isHatched: options.hatched ?? false,
      hatchStartedAt: options.hatchStartedAt === undefined
        ? new Date(Date.now() - 2 * 60 * 60 * 1000)
        : options.hatchStartedAt,
      petLevel: options.petLevel ?? 0,
    },
    "foreign-pet": {
      id: "foreign-pet",
      userId: "user-2",
      shopItemId: "pet-shop",
      isHatched: false,
      hatchStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      petLevel: 1,
    },
  };

  const storage = {
    getInventoryItemById: async (id: string) => inventory[id] ?? null,
    getShopItem: async (id: string) => id === "pet-shop"
      ? { id, type: options.itemType ?? "pet", hatchTime: options.hatchTime === undefined ? 1 : options.hatchTime }
      : null,
    updateInventoryItem: async (id: string, patch: any) => {
      calls.updates.push([id, patch]);
      Object.assign(inventory[id], patch);
      return inventory[id];
    },
  };

  registerPetHatchRoute(app as any, {
    storage: storage as any,
    isAuthenticated: authenticated,
  });

  return { app, calls, inventory };
}

function route(app: RouteRecorder) {
  const found = app.routes.find(candidate =>
    candidate.method === "POST" && candidate.path === "/api/pet/:inventoryId/hatch-check"
  );
  assert.ok(found, "POST /api/pet/:inventoryId/hatch-check");
  return found;
}

async function call(app: RouteRecorder, inventoryId: string, userId = "user-1") {
  const res = response();
  await route(app).handlers.at(-1)!(
    { params: { inventoryId }, user: { id: userId } } as any,
    res,
    (() => {}) as any,
  );
  return res;
}

test("pet hatch module preserves the authenticated legacy route", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    ["POST /api/pet/:inventoryId/hatch-check"],
  );
  assert.equal(app.routes[0].handlers[0], authenticated);
});

test("hatch check preserves ownership and pet-type validation", async () => {
  const fixture = setup();

  const missing = await call(fixture.app, "missing");
  assert.deepEqual([missing.statusCode, missing.body], [404, { message: "Pet not found" }]);

  const foreign = await call(fixture.app, "foreign-pet");
  assert.deepEqual([foreign.statusCode, foreign.body], [404, { message: "Pet not found" }]);

  const notPet = setup({ itemType: "item" });
  const wrongType = await call(notPet.app, "pet-1");
  assert.deepEqual([wrongType.statusCode, wrongType.body], [400, { message: "Not a pet" }]);
});

test("already-hatched and not-yet-ready pets return status without mutation", async () => {
  const hatched = setup({ hatched: true });
  const already = await call(hatched.app, "pet-1");
  assert.deepEqual(already.body, { isHatched: true });
  assert.equal(hatched.calls.updates.length, 0);

  const waiting = setup({
    hatchStartedAt: new Date(),
    hatchTime: 24,
  });
  const notReady = await call(waiting.app, "pet-1");
  assert.deepEqual(notReady.body, { isHatched: false });
  assert.equal(waiting.calls.updates.length, 0);
});

test("ready hatch preserves the level-1 floor and hatch response", async () => {
  const fixture = setup({
    hatchStartedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    hatchTime: 1,
    petLevel: 0,
  });

  const res = await call(fixture.app, "pet-1");

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { isHatched: true });
  assert.deepEqual(fixture.calls.updates, [[
    "pet-1",
    { isHatched: true, petLevel: 1 },
  ]]);
});

test("zero or absent hatch time remains ready once hatching has started", async () => {
  const zero = setup({
    hatchStartedAt: new Date(),
    hatchTime: 0,
  });
  const res = await call(zero.app, "pet-1");
  assert.deepEqual(res.body, { isHatched: true });
  assert.equal(zero.calls.updates.length, 1);
});

test("legacy registry delegates hatch once between shop purchase and accessories", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  const source = fs.readFileSync("server/routes/petHatch.routes.ts", "utf8");

  assert.doesNotMatch(root, /app\.post\("\/api\/pet\/:inventoryId\/hatch-check"/);

  const shopPurchase = root.indexOf('app.post("/api/shop/:worldId/buy/:itemId"');
  const hatch = root.indexOf("registerPetHatchRoute(app");
  const accessories = root.indexOf("registerPetAccessoryRoutes(app");

  assert.ok(shopPurchase >= 0);
  assert.ok(hatch > shopPurchase);
  assert.ok(accessories > hatch);
  assert.equal(root.match(/registerPetHatchRoute\(app/g)?.length, 1);

  assert.match(source, /shopItem\.hatchTime \? shopItem\.hatchTime \* 3600000 : 0/);
  assert.match(source, /Math\.max\(1, invItem\.petLevel \|\| 0\)/);
  assert.match(source, /isHatched: true/);
});
