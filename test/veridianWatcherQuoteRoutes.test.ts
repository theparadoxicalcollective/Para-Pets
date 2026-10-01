import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerVeridianWatcherQuoteRoutes } from "../server/routes/veridianWatcherQuote.routes";

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

function setup(options: { fail?: "list" | "add" | "delete" } = {}) {
  const app = new RouteRecorder();
  const calls: any = { list: 0, add: [], delete: [] };

  registerVeridianWatcherQuoteRoutes(app as any, {
    storage: {
      getVWQuotes: async () => {
        if (options.fail === "list") throw new Error("list failed");
        calls.list += 1;
        return [{ id: "q1", message: "Stay curious" }] as any;
      },
      addVWQuote: async (message: string, username: string) => {
        if (options.fail === "add") throw new Error("add failed");
        calls.add.push([message, username]);
        return { id: "q2", message } as any;
      },
      deleteVWQuote: async (id: string) => {
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

test("Watcher quote routes preserve their three legacy endpoints without adding middleware", () => {
  const { app } = setup();
  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/admin/vw-quotes",
      "POST /api/admin/vw-quotes",
      "DELETE /api/admin/vw-quotes/:id",
    ],
  );
  for (const entry of app.routes) {
    assert.equal(entry.handlers.length, 1, entry.path);
  }
});

test("Watcher quote list remains available to admins and moderators only", async () => {
  for (const user of [
    undefined,
    { isAdmin: false, isModerator: false },
  ]) {
    const { app, calls } = setup();
    const res = await call(app, "GET", "/api/admin/vw-quotes", { user });
    assert.deepEqual(
      [res.statusCode, res.body],
      [403, { message: "Forbidden" }],
    );
    assert.equal(calls.list, 0);
  }

  for (const user of [
    { isAdmin: true, isModerator: false },
    { isAdmin: false, isModerator: true },
  ]) {
    const { app, calls } = setup();
    const res = await call(app, "GET", "/api/admin/vw-quotes", { user });
    assert.equal(calls.list, 1);
    assert.deepEqual(res.body, [{ id: "q1", message: "Stay curious" }]);
  }
});

test("Watcher quote creation preserves permission, validation, trimming, and username attribution", async () => {
  const { app, calls } = setup();

  const forbidden = await call(app, "POST", "/api/admin/vw-quotes", {
    user: { isAdmin: false, isModerator: false },
    body: { message: "Hello" },
  });
  assert.deepEqual(
    [forbidden.statusCode, forbidden.body],
    [403, { message: "Forbidden" }],
  );

  for (const message of ["", "   ", null]) {
    const invalid = await call(app, "POST", "/api/admin/vw-quotes", {
      user: { isModerator: true, username: "ModName" },
      body: { message },
    });
    assert.deepEqual(
      [invalid.statusCode, invalid.body],
      [400, { message: "Message is required" }],
    );
  }

  const ok = await call(app, "POST", "/api/admin/vw-quotes", {
    user: { isModerator: true, username: "ModName" },
    body: { message: "  Keep exploring  " },
  });
  assert.deepEqual(calls.add, [["Keep exploring", "ModName"]]);
  assert.deepEqual(ok.body, { id: "q2", message: "Keep exploring" });
});

test("Watcher quote deletion preserves moderator/admin permission and response", async () => {
  const { app, calls } = setup();

  const forbidden = await call(app, "DELETE", "/api/admin/vw-quotes/:id", {
    user: undefined,
    params: { id: "q1" },
  });
  assert.deepEqual(
    [forbidden.statusCode, forbidden.body],
    [403, { message: "Forbidden" }],
  );

  const ok = await call(app, "DELETE", "/api/admin/vw-quotes/:id", {
    user: { isAdmin: true },
    params: { id: "q1" },
  });
  assert.deepEqual(calls.delete, ["q1"]);
  assert.deepEqual(ok.body, { ok: true });
});

test("Watcher quote storage errors keep their existing 500 response messages", async () => {
  const cases = [
    ["list", "GET", "/api/admin/vw-quotes", { user: { isAdmin: true } }, "list failed"],
    ["add", "POST", "/api/admin/vw-quotes", { user: { isModerator: true, username: "m" }, body: { message: "Hello" } }, "add failed"],
    ["delete", "DELETE", "/api/admin/vw-quotes/:id", { user: { isAdmin: true }, params: { id: "q1" } }, "delete failed"],
  ] as const;

  for (const [fail, method, path, req, message] of cases) {
    const { app } = setup({ fail });
    const res = await call(app, method, path, req);
    assert.deepEqual([res.statusCode, res.body], [500, { message }]);
  }
});

test("legacy route registry owns one Watcher quote registration boundary and no inline quote routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.equal(
    (root.match(/registerVeridianWatcherQuoteRoutes\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/admin/vw-quotes"'), false);
  assert.equal(root.includes('app.post("/api/admin/vw-quotes"'), false);
  assert.equal(root.includes('app.delete("/api/admin/vw-quotes/:id"'), false);
  assert.match(
    root,
    /registerVeridianWatcherQuoteRoutes\(app, \{ storage \}\);[\s\S]*startVeridianWatcherBackgroundJobs\(\{ db, storage, postWatcherMessage \}\);/,
  );
});
