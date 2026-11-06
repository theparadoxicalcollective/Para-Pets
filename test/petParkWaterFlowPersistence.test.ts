import assert from "node:assert/strict";
import test from "node:test";
import type { RequestHandler } from "express";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";
import { petParkSceneItems } from "../shared/schema";
import { sanitizeParkInteriorEffects } from "../shared/petParkRooms";

/** Exercise the existing admin handlers with an in-memory scene-item store. */
function setupEffectRoutes() {
  const handlers = new Map<string, RequestHandler>();
  const isAdmin = ((_req: unknown, _res: unknown, next: () => void) => next()) as RequestHandler;
  let saved: Record<string, unknown> | null = null;
  let imageProcessingCalls = 0;
  const app = {
    post(path: string, ...fns: RequestHandler[]) {
      if (path === "/api/admin/pet-park/items") {
        assert.equal(fns[0], isAdmin);
        handlers.set("POST", fns.at(-1)!);
      }
    },
    patch(path: string, ...fns: RequestHandler[]) {
      if (path === "/api/admin/pet-park/items/:id") {
        assert.equal(fns[0], isAdmin);
        handlers.set("PATCH", fns.at(-1)!);
      }
    },
    get() {}, put() {}, delete() {},
  };
  const db = {
    insert(table: unknown) {
      assert.equal(table, petParkSceneItems);
      return { values(value: Record<string, unknown>) {
        return { async returning() {
          saved = { id: "flow-1", ...value };
          return [saved];
        } };
      } };
    },
    update(table: unknown) {
      assert.equal(table, petParkSceneItems);
      return { set(update: Record<string, unknown>) {
        return { where() {
          return { async returning() {
            if (!saved) return [];
            saved = { ...saved, ...update };
            return [saved];
          } };
        } };
      } };
    },
  };
  registerPetParkAdminRoutes(app as any, {
    db: db as any, isAdmin,
    processWorldImage: async () => {
      imageProcessingCalls++;
      return "/unused-art.png";
    },
  });

  async function invoke(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const handler = handlers.get(method);
    assert.ok(handler, method + " handler is registered");
    const response: any = {
      statusCode: 200, body: null,
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.body = value; return this; },
    };
    await handler({ body, params: { id: "flow-1" } } as any, response, (() => {}) as any);
    return response;
  }
  return { invoke, getSaved: () => saved, imageProcessingCalls: () => imageProcessingCalls };
}

test("vertical water flow is created and resized through existing Pet Park admin endpoints", async () => {
  const route = setupEffectRoutes();
  const created = await route.invoke("POST", {
    kind: "effect", effectType: "water_flow", imageData: null,
    xPct: 0.32, yPct: 0.57, size: 170, flipped: false, layer: 0,
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.effectType, "water_flow");
  assert.equal(created.body.imageUrl, null);

  const moved = await route.invoke("PATCH", {
    xPct: 0.45, yPct: 0.68, size: 220, flipped: true, layer: 0,
  });
  assert.equal(moved.statusCode, 200);
  assert.deepEqual(
    [moved.body.id, moved.body.effectType, moved.body.xPct, moved.body.yPct, moved.body.size, moved.body.flipped],
    ["flow-1", "water_flow", 0.45, 0.68, 220, true],
  );
  assert.equal(route.imageProcessingCalls(), 0, "pure SVG effects never process or upload artwork");
  assert.equal(route.getSaved(), moved.body);
});

test("unsupported water-effect type is rejected without creating a scene item", async () => {
  const route = setupEffectRoutes();
  const response = await route.invoke("POST", {
    kind: "effect", effectType: "water_flow_legacy", imageData: null,
    xPct: 0.5, yPct: 0.5, size: 150, flipped: false, layer: 0,
  });
  assert.equal(response.statusCode, 400);
  assert.equal(route.getSaved(), null);
});

test("interior flow placement survives the existing room-effect sanitizer", () => {
  const placed = sanitizeParkInteriorEffects([
    { id: "indoor-flow", type: "water_flow", x: 0.44, y: 0.61, size: 24 },
  ]);
  assert.deepEqual(placed, [
    { id: "indoor-flow", type: "water_flow", x: 0.44, y: 0.61, size: 24 },
  ]);
});
