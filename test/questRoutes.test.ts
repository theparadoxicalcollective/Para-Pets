import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerQuestRoutes } from "../server/routes/quest.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };
class RouteRecorder {
  routes: Route[] = [];
  get(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "GET", path, handlers }); return this; }
  post(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "POST", path, handlers }); return this; }
  patch(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "PATCH", path, handlers }); return this; }
}

const authenticated: RequestHandler = (req, res, next) => req.user ? next() : res.status(401).json({ message: "Unauthorized" });
const dependencies: any = {
  db: { execute: async () => ({ rows: [] }), transaction: async (callback: any) => callback({ execute: async () => ({ rows: [] }) }) },
  isAuthenticated: authenticated,
  executeDailyQuestClaim: async () => "incomplete",
  getCentralDate: () => "2026-07-25",
};
const expected = [
  ["GET", "/api/quests/daily"],
  ["POST", "/api/quests/daily/seen"],
  ["POST", "/api/daily-quests/progress"],
  ["POST", "/api/quests/daily/claim/:questKey"],
  ["GET", "/api/admin/daily-quests"],
  ["PATCH", "/api/admin/daily-quests/:questKey"],
  ["GET", "/api/admin/moderator-quests"],
  ["POST", "/api/admin/moderator-quests/reset"],
];

function response() {
  const state: any = { statusCode: 200, body: undefined };
  return Object.assign(state, { status(code: number) { state.statusCode = code; return state; }, json(body: unknown) { state.body = body; return state; } });
}
async function invoke(route: Route, req: any) {
  const res = response(); let index = 0;
  const next = async () => { const handler = route.handlers[index++]; if (handler) await handler(req, res, next); };
  await next(); return res;
}

test("quest HTTP boundary registers every legacy method and path exactly once with authentication first", () => {
  const app = new RouteRecorder();
  registerQuestRoutes(app as any, dependencies);
  assert.deepEqual(app.routes.map(({ method, path }) => [method, path]), expected);
  assert.equal(new Set(app.routes.map(({ method, path }) => `${method} ${path}`)).size, expected.length);
  for (const route of app.routes) assert.equal(route.handlers[0], authenticated);
});

test("anonymous requests and non-administrators retain their rejection boundaries", async () => {
  const app = new RouteRecorder(); registerQuestRoutes(app as any, dependencies);
  for (const route of app.routes) assert.equal((await invoke(route, { user: undefined, params: {}, body: {} })).statusCode, 401);
  for (const route of app.routes.filter(route => route.path.startsWith("/api/admin/"))) {
    const denied = await invoke(route, { user: { id: "player", isAdmin: false }, params: { questKey: "feed_pet" }, body: {} });
    assert.deepEqual([denied.statusCode, denied.body], [403, { message: "Admin only" }]);
  }
});

test("routes.ts has one registration boundary while cross-domain progress integrations remain connected", () => {
  const rootSource = fs.readFileSync("server/routes.ts", "utf8");
  const questSource = fs.readFileSync("server/routes/quest.routes.ts", "utf8");
  assert.equal((rootSource.match(/registerQuestRoutes\(app,/g) ?? []).length, 1);
  assert.equal((questSource.match(/app\.(?:get|post|patch)\("\/api\/(?:quests\/daily|daily-quests|admin\/(?:daily-quests|moderator-quests))/g) ?? []).length, expected.length);
  assert.match(questSource, /executeDailyQuestClaim\(\{/);
  for (const integration of ["use_powerup", "feed_pet"]) assert.match(rootSource, new RegExp(`incrementQuestProgress\\(user\\.id, "${integration}"\\)`));
  assert.match(rootSource, /incrementQuestProgress,/);
});
