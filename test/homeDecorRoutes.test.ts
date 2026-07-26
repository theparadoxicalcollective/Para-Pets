import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerHomeDecorRoutes } from "../server/routes/homeDecor.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };
class RouteRecorder {
  routes: Route[] = [];
  get(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "GET", path, handlers }); return this; }
  post(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "POST", path, handlers }); return this; }
  patch(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "PATCH", path, handlers }); return this; }
  delete(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "DELETE", path, handlers }); return this; }
}
const authenticated: RequestHandler = (_req, _res, next) => next();
function response() { const state: any = { statusCode: 200, body: undefined }; return Object.assign(state, { status(code: number) { state.statusCode = code; return state; }, json(body: unknown) { state.body = body; return state; } }); }
function setup() {
  const calls: any = { inventory: [], placed: [], update: [], place: [], remove: [] };
  const app = new RouteRecorder();
  registerHomeDecorRoutes(app as any, {
    storage: {
      getUserHomeDecorInventory: async (id: string) => { calls.inventory.push(id); return [{ id: "inventory" }] as any; },
      getPlacedHomeDecor: async (id: string, location?: string) => { calls.placed.push([id, location]); return [{ id: "placed" }] as any; },
      updatePlacedHomeDecor: async (id: string, userId: string, data: any) => { calls.update.push([id, userId, data]); return { id } as any; },
    },
    isAuthenticated: authenticated,
    executeDecorPlacement: async (userId: string, id: string, data: any) => { calls.place.push([userId, id, data]); return { id: "new-placement" } as any; },
    executeDecorRemoval: async (userId: string, id: string) => { calls.remove.push([userId, id]); return { decorItemId: "decor-1" }; },
  });
  return { app, calls };
}
function route(app: RouteRecorder, method: string, path: string) { const found = app.routes.find(candidate => candidate.method === method && candidate.path === path); assert.ok(found); return found; }
async function handler(app: RouteRecorder, method: string, path: string, req: any) { const res = response(); await route(app, method, path).handlers.at(-1)!(req, res, (() => {}) as any); return res; }

const expected = [
  "GET /api/pet-house/decor/inventory", "GET /api/pet-house/decor/placed", "GET /api/users/:userId/pet-house/decor/placed",
  "POST /api/pet-house/decor/place", "PATCH /api/pet-house/decor/placed/:id", "DELETE /api/pet-house/decor/placed/:id",
];
test("home decor routes register exactly once in legacy order with the public route unprotected", () => {
  const { app } = setup();
  assert.deepEqual(app.routes.map(({ method, path }) => `${method} ${path}`), expected);
  assert.equal(new Set(app.routes.map(({ method, path }) => `${method} ${path}`)).size, 6);
  for (const registered of app.routes) {
    if (registered.path.startsWith("/api/users/")) assert.equal(registered.handlers.length, 1);
    else assert.equal(registered.handlers[0], authenticated);
  }
});

test("decor reads retain authenticated ownership while public visits use the URL player", async () => {
  const { app, calls } = setup();
  await handler(app, "GET", "/api/pet-house/decor/inventory", { user: { id: "owner" } });
  await handler(app, "GET", "/api/pet-house/decor/placed", { user: { id: "owner" }, query: { location: "inside" } });
  await handler(app, "GET", "/api/users/:userId/pet-house/decor/placed", { params: { userId: "visited" }, query: { location: "outside" } });
  assert.deepEqual(calls.inventory, ["owner"]);
  assert.deepEqual(calls.placed, [["owner", "inside"], ["visited", "outside"]]);
});

test("placement delegates authenticated ownership and preserves every default", async () => {
  const { app, calls } = setup();
  const res = await handler(app, "POST", "/api/pet-house/decor/place", { user: { id: "owner" }, body: { userId: "victim", decorItemId: "decor-1" } });
  assert.deepEqual(calls.place, [["owner", "decor-1", { xPct: 0.5, yPct: 0.5, size: 250, flipped: false, location: "outside" }]]);
  assert.deepEqual([res.statusCode, res.body], [201, { id: "new-placement" }]);
  const missing = await handler(app, "POST", "/api/pet-house/decor/place", { user: { id: "owner" }, body: {} });
  assert.deepEqual([missing.statusCode, missing.body], [400, { message: "decorItemId required" }]);
});

test("PATCH and removal remain scoped to authenticated ownership", async () => {
  const { app, calls } = setup();
  const patch = await handler(app, "PATCH", "/api/pet-house/decor/placed/:id", { user: { id: "owner" }, params: { id: "placed-1", userId: "victim" }, body: { userId: "victim", xPct: 0.2, location: "other" } });
  assert.deepEqual(calls.update, [["placed-1", "owner", { xPct: 0.2, yPct: undefined, size: undefined, flipped: undefined }]]);
  assert.deepEqual(patch.body, { id: "placed-1" });
  const removed = await handler(app, "DELETE", "/api/pet-house/decor/placed/:id", { user: { id: "owner" }, params: { id: "placed-1", userId: "victim" }, body: { userId: "victim" } });
  assert.deepEqual(calls.remove, [["owner", "placed-1"]]);
  assert.deepEqual(removed.body, { ok: true, decorItemId: "decor-1" });
});

test("decor errors preserve existing status codes and response shapes", async () => {
  const app = new RouteRecorder();
  registerHomeDecorRoutes(app as any, { storage: { getUserHomeDecorInventory: async () => { throw new Error("read failed"); }, getPlacedHomeDecor: async () => { throw new Error("read failed"); }, updatePlacedHomeDecor: async () => { throw new Error("update failed"); } }, isAuthenticated: authenticated, executeDecorPlacement: async () => { throw new Error("place failed"); }, executeDecorRemoval: async () => { throw new Error("remove failed"); } } as any);
  const cases = [
    ["GET", "/api/pet-house/decor/inventory", { user: { id: "u" } }, 500, "read failed"],
    ["POST", "/api/pet-house/decor/place", { user: { id: "u" }, body: { decorItemId: "d" } }, 400, "place failed"],
    ["PATCH", "/api/pet-house/decor/placed/:id", { user: { id: "u" }, params: { id: "p" }, body: {} }, 500, "update failed"],
    ["DELETE", "/api/pet-house/decor/placed/:id", { user: { id: "u" }, params: { id: "p" } }, 500, "remove failed"],
  ] as const;
  for (const [method, path, req, status, message] of cases) { const res = await handler(app, method, path, req); assert.deepEqual([res.statusCode, res.body], [status, { message }]); }
});

test("routes.ts has one module boundary and no moved inline registrations", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.equal((root.match(/registerHomeDecorRoutes\(app,/g) ?? []).length, 1);
  for (const path of expected.map(value => value.slice(value.indexOf(" ") + 1))) assert.doesNotMatch(root, new RegExp(`app\\.(?:get|post|patch|delete)\\("${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});
