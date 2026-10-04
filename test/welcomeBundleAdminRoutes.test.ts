import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerWelcomeBundleAdminRoutes } from "../server/routes/welcomeBundleAdmin.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  get(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "GET", path, handlers });
    return this;
  }

  put(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "PUT", path, handlers });
    return this;
  }
}

const admin: RequestHandler = (_req, _res, next) => next();

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

function setup(options: { failGet?: boolean; failSet?: boolean } = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    getConfig: 0,
    getItems: 0,
    setSetting: [],
    effects: [],
  };

  registerWelcomeBundleAdminRoutes(app as any, {
    isAdmin: admin,
    getWelcomeBundleConfig: async () => {
      calls.getConfig += 1;
      return {
        coinAmount: 500,
        message: "Welcome",
        items: [
          { name: "Ire Deer", qty: 1 },
          { name: "Basic Health Potion", qty: 10 },
          { name: "Missing Item", qty: 2 },
        ],
      };
    },
    computeItemEffect: (shop: any) => {
      calls.effects.push(shop?.name ?? null);
      return shop ? `effect:${shop.name}` : null;
    },
    storage: {
      getAllShopItems: async () => {
        calls.getItems += 1;
        if (options.failGet) throw new Error("get failed");
        return [
          {
            id: "pet-1",
            name: "ire deer",
            type: "pet",
            imageUrl: null,
            eggImageUrl: "/egg.webp",
            hatchedImageUrl: "/hatched.webp",
            hooklessImageUrl: "/hookless.webp",
            sleepingImageUrl: "/sleep.webp",
          },
          {
            id: "potion-1",
            name: "Basic Health Potion",
            type: "potion",
            imageUrl: "/potion.webp",
            eggImageUrl: "/not-used.webp",
          },
        ] as any;
      },
      setGameSetting: async (key: string, value: string) => {
        calls.setSetting.push([key, value]);
        if (options.failSet) throw new Error("set failed");
      },
    } as any,
  });

  return { app, calls };
}

function route(app: RouteRecorder, method: string, path: string) {
  const found = app.routes.find(
    candidate => candidate.method === method && candidate.path === path,
  );
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

test("Welcome Bundle admin module registers the two legacy routes with admin middleware first", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/admin/welcome-bundle",
      "PUT /api/admin/welcome-bundle",
    ],
  );

  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], admin);
  }
});

test("Welcome Bundle read preserves case-insensitive matching, artwork fallback, and response shape", async () => {
  const { app, calls } = setup();

  const res = await call(app, "GET", "/api/admin/welcome-bundle");

  assert.equal(calls.getConfig, 1);
  assert.equal(calls.getItems, 1);
  assert.deepEqual(calls.effects, [
    "ire deer",
    "Basic Health Potion",
    null,
  ]);
  assert.deepEqual(res.body, {
    coinAmount: 500,
    message: "Welcome",
    items: [
      {
        name: "Ire Deer",
        qty: 1,
        found: true,
        imageUrl: "/egg.webp",
        type: "pet",
        effect: "effect:ire deer",
      },
      {
        name: "Basic Health Potion",
        qty: 10,
        found: true,
        imageUrl: "/potion.webp",
        type: "potion",
        effect: "effect:Basic Health Potion",
      },
      {
        name: "Missing Item",
        qty: 2,
        found: false,
        imageUrl: null,
        type: null,
        effect: null,
      },
    ],
  });
});

test("Welcome Bundle save preserves legacy coercion and game-setting storage", async () => {
  const { app, calls } = setup();

  const res = await call(app, "PUT", "/api/admin/welcome-bundle", {
    body: {
      coinAmount: "750",
      message: "",
      items: [{ name: "Sturdy Rod", qty: 1 }],
    },
  });

  const expected = {
    coinAmount: 750,
    message: "",
    items: [{ name: "Sturdy Rod", qty: 1 }],
  };
  assert.deepEqual(calls.setSetting, [
    ["welcome_bundle_config", JSON.stringify(expected)],
  ]);
  assert.deepEqual(res.body, { success: true, config: expected });

  const fallback = await call(app, "PUT", "/api/admin/welcome-bundle", {
    body: { coinAmount: "not-a-number" },
  });
  assert.deepEqual(fallback.body, {
    success: true,
    config: { coinAmount: 0, message: "", items: [] },
  });
});

test("Welcome Bundle admin routes preserve legacy 500 responses", async () => {
  const readFixture = setup({ failGet: true });
  const read = await call(readFixture.app, "GET", "/api/admin/welcome-bundle");
  assert.deepEqual(
    [read.statusCode, read.body],
    [500, { message: "Failed to get welcome bundle config" }],
  );

  const saveFixture = setup({ failSet: true });
  const save = await call(saveFixture.app, "PUT", "/api/admin/welcome-bundle", {
    body: { coinAmount: 1, message: "x", items: [] },
  });
  assert.deepEqual(
    [save.statusCode, save.body],
    [500, { message: "Failed to save welcome bundle config" }],
  );
});

test("legacy registry has one Welcome Bundle admin registration boundary and no inline handlers", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal(
    (root.match(/registerWelcomeBundleAdminRoutes\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/admin/welcome-bundle"'), false);
  assert.equal(root.includes('app.put("/api/admin/welcome-bundle"'), false);

  const registration = root.indexOf("registerWelcomeBundleAdminRoutes(app,");
  const pendingRewards = root.indexOf('app.get("/api/rewards/pending"');
  assert.ok(registration >= 0);
  assert.ok(pendingRewards > registration);
  assert.match(root, /getWelcomeBundleConfig,/);
  assert.match(root, /computeItemEffect,/);
});
