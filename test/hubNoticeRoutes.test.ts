import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerHubNoticeRoutes } from "../server/routes/hubNotice.routes";

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

function setup(options: { fail?: boolean; rows?: any[] } = {}) {
  const app = new RouteRecorder();
  const calls: unknown[] = [];
  registerHubNoticeRoutes(app as any, {
    isAuthenticated: authenticated,
    db: {
      execute: async (query: unknown) => {
        calls.push(query);
        if (options.fail) throw new Error("db failed");
        return { rows: options.rows ?? [] } as any;
      },
    } as any,
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
  req: any = {},
) {
  const res = response();
  await route(app, method, path).handlers.at(-1)!(
    req,
    res,
    (() => {}) as any,
  );
  return res;
}

test("Hub notice routes preserve the public read and authenticated write boundaries", () => {
  const { app } = setup();
  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/hub/notices",
      "POST /api/hub/notices",
      "DELETE /api/hub/notices/:id",
    ],
  );
  assert.equal(route(app, "GET", "/api/hub/notices").handlers.length, 1);
  assert.equal(route(app, "POST", "/api/hub/notices").handlers[0], authenticated);
  assert.equal(route(app, "DELETE", "/api/hub/notices/:id").handlers[0], authenticated);
});

test("public Hub notice list returns database rows unchanged", async () => {
  const rows = [{
    id: "n1",
    image_url: "/notice.png",
    href: "/coins",
    label: "Limited Event",
    sort_order: 1,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
  }];
  const { app, calls } = setup({ rows });
  const res = await call(app, "GET", "/api/hub/notices");

  assert.equal(calls.length, 1);
  assert.deepEqual(res.body, rows);
});

test("Hub notice creation remains admin-only and requires image_url", async () => {
  const deniedSetup = setup();
  const denied = await call(deniedSetup.app, "POST", "/api/hub/notices", {
    user: { isAdmin: false },
    body: { image_url: "/notice.png" },
  });
  assert.deepEqual(
    [denied.statusCode, denied.body],
    [403, { message: "Admin only" }],
  );
  assert.equal(deniedSetup.calls.length, 0);

  const invalidSetup = setup();
  const invalid = await call(invalidSetup.app, "POST", "/api/hub/notices", {
    user: { isAdmin: true },
    body: {},
  });
  assert.deepEqual(
    [invalid.statusCode, invalid.body],
    [400, { message: "image_url required" }],
  );
  assert.equal(invalidSetup.calls.length, 0);

  const created = {
    id: "n2",
    image_url: "/notice.png",
    href: "",
    label: "",
    sort_order: 0,
  };
  const okSetup = setup({ rows: [created] });
  const ok = await call(okSetup.app, "POST", "/api/hub/notices", {
    user: { isAdmin: true },
    body: { image_url: "/notice.png" },
  });
  assert.equal(okSetup.calls.length, 1);
  assert.deepEqual(ok.body, created);
});

test("Hub notice deletion remains admin-only and preserves its response", async () => {
  const deniedSetup = setup();
  const denied = await call(deniedSetup.app, "DELETE", "/api/hub/notices/:id", {
    user: { isAdmin: false },
    params: { id: "n1" },
  });
  assert.deepEqual(
    [denied.statusCode, denied.body],
    [403, { message: "Admin only" }],
  );
  assert.equal(deniedSetup.calls.length, 0);

  const okSetup = setup();
  const ok = await call(okSetup.app, "DELETE", "/api/hub/notices/:id", {
    user: { isAdmin: true },
    params: { id: "n1" },
  });
  assert.equal(okSetup.calls.length, 1);
  assert.deepEqual(ok.body, { ok: true });
});

test("Hub notice database failures preserve existing 500 error messages", async () => {
  for (const [method, path, req] of [
    ["GET", "/api/hub/notices", {}],
    ["POST", "/api/hub/notices", { user: { isAdmin: true }, body: { image_url: "/notice.png" } }],
    ["DELETE", "/api/hub/notices/:id", { user: { isAdmin: true }, params: { id: "n1" } }],
  ] as const) {
    const { app } = setup({ fail: true });
    const res = await call(app, method, path, req);
    assert.deepEqual(
      [res.statusCode, res.body],
      [500, { message: "db failed" }],
    );
  }
});

test("legacy route registry owns one Hub notice registration boundary and no inline routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.equal((root.match(/registerHubNoticeRoutes\(app,/g) ?? []).length, 1);
  assert.equal(root.includes('app.get("/api/hub/notices"'), false);
  assert.equal(root.includes('app.post("/api/hub/notices"'), false);
  assert.equal(root.includes('app.delete("/api/hub/notices/:id"'), false);
});
