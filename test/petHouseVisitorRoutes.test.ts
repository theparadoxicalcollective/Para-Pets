import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetHouseVisitorRoutes } from "../server/routes/petHouseVisitor.routes";

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

function setup(options: {
  missingUser?: boolean;
  bannedUser?: boolean;
  fail?: boolean;
  positions?: any[];
} = {}) {
  const app = new RouteRecorder();
  const calls: any = { users: [], inventory: [], positions: [] };

  const inventoryRows = [
    {
      inventory: {
        id: "pet-hatched",
        isHatched: true,
        petNickname: "Sprout",
        petLevel: 7,
        petHealth: 800,
        petAtk: 55,
        petDef: 44,
      },
      shopItem: {
        id: "shop-pet",
        type: "pet",
        name: "Bayou Bunny",
        imageUrl: "base.png",
        hatchedImageUrl: "hatched.png",
        eggImageUrl: "egg.png",
        rarity: 3,
        petTemplateId: "template-1",
      },
    },
    {
      inventory: { id: "pet-egg", isHatched: false },
      shopItem: { id: "shop-egg", type: "pet", name: "Egg" },
    },
    {
      inventory: { id: "item-1", isHatched: true },
      shopItem: { id: "shop-item", type: "item", name: "Potion" },
    },
  ];

  registerPetHouseVisitorRoutes(app as any, {
    isAuthenticated: authenticated,
    storage: {
      getUser: async (userId: string) => {
        calls.users.push(userId);
        if (options.fail) throw new Error("boom");
        if (options.missingUser) return undefined as any;
        return {
          id: "owner",
          username: "OwnerName",
          isBanned: !!options.bannedUser,
        } as any;
      },
      getUserInventoryWithItems: async (userId: string) => {
        calls.inventory.push(userId);
        return inventoryRows as any;
      },
      getPetHousePositions: async (userId: string) => {
        calls.positions.push(userId);
        return (options.positions ?? [
          {
            inventoryId: "pet-hatched",
            posLeft: "24",
            posTop: "61",
            location: "inside",
          },
        ]) as any;
      },
    } as any,
  });

  return { app, calls };
}

async function call(app: RouteRecorder, userId = "owner") {
  const route = app.routes.find(
    (candidate) =>
      candidate.method === "GET" && candidate.path === "/api/users/:userId/pets",
  );
  assert.ok(route);
  const res = response();
  await route.handlers.at(-1)!(
    { params: { userId } } as any,
    res,
    (() => {}) as any,
  );
  return res;
}

test("visitor Pet House route registers once behind authentication", () => {
  const { app } = setup();
  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0].method, "GET");
  assert.equal(app.routes[0].path, "/api/users/:userId/pets");
  assert.equal(app.routes[0].handlers[0], authenticated);
});

test("missing or banned owners remain hidden as User not found", async () => {
  for (const options of [{ missingUser: true }, { bannedUser: true }]) {
    const { app, calls } = setup(options);
    const res = await call(app, "target");
    assert.deepEqual(
      [res.statusCode, res.body],
      [404, { message: "User not found" }],
    );
    assert.deepEqual(calls.inventory, []);
    assert.deepEqual(calls.positions, []);
  }
});

test("visitor response preserves hatched-pet filtering, fields, and saved positions", async () => {
  const { app, calls } = setup();
  const res = await call(app, "target");

  assert.deepEqual(calls.users, ["target"]);
  assert.deepEqual(calls.inventory, ["owner"]);
  assert.deepEqual(calls.positions, ["owner"]);
  assert.deepEqual(res.body, {
    username: "OwnerName",
    pets: [
      {
        inventoryId: "pet-hatched",
        shopItemId: "shop-pet",
        name: "Bayou Bunny",
        nickname: "Sprout",
        imageUrl: "base.png",
        hatchedImageUrl: "hatched.png",
        eggImageUrl: "egg.png",
        rarity: 3,
        petLevel: 7,
        petHealth: 800,
        petAtk: 55,
        petDef: 44,
        petTemplateId: "template-1",
        posLeft: "24",
        posTop: "61",
        location: "inside",
      },
    ],
  });
});

test("pets without saved house positions keep null position fields", async () => {
  const { app } = setup({ positions: [] });
  const res = await call(app);
  assert.deepEqual(
    {
      posLeft: res.body.pets[0].posLeft,
      posTop: res.body.pets[0].posTop,
      location: res.body.pets[0].location,
    },
    { posLeft: null, posTop: null, location: null },
  );
});

test("visitor endpoint preserves server error status and message", async () => {
  const { app } = setup({ fail: true });
  const res = await call(app);
  assert.deepEqual(
    [res.statusCode, res.body],
    [500, { message: "Failed to get pets" }],
  );
});

test("legacy route registry owns only the visitor registration boundary", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.equal(
    (root.match(/registerPetHouseVisitorRoutes\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/users/:userId/pets"'), false);
});
