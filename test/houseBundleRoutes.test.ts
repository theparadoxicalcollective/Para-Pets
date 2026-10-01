import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerHouseBundleRoutes } from "../server/routes/houseBundle.routes";

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

function route(app: RouteRecorder, method: string, path: string) {
  const found = app.routes.find(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  assert.ok(found, `${method} ${path}`);
  return found;
}

async function call(
  app: RouteRecorder,
  method: string,
  path: string,
  req: any,
) {
  const res = response();
  await route(app, method, path).handlers.at(-1)!(req, res, (() => {}) as any);
  return res;
}

function setup() {
  const app = new RouteRecorder();
  const calls: any = {
    images: [],
    createdBundles: [],
    updatedBuildings: [],
    createdBuildings: [],
  };

  const storage: any = {
    getHouseBundles: async () => [],
    getUserHouseBundles: async () => [],
    getActiveBundleWithBuildings: async () => null,
    hasUserHouseBundle: async () => false,
    atomicDeductCoins: async () => true,
    grantUserHouseBundle: async () => ({ id: "owned" }),
    addCoins: async () => undefined,
    setActiveHouseBundle: async () => undefined,
    createHouseBundle: async (data: any) => {
      calls.createdBundles.push(data);
      return { id: "bundle-1", ...data };
    },
    updateHouseBundle: async (_id: string, data: any) => data,
    deleteHouseBundle: async () => undefined,
    getAllUsers: async () => [],
    getHouseBundleBuildings: async () => [],
    createHouseBundleBuilding: async (data: any) => {
      calls.createdBuildings.push(data);
      return { id: "building-1", ...data };
    },
    updateHouseBundleBuilding: async (id: string, data: any) => {
      calls.updatedBuildings.push([id, data]);
      return { id, ...data };
    },
    deleteHouseBundleBuilding: async () => undefined,
    getHouseBundleBuilding: async () => null,
  };

  const processWorldImage = async (data: string, maxSize: number) => {
    calls.images.push([data, maxSize]);
    return `processed-${maxSize}`;
  };

  registerHouseBundleRoutes(app as any, {
    db: {} as any,
    storage,
    isAdmin: admin,
    processWorldImage,
  });

  return { app, calls };
}

const expected = [
  "GET /api/house-bundles",
  "GET /api/users/:userId/house-bundles",
  "GET /api/users/:userId/active-house-bundle",
  "POST /api/house-bundles/:bundleId/purchase",
  "POST /api/house-bundles/:bundleId/activate",
  "POST /api/house-bundles/deactivate",
  "GET /api/admin/house-bundles",
  "POST /api/admin/house-bundles",
  "PATCH /api/admin/house-bundles/:id",
  "DELETE /api/admin/house-bundles/:id",
  "GET /api/admin/house-bundles/:bundleId/buildings",
  "POST /api/admin/house-bundles/:bundleId/buildings",
  "PATCH /api/admin/house-bundle-buildings/:id",
  "DELETE /api/admin/house-bundle-buildings/:id",
  "POST /api/admin/house-bundle-buildings/:id/duplicate",
];

test("house bundle routes register once in the existing order and preserve auth boundaries", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    expected,
  );
  assert.equal(new Set(expected).size, expected.length);

  for (const registered of app.routes) {
    if (registered.path.startsWith("/api/admin/")) {
      assert.equal(registered.handlers[0], admin);
    } else {
      assert.equal(registered.handlers.length, 1);
    }
  }
});

test("player purchase route keeps its existing request-level authentication check", async () => {
  const { app } = setup();
  const res = await call(
    app,
    "POST",
    "/api/house-bundles/:bundleId/purchase",
    {
      isAuthenticated: () => false,
      params: { bundleId: "bundle-1" },
    },
  );

  assert.deepEqual(
    [res.statusCode, res.body],
    [401, { message: "Unauthorized" }],
  );
});

