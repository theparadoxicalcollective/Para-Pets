import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerGiftRoutes } from "../server/routes/gift.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };
class RouteRecorder {
  routes: Route[] = [];
  get(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "GET", path, handlers }); return this; }
  post(path: string, ...handlers: RequestHandler[]) { this.routes.push({ method: "POST", path, handlers }); return this; }
}
const authenticated: RequestHandler = (_req, _res, next) => next();
function response() {
  const state: any = { statusCode: 200, body: undefined };
  return Object.assign(state, { status(code: number) { state.statusCode = code; return state; }, json(body: unknown) { state.body = body; return state; } });
}
function setup() {
  const calls: any = { pending: [], send: [], accept: [] };
  const app = new RouteRecorder();
  registerGiftRoutes(app as any, {
    storage: { getPendingGifts: async (userId: string) => { calls.pending.push(userId); return [{ id: "pending" }] as any; } },
    isAuthenticated: authenticated,
    executeSendGift: async (input: any) => { calls.send.push(input); return { id: "sent" } as any; },
    executeAcceptGift: async (id: string, userId: string) => { calls.accept.push([id, userId]); return { id, status: "accepted" } as any; },
  });
  return { app, calls };
}
function route(app: RouteRecorder, method: string, path: string) {
  const found = app.routes.find(candidate => candidate.method === method && candidate.path === path);
  assert.ok(found); return found;
}
async function handler(app: RouteRecorder, method: string, path: string, req: any) {
  const res = response();
  await route(app, method, path).handlers.at(-1)!(req, res, (() => {}) as any);
  return res;
}

test("gift routes register exactly once in legacy order with authentication first", () => {
  const { app } = setup();
  assert.deepEqual(app.routes.map(({ method, path }) => `${method} ${path}`), [
    "POST /api/gifts/send", "GET /api/gifts/pending", "POST /api/gifts/:id/accept",
  ]);
  assert.equal(new Set(app.routes.map(({ method, path }) => `${method} ${path}`)).size, 3);
  for (const registered of app.routes) assert.equal(registered.handlers[0], authenticated);
});

test("gift operations derive both identities from the authenticated session", async () => {
  const { app, calls } = setup();
  const sent = await handler(app, "POST", "/api/gifts/send", { user: { id: "session-sender" }, body: { senderId: "attacker", receiverId: "receiver", coinAmount: 0, message: "hi" } });
  assert.deepEqual(sent.body, { id: "sent" });
  assert.equal(calls.send[0].senderId, "session-sender");
  assert.equal("senderId" in calls.send[0] && calls.send[0].senderId === "attacker", false);

  await handler(app, "GET", "/api/gifts/pending", { user: { id: "session-receiver" } });
  assert.deepEqual(calls.pending, ["session-receiver"]);
  await handler(app, "POST", "/api/gifts/:id/accept", { user: { id: "session-receiver" }, params: { id: "gift-1" }, body: { receiverId: "attacker" } });
  assert.deepEqual(calls.accept, [["gift-1", "session-receiver"]]);
});

test("gift validation, success responses, and service errors preserve their HTTP contract", async () => {
  const { app } = setup();
  for (const [body, message] of [
    [{ coinAmount: 0 }, "receiverId required"],
    [{ receiverId: "other" }, "coinAmount must be >= 0"],
    [{ receiverId: "owner", coinAmount: 0 }, "Cannot send gift to yourself"],
  ] as const) {
    const res = await handler(app, "POST", "/api/gifts/send", { user: { id: "owner" }, body });
    assert.deepEqual([res.statusCode, res.body], [400, { message }]);
  }
  const failing = new RouteRecorder();
  registerGiftRoutes(failing as any, {
    storage: { getPendingGifts: async () => { throw new Error("pending failed"); } },
    isAuthenticated: authenticated,
    executeSendGift: async () => { throw new Error("send failed"); },
    executeAcceptGift: async () => { throw new Error("Gift not found"); },
  } as any);
  const failures = [
    ["POST", "/api/gifts/send", { user: { id: "owner" }, body: { receiverId: "other", coinAmount: 0 } }, "send failed"],
    ["GET", "/api/gifts/pending", { user: { id: "owner" } }, "pending failed"],
    ["POST", "/api/gifts/:id/accept", { user: { id: "owner" }, params: { id: "gift" } }, "Gift not found"],
  ] as const;
  for (const [method, path, req, message] of failures) {
    const res = await handler(failing, method, path, req);
    assert.deepEqual([res.statusCode, res.body], [500, { message }]);
  }
});

test("gift module is a thin boundary and routes.ts contains no moved inline registrations", () => {
  const source = fs.readFileSync("server/routes/gift.routes.ts", "utf8");
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.doesNotMatch(source, /\b(?:db\.|update\(|insert\(|delete\(|coins|userInventory|userHomeDecorInventory)\b/);
  assert.equal((root.match(/registerGiftRoutes\(app,/g) ?? []).length, 1);
  assert.doesNotMatch(root, /app\.(?:get|post|patch|delete)\("\/api\/gifts\//);
});
