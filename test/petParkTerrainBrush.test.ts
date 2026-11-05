import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { RequestHandler } from "express";
import { petParkSceneItems } from "../shared/schema";
import { registerPetParkAdminRoutes } from "../server/routes/petParkAdmin.routes";
import { parkBrushWorldPoint, parkExtendBrushStroke, PARK_BRUSH_MAX_STAMPS } from "../client/src/lib/petParkTerrainBrush";

test("pointer samples the actual scaled viewport and existing camera transform", () => {
  const frame = { left: 50, top: 30, width: 200, height: 300 };
  const viewport = { width: 400, height: 600 };
  const camera = { x: -200, y: -360 };
  const world = { width: 1000, height: 1500 };
  const p = parkBrushWorldPoint(150, 180, frame, viewport, camera, world);
  assert.ok(Math.abs(p.xPct - 0.4) < 1e-8);
  assert.ok(Math.abs(p.yPct - 0.44) < 1e-8);
  assert.deepEqual(parkBrushWorldPoint(-10000, -10000, frame, viewport, camera, world), { xPct: 0, yPct: 0 });
  assert.deepEqual(parkBrushWorldPoint(10000, 10000, frame, viewport, camera, world), { xPct: 1, yPct: 1 });
});

test("fast drag interpolates a continuous world-space trail while zoom and screen sizes cannot change its density", () => {
  const world = { width: 1800, height: 2700 };
  const start = { xPct: 0.3, yPct: 0.3 };
  const target = { xPct: 0.75, yPct: 0.68 };
  const stroke = parkExtendBrushStroke([start], target, world, 200);
  assert.ok(stroke.length > 10);
  assert.ok(stroke.length <= PARK_BRUSH_MAX_STAMPS);
  for (let i = 1; i < stroke.length; i++) {
    const previous = stroke[i - 1];
    const current = stroke[i];
    assert.ok(Math.hypot((current.xPct - previous.xPct) * world.width,
      (current.yPct - previous.yPct) * world.height) <= 84.001);
  }
  assert.deepEqual(parkExtendBrushStroke(stroke, stroke[stroke.length - 1], world, 200), stroke);
  const long = parkExtendBrushStroke([start], { xPct: 1, yPct: 1 }, { width: 5400, height: 8100 }, 60);
  assert.equal(long.length, PARK_BRUSH_MAX_STAMPS, "enforce the backend cap even with fast cross-map gestures");
});

function setupRoute() {
  let handler: RequestHandler | undefined;
  let middleware: RequestHandler | undefined;
  let inserts: Record<string, unknown>[] = [];
  let calls = 0;
  const requireAdmin = ((_req: unknown, _res: unknown, next: () => void) => next()) as RequestHandler;
  const app = {
    get() {}, put() {}, patch() {}, delete() {},
    post(path: string, ...actions: RequestHandler[]) {
      if (path === "/api/admin/pet-park/terrain-strokes") {
        middleware = actions[0]; handler = actions.at(-1);
      }
    },
  };
  const db = {
    insert(table: unknown) {
      assert.equal(table, petParkSceneItems);
      return {
        values(rows: Record<string, unknown>[]) {
          calls++;
          inserts = rows;
          return { returning: async () => rows.map((row, index) => ({ ...row, id: `stamp-${index}` })) };
        },
      };
    },
  };
  registerPetParkAdminRoutes(app as any, {
    db: db as any, isAdmin: requireAdmin, processWorldImage: async () => "unused.png",
  });
  assert.equal(middleware, requireAdmin, "bulk insertion must require admin authorization");
  assert.ok(handler);
  const invoke = async (body: unknown) => {
    const response: any = {
      statusCode: 200, body: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(data: unknown) { this.body = data; return this; },
    };
    await handler!({ body } as any, response, (() => {}) as any);
    return response;
  };
  return { invoke, inserts: () => inserts, calls: () => calls };
}

test("valid strokes save atomically as normal existing terrain scene items", async () => {
  const route = setupRoute();
  const points = [{ xPct: 0.2, yPct: 0.3 }, { xPct: 0.25, yPct: 0.34 }];
  const result = await route.invoke({ type: "dirt_path", size: 200, points });
  assert.equal(result.statusCode, 201);
  assert.equal(route.calls(), 1, "exactly one insert for the whole stroke");
  assert.equal(result.body.items.length, 2);
  assert.deepEqual(route.inserts(), points.map(p => ({
    ...p, kind: "terrain", effectType: "dirt_path", imageUrl: null,
    size: 200, flipped: false, layer: 0,
  })));
});

