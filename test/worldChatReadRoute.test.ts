import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerWorldChatReadRoute } from "../server/routes/worldChatRead.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  get(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "GET", path, handlers });
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

function setup(options: { fail?: boolean } = {}) {
  const app = new RouteRecorder();
  const calls = { getMessages: 0 };

  registerWorldChatReadRoute(app as any, {
    isAuthenticated: authenticated,
    storage: {
      getWorldChatMessages: async () => {
        calls.getMessages += 1;
        if (options.fail) throw new Error("chat read failed");
        return [
          { id: "m1", message: "Hello" },
          { id: "m2", message: "World" },
        ] as any;
      },
    } as any,
  });

  return { app, calls };
}

function route(app: RouteRecorder) {
  const found = app.routes.find(
    (candidate) =>
      candidate.method === "GET" && candidate.path === "/api/world-chat",
  );
  assert.ok(found, "GET /api/world-chat");
  return found;
}

async function call(app: RouteRecorder) {
  const res = response();
  await route(app).handlers.at(-1)!(
    {} as any,
    res,
    (() => {}) as any,
  );
  return res;
}

test("world-chat read route preserves its authenticated GET boundary", () => {
  const { app } = setup();
  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0].method, "GET");
  assert.equal(app.routes[0].path, "/api/world-chat");
  assert.equal(app.routes[0].handlers[0], authenticated);
});

test("world-chat read returns storage messages unchanged", async () => {
  const { app, calls } = setup();
  const res = await call(app);

  assert.equal(calls.getMessages, 1);
  assert.deepEqual(res.body, [
    { id: "m1", message: "Hello" },
    { id: "m2", message: "World" },
  ]);
});

test("world-chat read preserves storage error status and message", async () => {
  const { app, calls } = setup({ fail: true });
  const res = await call(app);

  assert.equal(calls.getMessages, 1);
  assert.deepEqual(
    [res.statusCode, res.body],
    [500, { message: "chat read failed" }],
  );
});

test("legacy route registry owns one world-chat read registration boundary and no inline GET", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal(
    (root.match(/registerWorldChatReadRoute\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/world-chat"'), false);
  assert.equal(root.includes("const BASE_BAD_WORDS = ["), true);
  assert.equal(root.includes("async function containsBadWord"), true);
  assert.equal(root.includes("[WorldChat] Cleanup error:"), true);
});
