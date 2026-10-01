import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { requireAdmin, requireAuthenticated } from "../server/auth";
import { registerSupportRoutes } from "../server/routes/support.routes";

type RegisteredRoute = { method: string; path: string; handlers: Function[] };

const supportMessageCreatedAt = new Date("2026-01-01T00:00:00.000Z");

function response() {
  const result = { statusCode: 200, body: undefined as unknown };
  return {
    result,
    status(code: number) { result.statusCode = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  };
}

function registerRoutes() {
  const routes: RegisteredRoute[] = [];
  const app = {
    get(path: string, ...handlers: Function[]) { routes.push({ method: "GET", path, handlers }); },
    post(path: string, ...handlers: Function[]) { routes.push({ method: "POST", path, handlers }); },
    patch(path: string, ...handlers: Function[]) { routes.push({ method: "PATCH", path, handlers }); },
    delete(path: string, ...handlers: Function[]) { routes.push({ method: "DELETE", path, handlers }); },
  };
  const messages = [{ id: "owner-message", username: "owner", subject: "Private", message: "Only owner", createdAt: supportMessageCreatedAt }];
  const calls: Array<[string, string]> = [];
  const supportQueries: unknown[] = [];
  registerSupportRoutes(app as any, {
    db: {
      execute: async (query: unknown) => {
        supportQueries.push(query);
        return { rows: [{ id: "support-1", subject: "Help", message: "Message", is_read: false, created_at: supportMessageCreatedAt }] } as any;
      },
    } as any,
    storage: {
      getAllSupportMessages: async () => [],
      markSupportMessageRead: async () => {},
      deleteSupportMessage: async () => {},
      createAdminMessage: async (username: string, subject: string, message: string) => ({ id: "reply", username, subject, message, createdAt: supportMessageCreatedAt }),
      getAdminMessagesByUsername: async (username: string) => messages.filter(message => message.username === username),
      deleteAdminMessageForUsername: async (id: string, username: string) => {
        calls.push([id, username]);
        return id === "owner-message" && username === "owner";
      },
    },
    isAuthenticated: requireAuthenticated,
    isAdmin: requireAdmin,
  });
  return { routes, calls, supportQueries };
}

function route(routes: RegisteredRoute[], method: string, path: string) {
  const registered = routes.find(candidate => candidate.method === method && candidate.path === path);
  assert.ok(registered, `Expected ${method} ${path} to be registered`);
  return registered;
}

test("support routes retain their exact paths and security middleware order", () => {
  const { routes } = registerRoutes();
  assert.deepEqual(routes.map(({ method, path }) => `${method} ${path}`), [
    "GET /api/admin/support-messages",
    "PATCH /api/admin/support-messages/:id/read",
    "DELETE /api/admin/support-messages/:id",
    "POST /api/admin/support-messages/:id/respond",
    "GET /api/admin-messages",
    "DELETE /api/admin-messages/:id",
    "GET /api/support-messages/my",
    "DELETE /api/support-messages/my/:id",
  ]);
  for (const path of ["/api/admin/support-messages", "/api/admin/support-messages/:id/read", "/api/admin/support-messages/:id", "/api/admin/support-messages/:id/respond"]) {
    assert.equal(route(routes, path.includes(":id/read") ? "PATCH" : path.includes(":id") && path.endsWith("respond") ? "POST" : path.includes(":id") ? "DELETE" : "GET", path).handlers[0], requireAdmin);
  }
  assert.deepEqual(route(routes, "DELETE", "/api/admin-messages/:id").handlers.slice(0, 1), [requireAuthenticated]);
  assert.equal(route(routes, "GET", "/api/support-messages/my").handlers[0], requireAuthenticated);
  assert.equal(route(routes, "DELETE", "/api/support-messages/my/:id").handlers[0], requireAuthenticated);
});

test("players fetch only their own admin messages and anonymous users are rejected", async () => {
  const { routes } = registerRoutes();
  const handler = route(routes, "GET", "/api/admin-messages").handlers[0];

  const anonymous = response();
  await handler({ isAuthenticated: () => false } as any, anonymous as any);
  assert.deepEqual(anonymous.result, { statusCode: 401, body: { message: "Unauthorized" } });

  const owner = response();
  await handler({ isAuthenticated: () => true, user: { username: "owner" } } as any, owner as any);
  assert.deepEqual(owner.result.body, [{ id: "owner-message", username: "owner", subject: "Private", message: "Only owner", createdAt: supportMessageCreatedAt }]);
});

test("players can delete only owned admin messages and preserve missing-message behavior", async () => {
  const { routes, calls } = registerRoutes();
  const [, handler] = route(routes, "DELETE", "/api/admin-messages/:id").handlers;

  const owned = response();
  await handler({ params: { id: "owner-message" }, user: { username: "owner" } } as any, owned as any);
  assert.deepEqual(owned.result, { statusCode: 200, body: { message: "Deleted" } });

  const other = response();
  await handler({ params: { id: "owner-message" }, user: { username: "other" } } as any, other as any);
  assert.deepEqual(other.result, { statusCode: 404, body: { message: "Message not found" } });
  assert.deepEqual(calls, [["owner-message", "owner"], ["owner-message", "other"]]);
});

test("administrator support routes remain administrator-only and logs redact support data", async () => {
  const { routes } = registerRoutes();
  const adminRoute = route(routes, "POST", "/api/admin/support-messages/:id/respond");
  const denied = response();
  await adminRoute.handlers[0]({ isAuthenticated: () => false } as any, denied as any, (() => assert.fail("next must not run")) as any);
  assert.deepEqual(denied.result, { statusCode: 401, body: { message: "Unauthorized" } });

  const logs: unknown[][] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args); };
  try {
    const success = response();
    await adminRoute.handlers[1]({ body: { username: "private-player", subject: "Private subject", response: "Private response" } } as any, success as any);
    assert.deepEqual(success.result, { statusCode: 200, body: { message: "Response sent" } });
  } finally {
    console.log = originalLog;
  }
  assert.equal(JSON.stringify(logs).includes("private-player"), false);
  assert.equal(JSON.stringify(logs).includes("Private subject"), false);
  assert.equal(JSON.stringify(logs).includes("Private response"), false);
});


