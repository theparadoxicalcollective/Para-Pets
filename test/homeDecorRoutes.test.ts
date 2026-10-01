import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerHomeDecorRoutes } from "../server/routes/homeDecor.routes";

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
  patch(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "PATCH", path, handlers });
    return this;
  }
  delete(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "DELETE", path, handlers });
    return this;
  }
}

const authenticated: RequestHandler = (_req, _res, next) => next();
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

function setup() {
  const calls: any = {
    catalog: 0,
    created: [],
    deleted: [],
    locationRows: [],
    assigned: [],
    unassigned: [],
    inventory: [],
    placed: [],
    update: [],
    place: [],
    remove: [],
    image: [],
    grants: [],
  };
  const app = new RouteRecorder();

  registerHomeDecorRoutes(app as any, {
    storage: {
      getHomeDecorItems: async () => {
        calls.catalog++;
        return [{ id: "decor-1" }] as any;
      },
      createHomeDecorItem: async (data: any) => {
        calls.created.push(data);
        return { id: "decor-new", ...data } as any;
      },
      deleteHomeDecorItem: async (id: string) => {
        calls.deleted.push(id);
      },
      getLocationHomeDecor: async (locationId: string) => {
        calls.locationRows.push(locationId);
        return [
          { id: "stock-1", locationId, decorItemId: "decor-1", decor: { id: "decor-1", name: "Lamp" } },
        ] as any;
      },
      addDecorToShop: async (locationId: string, decorId: string) => {
        calls.assigned.push([locationId, decorId]);
        return { id: "stock-new", locationId, decorItemId: decorId } as any;
      },
      removeDecorFromShop: async (locationId: string, decorId: string) => {
        calls.unassigned.push([locationId, decorId]);
      },
      getAllUsers: async () => [{ id: "u1" }, { id: "u2" }] as any,
      grantHomeDecorToUser: async (userId: string, decorItemId: string) => {
        calls.grants.push([userId, decorItemId]);
      },
      getUserHomeDecorInventory: async (id: string) => {
        calls.inventory.push(id);
        return [{ id: "inventory" }] as any;
      },
      getPlacedHomeDecor: async (id: string, location?: string) => {
        calls.placed.push([id, location]);
        return [{ id: "placed" }] as any;
      },
      updatePlacedHomeDecor: async (id: string, userId: string, data: any) => {
        calls.update.push([id, userId, data]);
        return { id } as any;
      },
    },
    isAuthenticated: authenticated,
    isAdmin: admin,
    executeDecorPlacement: async (userId: string, id: string, data: any) => {
      calls.place.push([userId, id, data]);
      return { id: "new-placement" } as any;
    },
    executeDecorRemoval: async (userId: string, id: string) => {
      calls.remove.push([userId, id]);
      return { decorItemId: "decor-1" };
    },
    processWorldImage: async (imageData: string, maxSize: number) => {
      calls.image.push([imageData, maxSize]);
      return `processed-${maxSize}`;
    },
  });

  return { app, calls };
}

function route(app: RouteRecorder, method: string, path: string) {
  const found = app.routes.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  assert.ok(found, `${method} ${path}`);
  return found;
}

async function handler(
  app: RouteRecorder,
  method: string,
  path: string,
  req: any,
) {
  const res = response();
  await route(app, method, path).handlers.at(-1)!(req, res, (() => {}) as any);
  return res;
}

const expected = [
  "GET /api/admin/home-decor",
  "POST /api/admin/home-decor",
  "DELETE /api/admin/home-decor/:id",
  "GET /api/admin/location/:locationId/shop-decor",
  "POST /api/admin/location/:locationId/assign-decor/:decorId",
  "DELETE /api/admin/location/:locationId/unassign-decor/:decorId",
  "GET /api/locations/:locationId/shop-decor",
  "GET /api/pet-house/decor/inventory",
  "GET /api/pet-house/decor/placed",
  "GET /api/users/:userId/pet-house/decor/placed",
  "POST /api/pet-house/decor/place",
  "PATCH /api/pet-house/decor/placed/:id",
  "DELETE /api/pet-house/decor/placed/:id",
  "POST /api/admin/home-decor/:id/grant-everyone",
];

test("complete Home Decor module owns every Home Decor route exactly once", () => {
  const { app } = setup();
  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    expected,
  );
  assert.equal(new Set(expected).size, expected.length);
});