test("admin bundle creation keeps the existing image processing limits", async () => {
  const { app, calls } = setup();
  const res = await call(app, "POST", "/api/admin/house-bundles", {
    body: {
      name: "Autumn Cottage",
      price: 1500,
      shopImageData: "shop-data",
      bgImageData: "bg-data",
    },
  });

  assert.deepEqual(calls.images, [
    ["shop-data", 1000],
    ["bg-data", 3000],
  ]);
  assert.deepEqual(calls.createdBundles, [
    {
      name: "Autumn Cottage",
      price: 1500,
      shopImageUrl: "processed-1000",
      bgImageUrl: "processed-3000",
      maxOutdoorPets: 6,
      maxOutdoorDecor: 8,
    },
  ]);
  assert.equal(res.statusCode, 201);
});

test("bundle limits and building/mailbox types preserve the requested admin contract", async () => {
  const { app, calls } = setup();

  const created = await call(app, "POST", "/api/admin/house-bundles/:bundleId/buildings", {
    params: { bundleId: "bundle-1" },
    body: { name: "Cottage", imageData: "building-image", buildingType: "building", size: "large" },
  });
  assert.equal(created.statusCode, 201);
  assert.deepEqual(calls.createdBuildings[0], {
    bundleId: "bundle-1",
    name: "Cottage",
    imageUrl: "processed-1000",
    buildingType: "building",
    size: "large",
  });

  const mailbox = await call(app, "POST", "/api/admin/house-bundles/:bundleId/buildings", {
    params: { bundleId: "bundle-1" },
    body: { name: "Forest Post", imageData: "mailbox-image", buildingType: "mailbox", size: "small" },
  });
  assert.equal(mailbox.statusCode, 201);
  assert.deepEqual(calls.createdBuildings[1], {
    bundleId: "bundle-1",
    name: "Forest Post",
    imageUrl: "processed-1000",
    buildingType: "mailbox",
  });

  const invalid = await call(app, "POST", "/api/admin/house-bundles/:bundleId/buildings", {
    params: { bundleId: "bundle-1" },
    body: { name: "Bad", imageData: "bad", buildingType: "building", size: "giant" },
  });
  assert.deepEqual([invalid.statusCode, invalid.body], [400, { message: "size must be small, medium, or large" }]);

  const invalidType = await call(app, "POST", "/api/admin/house-bundles/:bundleId/buildings", {
    params: { bundleId: "bundle-1" },
    body: { name: "Bad Type", imageData: "bad", buildingType: "shed" },
  });
  assert.deepEqual([invalidType.statusCode, invalidType.body], [400, { message: "buildingType must be building or mailbox" }]);
});

test("building editing keeps current size and placement clamps", async () => {
  const { app, calls } = setup();
  await call(app, "PATCH", "/api/admin/house-bundle-buildings/:id", {
    params: { id: "building-1" },
    body: {
      width: 999,
      leaveButtonX: -2,
      leaveButtonY: 3,
      maxPets: -5,
      imageData: "outside",
      interiorImageData: "inside",
    },
  });

  assert.deepEqual(calls.images, [
    ["outside", 1000],
    ["inside", 2000],
  ]);
  assert.deepEqual(calls.updatedBuildings, [
    [
      "building-1",
      {
        width: 400,
        imageUrl: "processed-1000",
        interiorImageUrl: "processed-2000",
        leaveButtonX: 0,
        leaveButtonY: 1,
        maxPets: 0,
      },
    ],
  ]);
});

test("legacy route registry only registers the extracted house bundle module", () => {
  const root = readFileSync("server/routes.ts", "utf8");

  assert.equal(
    (root.match(/registerHouseBundleRoutes\(app,/g) ?? []).length,
    1,
  );

  for (const entry of expected) {
    const path = entry.slice(entry.indexOf(" ") + 1);
    assert.equal(root.includes(`"${path}"`), false, path);
  }
});