test("invalid, oversized and hostile strokes never write terrain items", async () => {
  const route = setupRoute();
  const good = { xPct: 0.25, yPct: 0.6 };
  const invalid = [
    {}, { type: "fire", size: 100, points: [good] },
    { type: "dirt_path", size: 0, points: [good] },
    { type: "dirt_path", size: 100, points: [] },
    { type: "dirt_path", size: 100, points: Array(61).fill(good) },
    { type: "dirt_path", size: 100, points: [{ xPct: 1.1, yPct: 0.4 }] },
    { type: "dirt_path", size: 100, points: [{ xPct: 0.3, yPct: NaN }] },
    { type: "dirt_path", size: 100, points: [{ xPct: "0.3", yPct: 0.4 }] },
  ];
  for (const body of invalid) assert.equal((await route.invoke(body)).statusCode, 400);
  assert.equal(route.calls(), 0);
});

test("brush only overlays the existing Pet Park viewport; camera, effects and editor stay owned by page", () => {
  const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  const brush = readFileSync("client/src/components/PetParkTerrainBrush.tsx", "utf8");
  const server = readFileSync("server/routes/petParkAdmin.routes.ts", "utf8");
  assert.match(page, /<PetParkTerrainBrush/);
  assert.match(page, /scene\?\.canEditPark/);
  assert.match(page, /onSaved=\{invalidate\}/);
  assert.match(page, /<PetParkTerrain viewportWidth=/);
  assert.match(page, /<PetAnimator petTemplateId=\{pet.petTemplateId\}/);
  assert.match(page, /<ParkEffectVisual type=\{item.effectType\}/);
  assert.match(page, /parkCameraGeometry\(viewportSize.width, viewportSize.height, groundLevel, zoom\)/);
  assert.match(brush, /event\.stopPropagation\(\)/);
  assert.match(brush, /onPointerCancel=\{cancel\}/);
  assert.match(brush, /onLostPointerCapture=\{cancel\}/);
  assert.match(brush, /onPointerUp=\{finish\}/);
  assert.match(brush, /void saveStroke\(completed\)/, "release automatically persists the stroke");
  assert.match(brush, /Retry save/);
  assert.match(brush, /Clear stroke/);
  assert.match(brush, /PARK_BRUSH_MAX_STAMPS/);
  assert.match(brush, /safeSetPointerCapture/);
  assert.match(server, /app\.post\("\/api\/admin\/pet-park\/terrain-strokes", isAdmin/);
});

test("isometric dirt paths share slanted edges and resist pointer jitter", async () => {
  const { parkExtendPathStroke, parkSnapPathPoint, parkPathGrid, parkPathPoint } = await import("../client/src/lib/petParkTerrainBrush");
  const world = { width: 1800, height: 2700 }, size = 200;
  const first = parkExtendPathStroke([], { xPct: 0.51, yPct: 0.49 }, world, size);
  assert.deepEqual(first, [{ xPct: 0.5, yPct: 0.5 }]);
  let stroke = parkExtendPathStroke(first, parkPathPoint({u:4,v:0},world,size), world, size);
  assert.equal(stroke.length, 5);
  stroke = parkExtendPathStroke(stroke, parkPathPoint({u:6,v:3},world,size), world, size);
  assert.ok(stroke.every(point => Math.abs(parkPathGrid(point,world,size).v) < 1e-8));
  for (let i=1;i<stroke.length;i++) {
    assert.ok(Math.abs((stroke[i].xPct-stroke[i-1].xPct)*world.width-size/2)<1e-7);
    assert.ok(Math.abs((stroke[i].yPct-stroke[i-1].yPct)*world.height-size/4)<1e-7);
  }
  assert.equal(parkExtendPathStroke(stroke,first[0],world,size).length,stroke.length);
  for (const point of [parkSnapPathPoint({xPct:0,yPct:0},world,size),parkSnapPathPoint({xPct:1,yPct:1},world,size)]) {
    assert.ok(point.xPct*world.width>=100-1e-7 && point.xPct*world.width<=world.width-100+1e-7);
    assert.ok(point.yPct*world.height>=50-1e-7 && point.yPct*world.height<=world.height-50+1e-7);
  }
});

test("both isometric axes obey the cap and preserve alignment on expansion", async () => {
  const { parkExtendPathStroke, parkSnapPathPoint, parkPathGrid, parkPathPoint } = await import("../client/src/lib/petParkTerrainBrush");
  const { parkExpandPoint, parkGroundSize } = await import("../shared/petParkGround");
  const world={width:5400,height:8100};
  const stroke=parkExtendPathStroke([{xPct:0.5,yPct:0.5}],parkPathPoint({u:0,v:50},world,60),world,60,12);
  assert.equal(stroke.length,12);
  assert.ok(stroke.every(p=>Math.abs(parkPathGrid(p,world,60).u)<1e-7));
  for(let level=1;level<4;level++) {
    const old=parkGroundSize(level), next=parkGroundSize(level+1);
    const p=parkSnapPathPoint({xPct:0.4,yPct:0.4},old,200);
    const expanded=parkExpandPoint(p,level,level+1), snapped=parkSnapPathPoint(expanded,next,200);
    assert.ok(Math.abs(snapped.xPct-expanded.xPct)<1e-8 && Math.abs(snapped.yPct-expanded.yPct)<1e-8);
  }
});
