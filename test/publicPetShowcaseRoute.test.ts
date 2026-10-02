import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPublicPetShowcaseRoute } from "../server/routes/publicPetShowcase.routes";

type Route = { method: string; path: string; handlers: RequestHandler[] };

class RouteRecorder {
  routes: Route[] = [];

  get(path: string, ...handlers: RequestHandler[]) {
    this.routes.push({ method: "GET", path, handlers });
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

function setup(options: { fail?: boolean } = {}) {
  const app = new RouteRecorder();
  const calls = { getAllShopItems: 0 };

  registerPublicPetShowcaseRoute(app as any, {
    storage: {
      getAllShopItems: async () => {
        calls.getAllShopItems += 1;
        if (options.fail) throw new Error("storage failed");
        return [
          {
            id: "pet-1",
            type: "pet",
            name: "Forest Pet",
            hatchedImageUrl: "/forest.png",
            imageUrl: "/egg.png",
          },
          {
            id: "item-1",
            type: "item",
            name: "Potion",
            hatchedImageUrl: "/not-a-pet.png",
          },
          {
            id: "pet-2",
            type: "pet",
            name: "No Hatched Art",
            hatchedImageUrl: null,
            imageUrl: "/egg-only.png",
          },
          {
            id: "pet-3",
            type: "pet",
            name: "Bayou Pet",
            hatchedImageUrl: "/bayou.png",
          },
        ] as any;
      },
    } as any,
  });

  return { app, calls };
}

function route(app: RouteRecorder) {
  const found = app.routes.find(
    (candidate) =>
      candidate.method === "GET" && candidate.path === "/api/public/pets",
  );
  assert.ok(found, "GET /api/public/pets");
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

test("public pet showcase preserves its unauthenticated GET boundary", () => {
  const { app } = setup();

  assert.equal(app.routes.length, 1);
  assert.equal(app.routes[0].method, "GET");
  assert.equal(app.routes[0].path, "/api/public/pets");
  assert.equal(app.routes[0].handlers.length, 1);
});

test("public pet showcase keeps only pets with hatched art and maps the same fields", async () => {
  const { app, calls } = setup();
  const res = await call(app);

  assert.equal(calls.getAllShopItems, 1);
  assert.equal(Array.isArray(res.body), true);

  const normalized = [...res.body].sort((a: any, b: any) =>
    String(a.id).localeCompare(String(b.id)),
  );
  assert.deepEqual(normalized, [
    { id: "pet-1", name: "Forest Pet", imageUrl: "/forest.png" },
    { id: "pet-3", name: "Bayou Pet", imageUrl: "/bayou.png" },
  ]);
});

test("public pet showcase preserves its fixed 500 error response", async () => {
  const { app, calls } = setup({ fail: true });
  const res = await call(app);

  assert.equal(calls.getAllShopItems, 1);
  assert.deepEqual(
    [res.statusCode, res.body],
    [500, { message: "Failed to load pets" }],
  );
});

test("public pet showcase module retains randomized ordering behavior", () => {
  const source = fs.readFileSync(
    "server/routes/publicPetShowcase.routes.ts",
    "utf8",
  );
  assert.match(source, /\.sort\(\(\) => Math\.random\(\) - 0\.5\)/);
});

test("legacy route registry owns one public pet showcase registration boundary and no inline route", () => {
  const root = fs.readFileSync("server/routes.ts", "utf8");

  assert.equal(
    (root.match(/registerPublicPetShowcaseRoute\(app,/g) ?? []).length,
    1,
  );
  assert.equal(root.includes('app.get("/api/public/pets"'), false);
  assert.match(
    root,
    /registerPublicPetShowcaseRoute\(app, \{ storage \}\);/,
  );
});