test("Home Decor auth boundaries remain unchanged", () => {
  const { app } = setup();

  for (const registered of app.routes) {
    if (registered.path.startsWith("/api/admin/")) {
      assert.equal(registered.handlers[0], admin, registered.path);
    } else if (registered.path.startsWith("/api/users/")) {
      assert.equal(registered.handlers.length, 1, registered.path);
    } else {
      assert.equal(registered.handlers[0], authenticated, registered.path);
    }
  }
});

test("admin Home Decor catalog preserves image processing and CRUD contracts", async () => {
  const { app, calls } = setup();

  const list = await handler(app, "GET", "/api/admin/home-decor", {});
  assert.equal(calls.catalog, 1);
  assert.deepEqual(list.body, [{ id: "decor-1" }]);

  const create = await handler(app, "POST", "/api/admin/home-decor", {
    body: { name: "Forest Lamp", price: 125, imageData: "raw-image" },
  });
  assert.deepEqual(calls.image, [["raw-image", 2000]]);
  assert.deepEqual(calls.created, [
    { name: "Forest Lamp", price: 125, imageUrl: "processed-2000" },
  ]);
  assert.equal(create.statusCode, 201);

  const missing = await handler(app, "POST", "/api/admin/home-decor", {
    body: { price: 10 },
  });
  assert.deepEqual(
    [missing.statusCode, missing.body],
    [400, { message: "name is required" }],
  );

  await handler(app, "DELETE", "/api/admin/home-decor/:id", {
    params: { id: "decor-1" },
  });
  assert.deepEqual(calls.deleted, ["decor-1"]);
});

test("world-shop Decor assignment and player listing keep existing response shapes", async () => {
  const { app, calls } = setup();

  const adminList = await handler(
    app,
    "GET",
    "/api/admin/location/:locationId/shop-decor",
    { params: { locationId: "bayou-shop" } },
  );
  assert.equal(adminList.body[0].decorItemId, "decor-1");

  const assigned = await handler(
    app,
    "POST",
    "/api/admin/location/:locationId/assign-decor/:decorId",
    { params: { locationId: "bayou-shop", decorId: "decor-2" } },
  );
  assert.equal(assigned.body.decorItemId, "decor-2");

  const playerList = await handler(
    app,
    "GET",
    "/api/locations/:locationId/shop-decor",
    { params: { locationId: "bayou-shop" } },
  );
  assert.deepEqual(playerList.body, [{ id: "decor-1", name: "Lamp" }]);

  await handler(
    app,
    "DELETE",
    "/api/admin/location/:locationId/unassign-decor/:decorId",
    { params: { locationId: "bayou-shop", decorId: "decor-2" } },
  );

  assert.deepEqual(calls.assigned, [["bayou-shop", "decor-2"]]);
  assert.deepEqual(calls.unassigned, [["bayou-shop", "decor-2"]]);
});

test("Decor/Object inventory and placement behavior stays delegated to existing storage and transactions", async () => {
  const { app, calls } = setup();

  await handler(app, "GET", "/api/pet-house/decor/inventory", {
    user: { id: "owner" },
  });
  await handler(app, "GET", "/api/pet-house/decor/placed", {
    user: { id: "owner" },
    query: { location: "inside" },
  });
  await handler(app, "GET", "/api/users/:userId/pet-house/decor/placed", {
    params: { userId: "visited" },
    query: { location: "outside" },
  });

  const placed = await handler(app, "POST", "/api/pet-house/decor/place", {
    user: { id: "owner" },
    body: { userId: "victim", decorItemId: "scene-item-1" },
  });

  assert.deepEqual(calls.inventory, ["owner"]);
  assert.deepEqual(calls.placed, [
    ["owner", "inside"],
    ["visited", "outside"],
  ]);
  assert.deepEqual(calls.place, [
    ["owner", "scene-item-1", {
      xPct: 0.5,
      yPct: 0.5,
      size: 250,
      flipped: false,
      location: "outside",
    }],
  ]);
  assert.deepEqual([placed.statusCode, placed.body], [
    201,
    { id: "new-placement" },
  ]);
});

