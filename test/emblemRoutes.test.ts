import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerEmblemRoutes } from "../server/routes/emblem.routes";

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

function setup(options: {
  failList?: boolean;
  failCreate?: boolean;
  failUpdate?: boolean;
  failDelete?: boolean;
  failImage?: boolean;
} = {}) {
  const app = new RouteRecorder();
  const calls: any = {
    list: 0,
    create: [],
    update: [],
    delete: [],
    image: [],
  };

  registerEmblemRoutes(app as any, {
    isAuthenticated: authenticated,
    processEmblemImage: async (imageData) => {
      calls.image.push(imageData);
      if (options.failImage) throw new Error("image failed");
      return "/api/media/emblem";
    },
    storage: {
      listEmblems: async () => {
        calls.list += 1;
        if (options.failList) throw new Error("list failed");
        return [{ id: "e1", name: "Champion" }] as any;
      },
      createEmblem: async (data: any) => {
        calls.create.push(data);
        if (options.failCreate) throw new Error("create failed");
        return { id: "e2", ...data } as any;
      },
      updateEmblem: async (id: string, data: any) => {
        calls.update.push([id, data]);
        if (options.failUpdate) throw new Error("update failed");
      },
      deleteEmblem: async (id: string) => {
        calls.delete.push(id);
        if (options.failDelete) throw new Error("delete failed");
      },
    } as any,
  });

  return { app, calls };
}

function route(app: RouteRecorder, method: string, path: string) {
  const found = app.routes.find(
    candidate => candidate.method === method && candidate.path === path,
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

test("emblem catalog registers the four legacy routes with authentication first", () => {
  const { app } = setup();

  assert.deepEqual(
    app.routes.map(({ method, path }) => `${method} ${path}`),
    [
      "GET /api/admin/emblems",
      "POST /api/admin/emblems",
      "PATCH /api/admin/emblems/:id",
      "DELETE /api/admin/emblems/:id",
    ],
  );
  for (const registered of app.routes) {
    assert.equal(registered.handlers[0], authenticated);
  }
});

test("emblem routes preserve the in-handler administrator check", async () => {
  const { app, calls } = setup();

  for (const [method, path, body] of [
    ["GET", "/api/admin/emblems", undefined],
    ["POST", "/api/admin/emblems", { name: "Nope", imageData: "data:image/png;base64,x" }],
    ["PATCH", "/api/admin/emblems/:id", { name: "Nope" }],
    ["DELETE", "/api/admin/emblems/:id", undefined],
  ] as const) {
    const res = await call(app, method, path, {
      user: { isAdmin: false },
      body,
      params: { id: "e1" },
    });
    assert.deepEqual([res.statusCode, res.body], [403, { message: "Forbidden" }]);
  }

  assert.equal(calls.list, 0);
  assert.deepEqual(calls.create, []);
  assert.deepEqual(calls.update, []);
  assert.deepEqual(calls.delete, []);
  assert.deepEqual(calls.image, []);
});

test("emblem list and create preserve storage mapping and validation", async () => {
  const { app, calls } = setup();

  const listRes = await call(app, "GET", "/api/admin/emblems", {
    user: { isAdmin: true },
  });
  assert.equal(calls.list, 1);
  assert.deepEqual(listRes.body, [{ id: "e1", name: "Champion" }]);

  const invalid = await call(app, "POST", "/api/admin/emblems", {
    user: { isAdmin: true },
    body: { name: "Missing art" },
  });
  assert.deepEqual(
    [invalid.statusCode, invalid.body],
    [400, { message: "name and imageData required" }],
  );
  assert.deepEqual(calls.create, []);

  const created = await call(app, "POST", "/api/admin/emblems", {
    user: { isAdmin: true },
    body: {
      name: "  Champion  ",
      description: 123,
      imageData: "data:image/png;base64,abc",
    },
  });
  assert.deepEqual(calls.image, ["data:image/png;base64,abc"]);
  assert.deepEqual(calls.create, [[
    {
      name: "Champion",
      description: "123",
      imageUrl: "/api/media/emblem",
    },
  ].flat()[0]]);
  assert.equal(created.body.name, "Champion");
  assert.equal(created.body.imageUrl, "/api/media/emblem");
});

test("emblem update preserves partial-field behavior and image processing", async () => {
  const { app, calls } = setup();

  const res = await call(app, "PATCH", "/api/admin/emblems/:id", {
    user: { isAdmin: true },
    params: { id: "e1" },
    body: {
      name: "   ",
      description: "",
      imageData: "data:image/png;base64,new",
    },
  });

  assert.deepEqual(calls.image, ["data:image/png;base64,new"]);
  assert.deepEqual(calls.update, [[
    "e1",
    { description: null, imageUrl: "/api/media/emblem" },
  ]]);
  assert.deepEqual(res.body, { ok: true });
});

test("emblem delete preserves id forwarding and response", async () => {
  const { app, calls } = setup();

  const res = await call(app, "DELETE", "/api/admin/emblems/:id", {
    user: { isAdmin: true },
    params: { id: "e9" },
  });

  assert.deepEqual(calls.delete, ["e9"]);
  assert.deepEqual(res.body, { ok: true });
});

test("emblem routes preserve legacy error message fallbacks", async () => {
  const cases = [
    [setup({ failList: true }), "GET", "/api/admin/emblems", "Failed to fetch emblems", {}],
    [setup({ failCreate: true }), "POST", "/api/admin/emblems", "Failed to create emblem", { name: "A", imageData: "img" }],
    [setup({ failUpdate: true }), "PATCH", "/api/admin/emblems/:id", "Failed to update emblem", { name: "A" }],
    [setup({ failDelete: true }), "DELETE", "/api/admin/emblems/:id", "Failed to delete emblem", {}],
  ] as const;

  for (const [fixture, method, path, fallback, body] of cases) {
    const res = await call(fixture.app, method, path, {
      user: { isAdmin: true },
      params: { id: "e1" },
      body,
    });
    assert.equal(res.statusCode, 500);
    assert.equal(typeof res.body.message, "string");
    assert.ok(res.body.message === fallback || res.body.message.endsWith("failed"));
  }
});

test("legacy route registry owns one emblem registration boundary and no inline emblem routes", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal((root.match(/registerEmblemRoutes\(app,/g) ?? []).length, 1);
  assert.equal(root.includes('app.get("/api/admin/emblems"'), false);
  assert.equal(root.includes('app.post("/api/admin/emblems"'), false);
  assert.equal(root.includes('app.patch("/api/admin/emblems/:id"'), false);
  assert.equal(root.includes('app.delete("/api/admin/emblems/:id"'), false);
  assert.match(
    root,
    /processEmblemImage: \(imageData\) => processWorldImage\(imageData, 1000\)/,
  );
});
