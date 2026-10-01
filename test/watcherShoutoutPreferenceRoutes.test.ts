import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerWatcherShoutoutPreferenceRoutes } from "../server/routes/watcherShoutoutPreference.routes";

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

function setup(options: {
  failGet?: boolean;
  failSet?: boolean;
  enabled?: boolean | null;
  missingUser?: boolean;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = { getUser: [], set: [] };

  registerWatcherShoutoutPreferenceRoutes(app as any, {
    isAuthenticated: authenticated,
    storage: {
      getUser: async (userId: string) => {
        calls.getUser.push(userId);
        if (options.failGet) throw new Error("get failed");
        if (options.missingUser) return undefined as any;
        return {
          id: userId,
          watcherShoutoutsEnabled: options.enabled,
        } as any;
      },
      setWatcherShoutoutsEnabled: async (userId: string, enabled: boolean) => {
        calls.set.push([userId, enabled]);
        if (options.failSet) throw new Error("set failed");
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

test("Watcher shoutout preference routes keep their authenticated GET and POST boundaries", () => {
  const { app } = setup();
  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/user/watcher-shoutouts",
      "POST /api/user/watcher-shoutouts",
    ],
  );
  for (const entry of app.routes) {
    assert.equal(entry.handlers[0], authenticated, entry.path);
  }
});

test("GET scopes preference lookup to the authenticated user", async () => {
  const { app, calls } = setup({ enabled: false });
  const res = await call(app, "GET", "/api/user/watcher-shoutouts", {
    user: { id: "player-1" },
  });

  assert.deepEqual(calls.getUser, ["player-1"]);
  assert.deepEqual(res.body, { enabled: false });
});

test("GET preserves the true default when the stored preference is null or the user is missing", async () => {
  for (const options of [
    { enabled: null as boolean | null },
    { missingUser: true },
  ]) {
    const { app } = setup(options);
    const res = await call(app, "GET", "/api/user/watcher-shoutouts", {
      user: { id: "player-1" },
    });
    assert.deepEqual(res.body, { enabled: true });
  }
});

test("POST accepts only booleans and writes only for the authenticated user", async () => {
  const { app, calls } = setup();

  for (const enabled of [undefined, null, 1, "true", {}]) {
    const invalid = await call(app, "POST", "/api/user/watcher-shoutouts", {
      user: { id: "player-1" },
      body: { enabled },
    });
    assert.deepEqual(
      [invalid.statusCode, invalid.body],
      [400, { message: "enabled must be a boolean" }],
    );
  }
  assert.deepEqual(calls.set, []);

  const off = await call(app, "POST", "/api/user/watcher-shoutouts", {
    user: { id: "player-1" },
    body: { enabled: false },
  });
  const on = await call(app, "POST", "/api/user/watcher-shoutouts", {
    user: { id: "player-2" },
    body: { enabled: true },
  });

  assert.deepEqual(calls.set, [
    ["player-1", false],
    ["player-2", true],
  ]);
  assert.deepEqual(off.body, { enabled: false });
  assert.deepEqual(on.body, { enabled: true });
});

test("Watcher shoutout preference routes preserve their existing error responses", async () => {
  const getSetup = setup({ failGet: true });
  const getRes = await call(
    getSetup.app,
    "GET",
    "/api/user/watcher-shoutouts",
    { user: { id: "player-1" } },
  );
  assert.deepEqual(
    [getRes.statusCode, getRes.body],
    [500, { message: "Failed to get preference" }],
  );

  const setSetup = setup({ failSet: true });
  const setRes = await call(
    setSetup.app,
    "POST",
    "/api/user/watcher-shoutouts",
    { user: { id: "player-1" }, body: { enabled: true } },
  );
  assert.deepEqual(
    [setRes.statusCode, setRes.body],
    [500, { message: "Failed to update preference" }],
  );
});

test("legacy route registry owns one Watcher preference registration boundary and no inline preference routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.equal(
    (root.match(/registerWatcherShoutoutPreferenceRoutes\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/user/watcher-shoutouts"'), false);
  assert.equal(root.includes('app.post("/api/user/watcher-shoutouts"'), false);
  assert.match(
    root,
    /registerWatcherShoutoutPreferenceRoutes\(app, \{ storage, isAuthenticated \}\);[\s\S]*registerWorldChatReadRoute\(app, \{ storage, isAuthenticated \}\);/,
  );
});