test("players list and delete only through the authenticated self-service support routes", async () => {
  const { routes, supportQueries } = registerRoutes();

  const listHandler = route(routes, "GET", "/api/support-messages/my").handlers[1];
  const list = response();
  await listHandler({ user: { username: "owner" } } as any, list as any);
  assert.deepEqual(list.result.body, [{
    id: "support-1",
    subject: "Help",
    message: "Message",
    is_read: false,
    created_at: supportMessageCreatedAt,
  }]);

  const deleteHandler = route(routes, "DELETE", "/api/support-messages/my/:id").handlers[1];
  const deleted = response();
  await deleteHandler({ params: { id: "support-1" }, user: { username: "owner" } } as any, deleted as any);
  assert.deepEqual(deleted.result, { statusCode: 200, body: { ok: true } });
  assert.equal(supportQueries.length, 2);
});

test("self-service support routes preserve database error responses", async () => {
  const routes: RegisteredRoute[] = [];
  const app = {
    get(path: string, ...handlers: Function[]) { routes.push({ method: "GET", path, handlers }); },
    post(path: string, ...handlers: Function[]) { routes.push({ method: "POST", path, handlers }); },
    patch(path: string, ...handlers: Function[]) { routes.push({ method: "PATCH", path, handlers }); },
    delete(path: string, ...handlers: Function[]) { routes.push({ method: "DELETE", path, handlers }); },
  };
  registerSupportRoutes(app as any, {
    db: { execute: async () => { throw new Error("db failed"); } } as any,
    storage: {
      getAllSupportMessages: async () => [],
      markSupportMessageRead: async () => {},
      deleteSupportMessage: async () => {},
      createAdminMessage: async () => ({} as any),
      getAdminMessagesByUsername: async () => [],
      deleteAdminMessageForUsername: async () => false,
    },
    isAuthenticated: requireAuthenticated,
    isAdmin: requireAdmin,
  });

  for (const [method, path, req] of [
    ["GET", "/api/support-messages/my", { user: { username: "owner" } }],
    ["DELETE", "/api/support-messages/my/:id", { params: { id: "support-1" }, user: { username: "owner" } }],
  ] as const) {
    const res = response();
    await route(routes, method, path).handlers[1](req as any, res as any);
    assert.deepEqual(res.result, { statusCode: 500, body: { message: "db failed" } });
  }
});

test("legacy route registry delegates self-service support routes to the Support module", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.match(root, /registerSupportRoutes\(app, \{ storage, db, isAuthenticated, isAdmin \}\);/);
  assert.equal(root.includes('app.get("/api/support-messages/my"'), false);
  assert.equal(root.includes('app.delete("/api/support-messages/my/:id"'), false);
});
