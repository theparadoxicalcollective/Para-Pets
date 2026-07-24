import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerBadgeRoutes, registerPlayerBadgeRoutes } from "../server/routes/badge.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };
class RouteRecorder {
  routes: Route[] = [];
  get(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "GET", path, handlers }); return this; }
  post(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "POST", path, handlers }); return this; }
  patch(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "PATCH", path, handlers }); return this; }
  delete(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "DELETE", path, handlers }); return this; }
}

const authenticated: RequestHandler = (req, res, next) => req.user ? next() : res.status(401).json({ message: "Unauthorized" });
const storage: any = {
  getAllBadges: async () => [], getUserBadges: async () => [], createBadge: async () => ({}), deleteBadge: async () => {}, updateBadge: async () => {},
  getBadgeLeaderboard: async () => [], getDevotionLeaderboard: async () => [], getBadgeRecipients: async () => [], awardBadge: async () => {}, revokeBadge: async () => {},
};
const dependencies: any = { storage, db: {}, isAuthenticated: authenticated, processWorldImage: async () => "image" };
const expected = [
  ["GET", "/api/users/:userId/badges"], ["GET", "/api/badges"], ["POST", "/api/admin/badges"], ["DELETE", "/api/admin/badges/:id"],
  ["PATCH", "/api/admin/badges/:id"], ["GET", "/api/badges/leaderboard"], ["GET", "/api/badges/leaderboard/devotion"],
  ["GET", "/api/admin/badges/:id/recipients"], ["POST", "/api/admin/badges/:id/award"], ["POST", "/api/admin/badges/:id/revoke"],
  ["GET", "/api/user/badges"], ["POST", "/api/badges/claim-daily"],
];

function response() {
  const state: any = { statusCode: 200, body: undefined };
  return Object.assign(state, { status(code: number) { state.statusCode = code; return state; }, json(body: unknown) { state.body = body; return state; }, set() { return state; } });
}
async function invoke(route: Route, req: any) {
  const res = response(); let index = 0;
  const next = async () => { const handler = route.handlers[index++]; if (handler) await handler(req, res, next); };
  await next(); return res;
}

test("badge HTTP boundary registers every legacy path and method exactly once", () => {
  const app = new RouteRecorder();
  registerPlayerBadgeRoutes(app as any, dependencies);
  registerBadgeRoutes(app as any, dependencies, "definitions");
  registerBadgeRoutes(app as any, dependencies, "leaderboards");
  registerBadgeRoutes(app as any, dependencies, "claims");
  assert.deepEqual(app.routes.map(({ method, path }) => [method, path]), expected);
  for (const route of app.routes.filter(route => !route.path.includes("leaderboard"))) assert.equal(route.handlers[0], authenticated);
  for (const route of app.routes.filter(route => route.path.includes("leaderboard"))) assert.equal(route.handlers.length, 1);
});

test("badge routes preserve unauthenticated, unverified, and administrator rejection boundaries", async () => {
  const app = new RouteRecorder(); registerBadgeRoutes(app as any, dependencies);
  const find = (method: string, path: string) => app.routes.find(route => route.method === method && route.path === path)!;
  assert.equal((await invoke(find("GET", "/api/badges"), { user: undefined, body: {} })).statusCode, 401);
  const unverified = await invoke(find("POST", "/api/badges/claim-daily"), { user: { id: "player", emailVerified: false }, body: { badgeId: "badge" } });
  assert.deepEqual([unverified.statusCode, unverified.body], [403, { message: "Please verify your email before claiming rewards", code: "EMAIL_UNVERIFIED" }]);
  const nonAdmin = await invoke(find("POST", "/api/admin/badges/:id/award"), { user: { id: "player", isAdmin: false }, params: { id: "badge" }, body: { userIds: ["player"] } });
  assert.deepEqual([nonAdmin.statusCode, nonAdmin.body], [403, { message: "Forbidden" }]);
});
