import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerAvatarRoutes } from "../server/routes/avatar.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  post(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "POST", path, handlers });
    return this;
  }
}

const authenticated: RequestHandler = (_req, _res, next) => next();

function response() {
  const state: any = {
    statusCode: 200,
    body: undefined,
    headers: {} as Record<string, string>,
  };
  return Object.assign(state, {
    status(code: number) {
      state.statusCode = code;
      return state;
    },
    set(name: string, value: string) {
      state.headers[name] = value;
      return state;
    },
    json(body: unknown) {
      state.body = body;
      return state;
    },
  });
}

function setup(options: { fail?: "message" | "fallback" } = {}) {
  const app = new RouteRecorder();
  const calls: string[][] = [];

  registerAvatarRoutes(app as any, {
    isAuthenticated: authenticated,
    storage: {
      getUsersAvatars: async (ids: string[]) => {
        calls.push(ids);
        if (options.fail === "message") throw new Error("avatar read failed");
        if (options.fail === "fallback") throw { message: "" };
        return Object.fromEntries(ids.map((id) => [id, `data:${id}`])) as any;
      },
    } as any,
  });

  return { app, calls };
}

function route(app: RouteRecorder) {
  const found = app.routes.find(
    (candidate) =>
      candidate.method === "POST" && candidate.path === "/api/users/avatars",
  );
  assert.ok(found, "POST /api/users/avatars");
  return found;
}

async function call(app: RouteRecorder, body: unknown) {
  const res = response();
  await route(app).handlers.at(-1)!(
    { body } as any,
    res,
    (() => {}) as any,
  );
  return res;
}

test("avatar route preserves its authenticated POST boundary", () => {
  const { app } = setup();
  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0].method, "POST");
  assert.equal(app.routes[0].path, "/api/users/avatars");
  assert.equal(app.routes[0].handlers[0], authenticated);
});

test("avatar route filters non-string ids and returns storage data unchanged", async () => {
  const { app, calls } = setup();
  const res = await call(app, {
    userIds: ["u1", 2, null, "u2", false, "", { id: "u3" }],
  });

  assert.deepEqual(calls, [["u1", "u2", ""]]);
  assert.deepEqual(res.body, {
    u1: "data:u1",
    u2: "data:u2",
    "": "data:",
  });
  assert.equal(res.headers["Cache-Control"], "private, max-age=60");
});

test("avatar route preserves the empty request shortcut without a storage call or cache header", async () => {
  for (const body of [
    undefined,
    null,
    {},
    { userIds: null },
    { userIds: "u1" },
    { userIds: [1, null, false] },
  ]) {
    const { app, calls } = setup();
    const res = await call(app, body);
    assert.deepEqual(calls, []);
    assert.deepEqual(res.body, {});
    assert.deepEqual(res.headers, {});
  }
});

test("avatar route caps storage lookup at the first 200 filtered string ids", async () => {
  const ids = Array.from({ length: 205 }, (_, index) => `u${index}`);
  const { app, calls } = setup();
  const res = await call(app, { userIds: ids });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 200);
  assert.deepEqual(calls[0], ids.slice(0, 200));
  assert.equal(Object.keys(res.body).length, 200);
  assert.equal(res.headers["Cache-Control"], "private, max-age=60");
});

test("avatar route preserves explicit and fallback 500 error messages", async () => {
  const explicit = setup({ fail: "message" });
  const explicitRes = await call(explicit.app, { userIds: ["u1"] });
  assert.deepEqual(
    [explicitRes.statusCode, explicitRes.body],
    [500, { message: "avatar read failed" }],
  );

  const fallback = setup({ fail: "fallback" });
  const fallbackRes = await call(fallback.app, { userIds: ["u1"] });
  assert.deepEqual(
    [fallbackRes.statusCode, fallbackRes.body],
    [500, { message: "Failed to fetch avatars" }],
  );
});

test("legacy route registry owns one avatar registration boundary and no inline endpoint", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal((root.match(/registerAvatarRoutes\(app,/g) ?? []).length, 1);
  assert.equal(root.includes('app.post("/api/users/avatars"'), false);
  assert.match(
    root,
    /registerAvatarRoutes\(app, \{ storage, isAuthenticated \}\);/,
  );
});
