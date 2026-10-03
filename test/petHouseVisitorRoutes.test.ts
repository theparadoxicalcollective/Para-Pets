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
  missingUser?: boolean;
  bannedUser?: boolean;
  fail?: boolean;
  positions?: any[];
  claimedPetIds?: string[];
  claimResult?: { rewarded: boolean; coins: number } | null;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    users: [],
    inventory: [],
    positions: [],
    claimed: [],
    claims: [],
  };

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
      inventory: {
        id: "pet-unplaced",
        isHatched: true,
        petNickname: null,
        petLevel: 2,
        petHealth: 500,
        petAtk: 30,
        petDef: 20,
      },
      shopItem: {
        id: "shop-unplaced",
        type: "pet",
        name: "Forest Dragon",
        imageUrl: "dragon.png",
        hatchedImageUrl: "dragon-hatched.png",
        eggImageUrl: "dragon-egg.png",
        rarity: 4,
        petTemplateId: "template-2",
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
            scalePct: 125,
            flipped: true,
          },
        ]) as any;
      },
      getClaimedPetHouseVisitRewardPetIds: async (visitorId: string, petIds: string[], claimDay: string) => {
        calls.claimed.push([visitorId, petIds, claimDay]);
        return options.claimedPetIds ?? [];
      },
      claimPetHouseVisitReward: async (
        visitorId: string,
        ownerId: string,
        inventoryId: string,
        claimDay: string,
        amount: number,
      ) => {
        calls.claims.push([visitorId, ownerId, inventoryId, claimDay, amount]);
        return options.claimResult === undefined
          ? { rewarded: true, coins: 110 }
          : options.claimResult;
      },
    } as any,
  });

  return { app, calls };
}

function findRoute(app: RouteRecorder, method: string, path: string) {
  const route = app.routes.find(candidate => candidate.method === method && candidate.path === path);
  assert.ok(route);
  return route;
}

async function callGet(app: RouteRecorder, userId = "owner", visitorId = "visitor") {
  const route = findRoute(app, "GET", "/api/users/:userId/pets");
  const res = response();
  await route.handlers.at(-1)!(
    { params: { userId }, user: { id: visitorId } } as any,
    res,
    (() => {}) as any,
  );
  return res;
}

async function callClaim(app: RouteRecorder, userId = "owner", inventoryId = "pet-hatched", visitorId = "visitor") {
  const route = findRoute(app, "POST", "/api/users/:userId/pets/:inventoryId/visit-reward");
  const res = response();
  await route.handlers.at(-1)!(
    { params: { userId, inventoryId }, user: { id: visitorId } } as any,
    res,
    (() => {}) as any,
  );
  return res;
}

test("visitor Pet House routes register behind authentication", () => {
  const { app } = setup();
  assert.equal(app.routes.length, 2);
  assert.deepEqual(
    app.routes.map(route => [route.method, route.path]),
    [
      ["GET", "/api/users/:userId/pets"],
      ["POST", "/api/users/:userId/pets/:inventoryId/visit-reward"],
    ],
  );
  assert.equal(app.routes[0].handlers[0], authenticated);
  assert.equal(app.routes[1].handlers[0], authenticated);
});

test("missing or banned owners remain hidden as User not found", async () => {
  for (const options of [{ missingUser: true }, { bannedUser: true }]) {
    const { app, calls } = setup(options);
    const res = await callGet(app, "target");
    assert.deepEqual(
      [res.statusCode, res.body],
      [404, { message: "User not found" }],
    );
    assert.deepEqual(calls.inventory, []);
    assert.deepEqual(calls.positions, []);
    assert.deepEqual(calls.claimed, []);
  }
});

test("visitor response preserves pet fields and exposes one daily reward only for placed pets", async () => {
  const { app, calls } = setup();
  const res = await callGet(app, "target", "visitor");

  assert.deepEqual(calls.users, ["target"]);
  assert.deepEqual(calls.inventory, ["owner"]);
  assert.deepEqual(calls.positions, ["owner"]);
  assert.equal(calls.claimed.length, 1);
  assert.deepEqual(calls.claimed[0][0], "visitor");
  assert.deepEqual(calls.claimed[0][1], ["pet-hatched"]);
  assert.match(calls.claimed[0][2], /^\d{4}-\d{2}-\d{2}$/);

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
        homeScalePct: 125,
        homeFlipped: true,
        visitRewardAvailable: true,
        visitRewardAmount: 10,
      },
      {
        inventoryId: "pet-unplaced",
        shopItemId: "shop-unplaced",
        name: "Forest Dragon",
        nickname: null,
        imageUrl: "dragon.png",
        hatchedImageUrl: "dragon-hatched.png",
        eggImageUrl: "dragon-egg.png",
        rarity: 4,
        petLevel: 2,
        petHealth: 500,
        petAtk: 30,
        petDef: 20,
        petTemplateId: "template-2",
        posLeft: null,
        posTop: null,
        location: null,
        homeScalePct: 100,
        homeFlipped: false,
        visitRewardAvailable: false,
        visitRewardAmount: 0,
      },
    ],
  });
});

test("already-claimed placed pets do not show another coin cue that UTC day", async () => {
  const { app } = setup({ claimedPetIds: ["pet-hatched"] });
  const res = await callGet(app);
  const pet = res.body.pets.find((entry: any) => entry.inventoryId === "pet-hatched");
  assert.equal(pet.visitRewardAvailable, false);
  assert.equal(pet.visitRewardAmount, 10);
});

test("self visits never expose or claim visitor rewards", async () => {
  const { app, calls } = setup();
  const list = await callGet(app, "owner", "owner");
  assert.equal(list.body.pets[0].visitRewardAvailable, false);
  assert.deepEqual(calls.claimed, []);

  const claim = await callClaim(app, "owner", "pet-hatched", "owner");
  assert.deepEqual(
    [claim.statusCode, claim.body],
    [400, { message: "You cannot collect rewards from your own Pet Home" }],
  );
  assert.deepEqual(calls.claims, []);
});

test("claiming a placed pet grants exactly 10 visitor coins", async () => {
  const { app, calls } = setup({ claimResult: { rewarded: true, coins: 210 } });
  const res = await callClaim(app, "owner", "pet-hatched", "visitor");

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    inventoryId: "pet-hatched",
    rewarded: true,
    amount: 10,
    coins: 210,
  });
  assert.equal(calls.claims.length, 1);
  assert.deepEqual(calls.claims[0].slice(0, 3), ["visitor", "owner", "pet-hatched"]);
  assert.match(calls.claims[0][3], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(calls.claims[0][4], 10);
});

test("duplicate daily claim returns no coins instead of minting twice", async () => {
  const { app } = setup({ claimResult: { rewarded: false, coins: 210 } });
  const res = await callClaim(app);
  assert.deepEqual(res.body, {
    inventoryId: "pet-hatched",
    rewarded: false,
    amount: 0,
    coins: 210,
  });
});

test("invalid or no-longer-placed pet cannot award visitor coins", async () => {
  const { app } = setup({ claimResult: null });
  const res = await callClaim(app);
  assert.deepEqual(
    [res.statusCode, res.body],
    [404, { message: "Placed pet not found" }],
  );
});

test("visitor endpoint preserves server error status and message", async () => {
  const { app } = setup({ fail: true });
  const res = await callGet(app);
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
  assert.equal(root.includes('app.post("/api/users/:userId/pets/:inventoryId/visit-reward"'), false);
});
