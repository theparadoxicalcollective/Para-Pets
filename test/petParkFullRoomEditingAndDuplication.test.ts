import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { petParkSceneItems } from "../shared/schema";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";

test("building effects edit the full-height real room, never a miniature copy", () => {
  const editor = readFileSync("client/src/components/PetParkBuildingDetails.tsx", "utf8");
  const room = readFileSync("client/src/components/PetParkInteriorRoom.tsx", "utf8");
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(editor, /<PetParkInteriorRoom key=\{imagePreview\}/);
  assert.match(editor, /editEffects expanded/);
  assert.match(editor, /onEffectPointerMove=\{onEffectPointerMove\}/);
  assert.match(editor, /aria-label="Edit effects on full-size room"/);
  assert.match(editor, /aria-label="Finish editing room effects"/);
  assert.match(editor, /exitAfterSave\.current = true/);
  assert.match(editor, /mutation\.mutate\(\{ interiorEffects: effects \}\)/);
  assert.match(editor, /setEffects\(savedEffects\.current\)/);
  assert.match(room, /data-park-interior-artwork/);
  assert.match(room, /centeredHomeCameraPanX/);
  assert.match(page, /initialShowEffectChoices=\{openInteriorEffectChoices\}/);
  assert.doesNotMatch(editor, /<PetParkInteriorRoom imageUrl=\{imagePreview\}/);
});

test("selected decor shows a duplicate action and API reuses its existing upload", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const server = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
  assert.match(page, /aria-label="Duplicate park decoration"/);
  assert.match(page, /duplicateDecor\.mutate\(/);
  assert.match(page, /setSelectedPlacement\(\{ kind: "item", id: item\.id \}\)/);
  assert.match(page, /setPlacementDraft\(\{ xPct: item\.xPct/);
  assert.match(server, /app\.post\("\/api\/admin\/pet-park\/items\/:id\/duplicate", isAdmin/);
  assert.match(server, /imageUrl: original\.imageUrl/);
  assert.match(server, /original\.kind !== "decor"/);
});

function setup(known: any) {
  let middleware: RequestHandler | undefined;
  let handler: RequestHandler | undefined;
  let saved: any = null;
  let lookups = 0;
  const isAdmin = ((_req: unknown, _res: unknown, next: () => void) => next()) as RequestHandler;
  const app = {
    get() {}, patch() {}, delete() {}, put() {},
    post(path: string, ...handlers: RequestHandler[]) {
      if (path === "/api/admin/pet-park/items/:id/duplicate") {
        middleware = handlers[0];
        handler = handlers.at(-1);
      }
    },
  };
  const db = {
    // The copy action is atomic: when an older original lacks a group ID,
    // it joins its new copy to the shared decor type in the same transaction.
    async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
      return callback(db);
    },
    update(table: unknown) {
      assert.equal(table, petParkSceneItems);
      return { set(values: any) {
        return { async where() {
          if (known) Object.assign(known, values);
          return [{ ...known }];
        } };
      } };
    },
    select() {
      return { from(table: unknown) {
        assert.equal(table, petParkSceneItems);
        return { async where() { lookups++; return known ? [known] : []; } };
      } };
    },
    insert(table: unknown) {
      assert.equal(table, petParkSceneItems);
      return { values(values: any) {
        saved = values;
        return { async returning() { return [{ id: "duplicate-id", ...values }]; } };
      } };
    },
  };
  let imageProcessingCalls = 0;
  registerPetParkAdminRoutes(app as any, {
    db: db as any, isAdmin,
    processWorldImage: async () => { imageProcessingCalls++; return "new-art.png"; },
  });
  assert.equal(middleware, isAdmin, "copy endpoint must require admin authentication");
  assert.ok(handler, "copy endpoint must be registered");
  const invoke = async (xPct: unknown, yPct: unknown) => {
    const response: any = {
      statusCode: 200, body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    await handler!({ params: { id: "original" }, body: { xPct, yPct, imageData: "not trusted" } } as any,
      response, (() => {}) as any);
    return response;
  };
  return { invoke, getSaved: () => saved, lookups: () => lookups, imageProcessingCalls: () => imageProcessingCalls };
}

test("duplicating decor creates a new row with unchanged art, size, flip and layer", async () => {
  const original = { id: "original", kind: "decor", imageUrl: "/uploads/tree.png",
    tapImageUrl: "/uploads/open-gate.png", appearanceGroupId: "linked-tree",
    decorEffects: [{ id: "glow-1", type: "warm_glow", x: 0.25, y: 0.6, size: 48 }],
    size: 480, flipped: true, layer: 42, xPct: 0.2, yPct: 0.4, effectType: null,
    isWaterSource: true, decorSurface: "barrier" };
  const route = setup(original);
  const res = await route.invoke(0.33, 0.56);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, "duplicate-id");
  assert.deepEqual(route.getSaved(), {
    kind: "decor", imageUrl: "/uploads/tree.png", tapImageUrl: "/uploads/open-gate.png", effectType: null,
    appearanceGroupId: "linked-tree",
    decorEffects: [{ id: "glow-1", type: "warm_glow", x: 0.25, y: 0.6, size: 48 }],
    size: 480, flipped: true, layer: 42, xPct: 0.33, yPct: 0.56,
    isWaterSource: true, decorSurface: "barrier",
  });
  assert.equal(route.imageProcessingCalls(), 0, "duplication must never require another image upload");
});

test("invalid positions, missing objects and non-decor items cannot be copied", async () => {
  const original = { kind: "decor", imageUrl: "/uploads/tree.png", size: 100, flipped: false, layer: 0 };
  const route = setup(original);
  for (const [x,y] of [[-0.1,0.5],[1.1,0.5],[NaN,0.5],[0.5,"0.5"]]) {
    assert.equal((await route.invoke(x,y)).statusCode, 400);
  }
  assert.equal(route.lookups(), 0, "bad positions must not access the DB");
  assert.equal((await setup(null).invoke(0.5,0.5)).statusCode, 404);
  assert.equal((await setup({ ...original, kind: "effect" }).invoke(0.5,0.5)).statusCode, 422);
  assert.equal((await setup({ ...original, imageUrl: null }).invoke(0.5,0.5)).statusCode, 422);
});

test("copying a legacy ungrouped Grass decoration gives both copies one shared type", async () => {
  const legacy = { id: "original", kind: "decor", imageUrl: "/uploads/grass.png",
    appearanceGroupId: null, decorEffects: [], tapImageUrl: null, size: 120,
    flipped: false, layer: 0, xPct: .2, yPct: .4,
    decorSurface: "grass", isWaterSource: false };
  const route = setup(legacy);
  const res = await route.invoke(.5, .6);
  assert.equal(res.statusCode, 201);
  assert.equal(legacy.appearanceGroupId, "original",
    "legacy type is linked before its new copy is inserted");
  assert.equal(route.getSaved().appearanceGroupId, "original");
  assert.equal(route.getSaved().decorSurface, "grass");
  assert.deepEqual([route.getSaved().xPct, route.getSaved().yPct],[.5,.6]);
});