test("placement PATCH/removal remain scoped to the authenticated player", async () => {
  const { app, calls } = setup();

  const patch = await handler(app, "PATCH", "/api/pet-house/decor/placed/:id", {
    user: { id: "owner" },
    params: { id: "placed-1", userId: "victim" },
    body: { userId: "victim", xPct: 0.2, location: "other" },
  });

  assert.deepEqual(calls.update, [
    ["placed-1", "owner", {
      xPct: 0.2,
      yPct: undefined,
      size: undefined,
      flipped: undefined,
    }],
  ]);
  assert.deepEqual(patch.body, { id: "placed-1" });

  const removed = await handler(
    app,
    "DELETE",
    "/api/pet-house/decor/placed/:id",
    {
      user: { id: "owner" },
      params: { id: "placed-1", userId: "victim" },
      body: { userId: "victim" },
    },
  );

  assert.deepEqual(calls.remove, [["owner", "placed-1"]]);
  assert.deepEqual(removed.body, { ok: true, decorItemId: "decor-1" });
});

test("grant-everyone remains admin-only and grants one copy to every current user", async () => {
  const { app, calls } = setup();

  const res = await handler(
    app,
    "POST",
    "/api/admin/home-decor/:id/grant-everyone",
    { params: { id: "decor-gift" } },
  );

  assert.deepEqual(calls.grants, [
    ["u1", "decor-gift"],
    ["u2", "decor-gift"],
  ]);
  assert.deepEqual(res.body, { ok: true, granted: 2 });
});

test("Home Decor error status codes remain unchanged", async () => {
  const app = new RouteRecorder();

  registerHomeDecorRoutes(app as any, {
    storage: {
      getHomeDecorItems: async () => { throw new Error("catalog failed"); },
      createHomeDecorItem: async () => { throw new Error("create failed"); },
      deleteHomeDecorItem: async () => { throw new Error("delete failed"); },
      getLocationHomeDecor: async () => { throw new Error("shop failed"); },
      addDecorToShop: async () => { throw new Error("assign failed"); },
      removeDecorFromShop: async () => { throw new Error("unassign failed"); },
      getAllUsers: async () => { throw new Error("users failed"); },
      grantHomeDecorToUser: async () => { throw new Error("grant failed"); },
      getUserHomeDecorInventory: async () => { throw new Error("read failed"); },
      getPlacedHomeDecor: async () => { throw new Error("read failed"); },
      updatePlacedHomeDecor: async () => { throw new Error("update failed"); },
    },
    isAuthenticated: authenticated,
    isAdmin: admin,
    executeDecorPlacement: async () => { throw new Error("place failed"); },
    executeDecorRemoval: async () => { throw new Error("remove failed"); },
    processWorldImage: async () => { throw new Error("image failed"); },
  } as any);

  const cases = [
    ["GET", "/api/admin/home-decor", {}, 500, "catalog failed"],
    ["POST", "/api/admin/home-decor", { body: { name: "X" } }, 500, "create failed"],
    ["GET", "/api/admin/location/:locationId/shop-decor", { params: { locationId: "x" } }, 500, "shop failed"],
    ["GET", "/api/pet-house/decor/inventory", { user: { id: "u" } }, 500, "read failed"],
    ["POST", "/api/pet-house/decor/place", { user: { id: "u" }, body: { decorItemId: "d" } }, 400, "place failed"],
    ["PATCH", "/api/pet-house/decor/placed/:id", { user: { id: "u" }, params: { id: "p" }, body: {} }, 500, "update failed"],
    ["DELETE", "/api/pet-house/decor/placed/:id", { user: { id: "u" }, params: { id: "p" } }, 500, "remove failed"],
    ["POST", "/api/admin/home-decor/:id/grant-everyone", { params: { id: "d" } }, 500, "users failed"],
  ] as const;

  for (const [method, path, req, status, message] of cases) {
    const res = await handler(app, method, path, req);
    assert.deepEqual(
      [res.statusCode, res.body],
      [status, { message }],
      `${method} ${path}`,
    );
  }
});

test("legacy route registry has one Home Decor module boundary and no inline Home Decor routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal(
    (root.match(/registerHomeDecorRoutes\(app,/g) ?? []).length,
    1,
  );

  for (const entry of expected) {
    const path = entry.slice(entry.indexOf(" ") + 1);
    assert.equal(
      root.includes(`"${path}"`),
      false,
      path,
    );
  }
});
