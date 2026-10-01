import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerChatFilterRoutes } from "../server/routes/chatFilter.routes";

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
const baseBadWords = ["base-one", "base-two"];

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
  failList?: boolean;
  failAdd?: "unique" | "other";
  failDelete?: boolean;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = { list: 0, add: [], delete: [] };

  registerChatFilterRoutes(app as any, {
    isAuthenticated: authenticated,
    baseBadWords,
    storage: {
      getChatFilterWords: async () => {
        calls.list += 1;
        if (options.failList) throw new Error("list failed");
        return [{ id: "c1", word: "custom" }] as any;
      },
      addChatFilterWord: async (word: string, username: string) => {
        calls.add.push([word, username]);
        if (options.failAdd === "unique") throw new Error("unique violation");
        if (options.failAdd === "other") throw new Error("add failed");
        return { id: "c2", word } as any;
      },
      deleteChatFilterWord: async (id: string) => {
        calls.delete.push(id);
        if (options.failDelete) throw new Error("delete failed");
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

test("chat-filter routes preserve their three authenticated endpoints", () => {
  const { app } = setup();
  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/admin/chat-filter",
      "POST /api/admin/chat-filter",
      "DELETE /api/admin/chat-filter/:id",
    ],
  );
  for (const entry of app.routes) {
    assert.equal(entry.handlers[0], authenticated, entry.path);
  }
});

test("chat-filter routes remain restricted to admins and moderators", async () => {
  for (const methodPath of [
    ["GET", "/api/admin/chat-filter", {}],
    ["POST", "/api/admin/chat-filter", { body: { word: "test" } }],
    ["DELETE", "/api/admin/chat-filter/:id", { params: { id: "c1" } }],
  ] as const) {
    const { app, calls } = setup();
    const [method, path, extra] = methodPath;
    const res = await call(app, method, path, {
      user: { isAdmin: false, isModerator: false },
      ...extra,
    });
    assert.deepEqual(
      [res.statusCode, res.body],
      [403, { message: "Forbidden" }],
    );
    assert.equal(calls.list, 0);
    assert.deepEqual(calls.add, []);
    assert.deepEqual(calls.delete, []);
  }
});

test("GET returns the injected base list and existing custom words unchanged", async () => {
  const { app, calls } = setup();
  const res = await call(app, "GET", "/api/admin/chat-filter", {
    user: { isModerator: true },
  });

  assert.equal(calls.list, 1);
  assert.deepEqual(res.body, {
    baseWords: ["base-one", "base-two"],
    customWords: [{ id: "c1", word: "custom" }],
  });
});

test("POST preserves word validation, trimming, and username attribution", async () => {
  const { app, calls } = setup();

  for (const word of [undefined, null, "", "   ", 42]) {
    const invalid = await call(app, "POST", "/api/admin/chat-filter", {
      user: { isAdmin: true, username: "AdminName" },
      body: { word },
    });
    assert.deepEqual(
      [invalid.statusCode, invalid.body],
      [400, { message: "Word required" }],
    );
  }
  assert.deepEqual(calls.add, []);

  const ok = await call(app, "POST", "/api/admin/chat-filter", {
    user: { isModerator: true, username: "ModName" },
    body: { word: "  custom phrase  " },
  });
  assert.deepEqual(calls.add, [["custom phrase", "ModName"]]);
  assert.deepEqual(ok.body, { id: "c2", word: "custom phrase" });
});

test("POST preserves the special duplicate-word 409 response", async () => {
  const { app } = setup({ failAdd: "unique" });
  const res = await call(app, "POST", "/api/admin/chat-filter", {
    user: { isAdmin: true, username: "AdminName" },
    body: { word: "duplicate" },
  });

  assert.deepEqual(
    [res.statusCode, res.body],
    [409, { message: "Word already in filter list" }],
  );
});

test("DELETE stringifies the route id and preserves its response", async () => {
  const { app, calls } = setup();
  const res = await call(app, "DELETE", "/api/admin/chat-filter/:id", {
    user: { isModerator: true },
    params: { id: 123 },
  });

  assert.deepEqual(calls.delete, ["123"]);
  assert.deepEqual(res.body, { ok: true });
});

test("chat-filter storage failures preserve existing 500 messages", async () => {
  const cases = [
    ["GET", "/api/admin/chat-filter", setup({ failList: true }).app, { user: { isAdmin: true } }, "list failed"],
    ["POST", "/api/admin/chat-filter", setup({ failAdd: "other" }).app, { user: { isAdmin: true, username: "a" }, body: { word: "x" } }, "add failed"],
    ["DELETE", "/api/admin/chat-filter/:id", setup({ failDelete: true }).app, { user: { isAdmin: true }, params: { id: "c1" } }, "delete failed"],
  ] as const;

  for (const [method, path, app, req, message] of cases) {
    const res = await call(app, method, path, req);
    assert.deepEqual([res.statusCode, res.body], [500, { message }]);
  }
});

test("legacy route registry owns one chat-filter registration boundary and no inline admin routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");
  assert.equal(
    (root.match(/registerChatFilterRoutes\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/admin/chat-filter"'), false);
  assert.equal(root.includes('app.post("/api/admin/chat-filter"'), false);
  assert.equal(root.includes('app.delete("/api/admin/chat-filter/:id"'), false);
  assert.match(
    root,
    /registerChatFilterRoutes\(app, \{ storage, isAuthenticated, baseBadWords: BASE_BAD_WORDS \}\);/,
  );
  assert.equal(root.includes("const BASE_BAD_WORDS = ["), true);
  assert.equal(root.includes("async function containsBadWord"), true);
});
