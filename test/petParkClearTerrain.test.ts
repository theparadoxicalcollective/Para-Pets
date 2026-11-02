import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import { petParkSceneItems } from "../shared/schema";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";

const api = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

function setup(fail = false) {
  let route: RequestHandler | undefined;
  let calls = 0;
  const isAdmin = ((_req: any, _res: any, next: any) => next()) as RequestHandler;
  const app = {
    get() {}, put() {}, patch() {}, post() {},
    delete(path: string, ...handlers: RequestHandler[]) {
      if (path !== "/api/admin/pet-park/terrain") return;
      assert.equal(handlers[0], isAdmin, "clearing terrain must require admin auth");
      route = handlers.at(-1);
    },
  };
  const db = {
    delete(table: unknown) {
      assert.equal(table, petParkSceneItems, "must not delete buildings or deposits");
      return {
        where(condition: any) {
          const query = new PgDialect().sqlToQuery(condition);
          assert.deepEqual(query.params, ["terrain"], "delete must filter to terrain kind");
          calls++;
          return {
            returning: async () => {
              if (fail) throw new Error("database unavailable");
              return [{ id: "patch-a" }, { id: "patch-b" }];
            },
          };
        },
      };
    },
  };
  registerPetParkAdminRoutes(app as any, {
    db: db as any, isAdmin, processWorldImage: async () => "processed.png",
  });
  assert.ok(route, "admin-only clear route is registered");
  async function invoke() {
    const res: any = {
      statusCode: 200, body: null,
      status(status: number) { this.statusCode = status; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    await route!({} as any, res, (() => {}) as any);
    return res;
  }
  return { invoke, count: () => calls };
}

test("clear deletes only terrain scene items and returns the deleted count", async () => {
  const handler = setup();
  const response = await handler.invoke();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { deleted: 2 });
  assert.equal(handler.count(), 1);
  assert.match(api, /where\(eq\(petParkSceneItems\.kind, "terrain"\)\)/);
  assert.doesNotMatch(page, /\+ Terrain/);
  assert.match(page, /Clear all Pet Park terrain/);
  assert.match(page, /scene\.items\.some\(item => item\.kind === "terrain"\)/);
  assert.match(page, /invalidate\(\)/);
});

test("clear failure reports an error without pretending the scene changed", async () => {
  const handler = setup(true);
  const response = await handler.invoke();
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { message: "Unable to clear Pet Park terrain" });
});
