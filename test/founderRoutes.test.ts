import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerFounderRoutes } from "../server/routes/founder.routes";

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

function setup(options: { fail?: string } = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    list: 0,
    add: [],
    rename: [],
    tier: [],
    delete: [],
  };

  registerFounderRoutes(app as any, {
    isAuthenticated: authenticated,
    storage: {
      getFounders: async () => {
        if (options.fail === "list") throw new Error("list failed");
        calls.list += 1;
        return [{ id: "f1", name: "Supporter" }] as any;
      },
      addFounder: async (name: string, addedBy: string) => {
        if (options.fail === "add") throw new Error("add failed");
        calls.add.push([name, addedBy]);
        return { id: "f2", name } as any;
      },
      updateFounderName: async (id: string, name: string) => {
        if (options.fail === "rename") throw new Error("rename failed");
        calls.rename.push([id, name]);
        return { id, name } as any;
      },
      updateFounderTier: async (id: string, tier: string | null) => {
        if (options.fail === "tier") throw new Error("tier failed");
        calls.tier.push([id, tier]);
        return { id, tier } as any;
      },
      deleteFounder: async (id: string) => {
        if (options.fail === "delete") throw new Error("delete failed");
        calls.delete.push(id);
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

test("Founder routes preserve the public read and authenticated write boundaries", () => {
  const { app } = setup();
  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/founders",
      "POST /api/founders",
      "PATCH /api/founders/:id",
      "DELETE /api/founders/:id",
    ],
  );
  assert.equal(route(app, "GET", "/api/founders").handlers.length, 1);
  for (const entry of app.routes.filter(({ method }) => method !== "GET")) {
    assert.equal(entry.handlers[0], authenticated, entry.path);
  }
});

test("public Founder list response stays unchanged", async () => {
  const { app, calls } = setup();
  const res = await call(app, "GET", "/api/founders");
  assert.equal(calls.list, 1);
  assert.deepEqual(res.body, [{ id: "f1", name: "Supporter" }]);
});

test("Founder creation remains admin-only and trims validated names", async () => {
  const { app, calls } = setup();

  const forbidden = await call(app, "POST", "/api/founders", {
    user: { isAdmin: false, username: "mod" },
    body: { name: "Supporter" },
  });
  assert.deepEqual(
    [forbidden.statusCode, forbidden.body],
    [403, { message: "Forbidden" }],
  );

  for (const name of ["", "   ", 42]) {
    const invalid = await call(app, "POST", "/api/founders", {
      user: { isAdmin: true, username: "admin" },
      body: { name },
    });
    assert.deepEqual(
      [invalid.statusCode, invalid.body],
      [400, { message: "Name required" }],
    );
  }

  const tooLong = await call(app, "POST", "/api/founders", {
    user: { isAdmin: true, username: "admin" },
    body: { name: "x".repeat(121) },
  });
  assert.deepEqual(
    [tooLong.statusCode, tooLong.body],
    [400, { message: "Name too long (max 120)" }],
  );

  const ok = await call(app, "POST", "/api/founders", {
    user: { isAdmin: true, username: "AdminName" },
    body: { name: "  Para Supporter  " },
  });
  assert.deepEqual(calls.add, [["Para Supporter", "AdminName"]]);
  assert.deepEqual(ok.body, { id: "f2", name: "Para Supporter" });
});

test("Founder edits preserve name precedence and tier validation", async () => {
  const { app, calls } = setup();

  const rename = await call(app, "PATCH", "/api/founders/:id", {
    user: { isAdmin: true },
    params: { id: 123 },
    body: { name: "  New Name  ", tier: "gold" },
  });
  assert.deepEqual(calls.rename, [["123", "New Name"]]);
  assert.deepEqual(calls.tier, []);
  assert.deepEqual(rename.body, { id: "123", name: "New Name" });

  const invalidName = await call(app, "PATCH", "/api/founders/:id", {
    user: { isAdmin: true },
    params: { id: "f1" },
    body: { name: " " },
  });
  assert.deepEqual(
    [invalidName.statusCode, invalidName.body],
    [400, { message: "name must be a non-empty string" }],
  );

  const invalidTier = await call(app, "PATCH", "/api/founders/:id", {
    user: { isAdmin: true },
    params: { id: "f1" },
    body: { tier: "platinum" },
  });
  assert.deepEqual(
    [invalidTier.statusCode, invalidTier.body],
    [400, { message: "tier must be bronze, silver, gold, or null" }],
  );

  const tier = await call(app, "PATCH", "/api/founders/:id", {
    user: { isAdmin: true },
    params: { id: "f1" },
    body: { tier: null },
  });
  assert.deepEqual(calls.tier, [["f1", null]]);
  assert.deepEqual(tier.body, { id: "f1", tier: null });
});

test("Founder delete stays admin-only and preserves its response", async () => {
  const { app, calls } = setup();

  const forbidden = await call(app, "DELETE", "/api/founders/:id", {
    user: { isAdmin: false },
    params: { id: "f1" },
  });
  assert.deepEqual(
    [forbidden.statusCode, forbidden.body],
    [403, { message: "Forbidden" }],
  );

  const ok = await call(app, "DELETE", "/api/founders/:id", {
    user: { isAdmin: true },
    params: { id: 456 },
  });
  assert.deepEqual(calls.delete, ["456"]);
  assert.deepEqual(ok.body, { ok: true });
});

test("Founder storage errors keep their existing 500 response messages", async () => {
  for (const [fail, method, path, req, message] of [
    ["list", "GET", "/api/founders", {}, "list failed"],
    ["add", "POST", "/api/founders", { user: { isAdmin: true, username: "a" }, body: { name: "Name" } }, "add failed"],
    ["rename", "PATCH", "/api/founders/:id", { user: { isAdmin: true }, params: { id: "f1" }, body: { name: "Name" } }, "rename failed"],
    ["tier", "PATCH", "/api/founders/:id", { user: { isAdmin: true }, params: { id: "f1" }, body: { tier: "gold" } }, "tier failed"],
    ["delete", "DELETE", "/api/founders/:id", { user: { isAdmin: true }, params: { id: "f1" } }, "delete failed"],
  ] as const) {
    const { app } = setup({ fail });
    const res = await call(app, method, path, req);
    assert.deepEqual([res.statusCode, res.body], [500, { message }]);
  }
});

test("legacy route registry owns one Founder registration boundary and no inline routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.equal((root.match(/registerFounderRoutes\(app,/g) ?? []).length, 1);
  assert.equal(root.includes('app.get("/api/founders"'), false);
  assert.equal(root.includes('app.post("/api/founders"'), false);
  assert.equal(root.includes('app.patch("/api/founders/:id"'), false);
  assert.equal(root.includes('app.delete("/api/founders/:id"'), false);
});
