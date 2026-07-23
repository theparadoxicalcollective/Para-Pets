import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin, requireAuthenticated } from "../server/auth";
import { registerSupportRoutes } from "../server/routes/support.routes";
import { storage } from "../server/storage";

type RegisteredRoute = { method: string; path: string; handlers: Function[] };

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
  const messages = [{ id: "owner-message", username: "owner", subject: "Private", message: "Only owner" }];
  const calls: Array<[string, string]> = [];
  registerSupportRoutes(app as any, {
    storage: {
      getAllSupportMessages: async () => [],
      markSupportMessageRead: async () => {},
      deleteSupportMessage: async () => {},
      createAdminMessage: async () => ({ id: "reply" }),
      getAdminMessagesByUsername: async (username: string) => messages.filter(message => message.username === username),
      deleteAdminMessageForUsername: async (id: string, username: string) => {
        calls.push([id, username]);
        return id === "owner-message" && username === "owner";
      },
    },
    isAuthenticated: requireAuthenticated,
    isAdmin: requireAdmin,
  });
  return { routes, calls };
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
  ]);
  for (const path of ["/api/admin/support-messages", "/api/admin/support-messages/:id/read", "/api/admin/support-messages/:id", "/api/admin/support-messages/:id/respond"]) {
    assert.equal(route(routes, path.includes(":id/read") ? "PATCH" : path.includes(":id") && path.endsWith("respond") ? "POST" : path.includes(":id") ? "DELETE" : "GET", path).handlers[0], requireAdmin);
  }
  assert.deepEqual(route(routes, "DELETE", "/api/admin-messages/:id").handlers.slice(0, 1), [requireAuthenticated]);
});

test("players fetch only their own admin messages and anonymous users are rejected", async () => {
  const { routes } = registerRoutes();
  const handler = route(routes, "GET", "/api/admin-messages").handlers[0];

  const anonymous = response();
  await handler({ isAuthenticated: () => false } as any, anonymous as any);
  assert.deepEqual(anonymous.result, { statusCode: 401, body: { message: "Unauthorized" } });

  const owner = response();
  await handler({ isAuthenticated: () => true, user: { username: "owner" } } as any, owner as any);
  assert.deepEqual(owner.result.body, [{ id: "owner-message", username: "owner", subject: "Private", message: "Only owner" }]);
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
