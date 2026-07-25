import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { MarketplaceError } from "../server/marketplace/transactions";
import { registerMarketplaceRoutes } from "../server/routes/marketplace.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];
  get(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "GET", path, handlers }); return this; }
  post(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "POST", path, handlers }); return this; }
  delete(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "DELETE", path, handlers }); return this; }
}

const authenticated: RequestHandler = (_req, _res, next) => next();

function setup(overrides: Record<string, unknown> = {}) {
  const app = new RouteRecorder();
  const dependencies: any = {
    storage: {},
    isAuthenticated: authenticated,
    buyListing: async () => ({}),
    cancelListing: async () => undefined,
    collectProceeds: async () => ({}),
    createFishListing: async () => ({}),
    createInventoryListing: async () => ({}),
    ...overrides,
  };
  registerMarketplaceRoutes(app as any, dependencies, "details");
  registerMarketplaceRoutes(app as any, dependencies, "lifecycle");
  return app.routes;
}

function response() {
  const state: any = { statusCode: 200, body: undefined };
  return Object.assign(state, {
    status(code: number) { state.statusCode = code; return state; },
    json(body: unknown) { state.body = body; return state; },
  });
}

test("marketplace extraction registers every legacy route once in original order", () => {
  const routes = setup();
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [
    ["GET", "/api/market/listing/:listingId/item-details"],
    ["GET", "/api/market/listing/:listingId/pet-details"],
    ["GET", "/api/market"],
    ["GET", "/api/market/my-listings"],
    ["POST", "/api/market/list"],
    ["POST", "/api/market/list-fish"],
    ["POST", "/api/market/:listingId/buy"],
    ["POST", "/api/market/:listingId/collect"],
    ["DELETE", "/api/market/:listingId"],
    ["POST", "/api/market/buy-slot"],
  ]);
  assert.equal(new Set(routes.map(({ method, path }) => `${method} ${path}`)).size, 10);
  assert.ok(routes.every(route => route.handlers[0] === authenticated));
  assert.ok(routes.every(route => route.handlers.length === 2));
});

test("marketplace mutations pass session ownership to the transaction boundary", async () => {
  const calls: unknown[] = [];
  const routes = setup({
    buyListing: async (input: unknown) => { calls.push(input); return { price: 25, replayed: false }; },
  });
  const route = routes.find(candidate => candidate.path === "/api/market/:listingId/buy")!;
  const res = response();
  await route.handlers[1]({ user: { id: "session-player" }, params: { listingId: "listing-1" } } as any, res, () => undefined);
  assert.deepEqual(calls, [{ actorId: "session-player", listingId: "listing-1" }]);
  assert.deepEqual(res.body, { ok: true, price: 25, replayed: false });
});

test("marketplace domain failures retain their HTTP status and response contract", async () => {
  const routes = setup({
    cancelListing: async () => { throw new MarketplaceError("wrong_owner", "Only the seller can cancel this listing"); },
  });
  const route = routes.find(candidate => candidate.method === "DELETE")!;
  const res = response();
  await route.handlers[1]({ user: { id: "player" }, params: { listingId: "listing-1" } } as any, res, () => undefined);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Only the seller can cancel this listing", code: "wrong_owner" });
});
