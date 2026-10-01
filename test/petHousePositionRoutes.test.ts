import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetHousePositionRoutes } from "../server/routes/petHousePosition.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  get(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "GET", path, handlers });
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
  failGet?: boolean;
  failSave?: boolean;
  failDeleteAll?: boolean;
  failDelete?: boolean;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    get: [],
    save: [],
    deleteAll: [],
    delete: [],
  };

  registerPetHousePositionRoutes(app as any, {
    isAuthenticated: authenticated,
    storage: {
      getPetHousePositions: async (userId: string) => {
        if (options.failGet) throw new Error("boom");
        calls.get.push(userId);
        return [
          {
            inventoryId: "pet-1",
            posLeft: "25",
            posTop: "40",
            location: "outside",
          },
        ];
      },
      upsertPetHousePosition: async (
        userId: string,
        inventoryId: string,
        posLeft: string,
        posTop: string,
        location: string,
      ) => {
        if (options.failSave) throw new Error("boom");
        calls.save.push([userId, inventoryId, posLeft, posTop, location]);
      },
      deleteAllPetHousePositions: async (userId: string) => {
        if (options.failDeleteAll) throw new Error("boom");
        calls.deleteAll.push(userId);
      },
      deletePetHousePosition: async (userId: string, inventoryId: string) => {
        if (options.failDelete) throw new Error("boom");
        calls.delete.push([userId, inventoryId]);
      },
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

const expected = [
  "GET /api/pet-house-positions",
  "PATCH /api/pet-house-positions/:inventoryId",
  "DELETE /api/pet-house-positions/all",
  "DELETE /api/pet-house-positions/:inventoryId",
];

test("Pet House position routes register once, in legacy order, behind authentication", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    expected,
  );
  assert.equal(new Set(expected).size, expected.length);

  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], authenticated, registered.path);
  }

  assert.ok(
    app.routes.findIndex((entry) => entry.path === "/api/pet-house-positions/all")
      < app.routes.findIndex((entry) => entry.path === "/api/pet-house-positions/:inventoryId"),
    "DELETE /all must remain before DELETE /:inventoryId",
  );
});

test("position reads and writes always use the authenticated player id", async () => {
  const { app, calls } = setup();

  const read = await call(app, "GET", "/api/pet-house-positions", {
    user: { id: "owner" },
  });
  assert.deepEqual(calls.get, ["owner"]);
  assert.equal(read.body[0].inventoryId, "pet-1");

  const saved = await call(
    app,
    "PATCH",
    "/api/pet-house-positions/:inventoryId",
    {
      user: { id: "owner" },
      params: { inventoryId: "pet-2", userId: "victim" },
      body: {
        userId: "victim",
        posLeft: "12.5",
        posTop: "77",
        location: "inside-building",
      },
    },
  );

  assert.deepEqual(calls.save, [
    ["owner", "pet-2", "12.5", "77", "inside-building"],
  ]);
  assert.deepEqual(saved.body, { ok: true });
});

test("position PATCH preserves required string validation and outside default", async () => {
  const { app, calls } = setup();

  const invalid = await call(
    app,
    "PATCH",
    "/api/pet-house-positions/:inventoryId",
    {
      user: { id: "owner" },
      params: { inventoryId: "pet-1" },
      body: { posLeft: 10, posTop: "20" },
    },
  );
  assert.deepEqual(
    [invalid.statusCode, invalid.body],
    [400, { message: "posLeft and posTop are required strings" }],
  );
  assert.deepEqual(calls.save, []);

  await call(app, "PATCH", "/api/pet-house-positions/:inventoryId", {
    user: { id: "owner" },
    params: { inventoryId: "pet-1" },
    body: { posLeft: "10", posTop: "20" },
  });
  assert.deepEqual(calls.save, [["owner", "pet-1", "10", "20", "outside"]]);
});

test("store-all and single-pet removal preserve ownership and response shapes", async () => {
  const { app, calls } = setup();

  const all = await call(app, "DELETE", "/api/pet-house-positions/all", {
    user: { id: "owner" },
  });
  const one = await call(
    app,
    "DELETE",
    "/api/pet-house-positions/:inventoryId",
    {
      user: { id: "owner" },
      params: { inventoryId: "pet-3", userId: "victim" },
    },
  );

  assert.deepEqual(calls.deleteAll, ["owner"]);
  assert.deepEqual(calls.delete, [["owner", "pet-3"]]);
  assert.deepEqual(all.body, { ok: true });
  assert.deepEqual(one.body, { ok: true });
});

test("Pet House position error status codes and messages stay unchanged", async () => {
  const cases = [
    [setup({ failGet: true }).app, "GET", "/api/pet-house-positions", { user: { id: "u" } }, "Failed to get positions"],
    [setup({ failSave: true }).app, "PATCH", "/api/pet-house-positions/:inventoryId", { user: { id: "u" }, params: { inventoryId: "p" }, body: { posLeft: "1", posTop: "2" } }, "Failed to save position"],
    [setup({ failDeleteAll: true }).app, "DELETE", "/api/pet-house-positions/all", { user: { id: "u" } }, "Failed to store all pets"],
    [setup({ failDelete: true }).app, "DELETE", "/api/pet-house-positions/:inventoryId", { user: { id: "u" }, params: { inventoryId: "p" } }, "Failed to remove pet position"],
  ] as const;

  for (const [app, method, path, req, message] of cases) {
    const res = await call(app, method, path, req);
    assert.deepEqual([res.statusCode, res.body], [500, { message }]);
  }
});

test("legacy route registry has one Pet House position boundary and no inline registrations", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal(
    (root.match(/registerPetHousePositionRoutes\(app,/g) ?? []).length,
    1,
  );

  for (const entry of expected) {
    const path = entry.slice(entry.indexOf(" ") + 1);
    assert.equal(root.includes(`"${path}"`), false, path);
  }
});
