import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPrivacyPolicyRoutes } from "../server/routes/privacyPolicy.routes";

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
  storedText?: string | null;
  failGet?: boolean;
  failSet?: boolean;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = { get: [], set: [] };

  registerPrivacyPolicyRoutes(app as any, {
    isAuthenticated: authenticated,
    storage: {
      getGameSetting: async (key: string) => {
        calls.get.push(key);
        if (options.failGet) throw new Error("read failed");
        return options.storedText;
      },
      setGameSetting: async (key: string, value: string) => {
        calls.set.push([key, value]);
        if (options.failSet) throw new Error("write failed");
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

test("privacy-policy routes preserve a public GET and authenticated POST boundary", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/privacy-policy",
      "POST /api/admin/privacy-policy",
    ],
  );
  assert.equal(route(app, "GET", "/api/privacy-policy").handlers.length, 1);
  assert.equal(
    route(app, "POST", "/api/admin/privacy-policy").handlers[0],
    authenticated,
  );
});

test("public privacy-policy read preserves storage key and empty-string fallback", async () => {
  const populated = setup({ storedText: "Privacy text" });
  const populatedRes = await call(
    populated.app,
    "GET",
    "/api/privacy-policy",
  );
  assert.deepEqual(populated.calls.get, ["privacy_policy"]);
  assert.deepEqual(populatedRes.body, { text: "Privacy text" });

  for (const storedText of [null, undefined]) {
    const empty = setup({ storedText: storedText as any });
    const emptyRes = await call(empty.app, "GET", "/api/privacy-policy");
    assert.deepEqual(emptyRes.body, { text: "" });
  }
});

test("privacy-policy write remains administrator-only", async () => {
  const { app, calls } = setup();
  const res = await call(app, "POST", "/api/admin/privacy-policy", {
    user: { isAdmin: false },
    body: { text: "Privacy text" },
  });

  assert.deepEqual(
    [res.statusCode, res.body],
    [403, { message: "Forbidden" }],
  );
  assert.deepEqual(calls.set, []);
});

test("privacy-policy write requires a string but preserves empty strings", async () => {
  const { app, calls } = setup();

  for (const text of [undefined, null, 123, false, {}]) {
    const invalid = await call(app, "POST", "/api/admin/privacy-policy", {
      user: { isAdmin: true },
      body: { text },
    });
    assert.deepEqual(
      [invalid.statusCode, invalid.body],
      [400, { message: "text required" }],
    );
  }
  assert.deepEqual(calls.set, []);

  const ok = await call(app, "POST", "/api/admin/privacy-policy", {
    user: { isAdmin: true },
    body: { text: "" },
  });
  assert.deepEqual(calls.set, [["privacy_policy", ""]]);
  assert.deepEqual(ok.body, { ok: true });
});

test("privacy-policy routes preserve their fixed 500 error messages", async () => {
  const getSetup = setup({ failGet: true });
  const getRes = await call(getSetup.app, "GET", "/api/privacy-policy");
  assert.deepEqual(
    [getRes.statusCode, getRes.body],
    [500, { message: "Failed to load privacy policy" }],
  );

  const setSetup = setup({ failSet: true });
  const setRes = await call(
    setSetup.app,
    "POST",
    "/api/admin/privacy-policy",
    { user: { isAdmin: true }, body: { text: "Privacy text" } },
  );
  assert.deepEqual(
    [setRes.statusCode, setRes.body],
    [500, { message: "Failed to save privacy policy" }],
  );
});

test("legacy route registry owns one privacy-policy registration boundary and no inline routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal(
    (root.match(/registerPrivacyPolicyRoutes\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/privacy-policy"'), false);
  assert.equal(root.includes('app.post("/api/admin/privacy-policy"'), false);
  assert.match(
    root,
    /registerPrivacyPolicyRoutes\(app, \{ storage, isAuthenticated \}\);/,
  );
});
