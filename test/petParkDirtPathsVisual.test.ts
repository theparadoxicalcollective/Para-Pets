import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirtPatchWorldRect, paintDirtPaths } from "../client/src/components/PetParkTerrain";
import { parkCameraGeometry, parkClampCamera } from "../client/src/lib/petParkCamera";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const painter = readFileSync("client/src/components/PetParkTerrain.tsx", "utf8");
const preview = readFileSync("client/src/components/PetParkTerrainDetail.tsx", "utf8");

test("all saved dirt patches preserve their world positions and square-ended ground footprints", () => {
  const point = { xPct: 0.38, yPct: 0.61, size: 200 };
  for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) {
    for (const level of [1, 2, 3, 4]) {
      const g = parkCameraGeometry(width, height, level);
      const rect = dirtPatchWorldRect(point, g.worldWidth, g.worldHeight);
      assert.ok(Math.abs(rect.x + rect.width / 2 - point.xPct * g.worldWidth) < 1e-8);
      assert.ok(Math.abs(rect.y + rect.height / 2 - point.yPct * g.worldHeight) < 1e-8);
      assert.equal(rect.width, 200);
      assert.equal(rect.height, 108);
    }
  }
});

test("adjoining saved dirt tiles are one opaque painted shape, not separate translucent circles", () => {
  const trace: Array<string | { rect: number[] }> = [];
  const ctx = {
    save() { trace.push("save"); },
    restore() { trace.push("restore"); },
    translate() {}, scale() {},
    beginPath() { trace.push("begin"); },
    rect(...values: number[]) { trace.push({ rect: values }); },
    clip() { trace.push("clip"); },
    fill() { trace.push("fill"); },
    ellipse() {},
    fillStyle: "", shadowColor: "", shadowBlur: 0,
  } as unknown as CanvasRenderingContext2D;
  const view = { viewportWidth: 600, viewportHeight: 800,
    worldWidth: 1200, worldHeight: 1600, scale: 1, panX: -300, panY: -400 };
  const first = { xPct: 0.4, yPct: 0.5, size: 200 };
  const second = { xPct: 0.45, yPct: 0.5, size: 200 };
  paintDirtPaths(ctx, view, [first, second]);
  const expected = [dirtPatchWorldRect(first, 1200, 1600), dirtPatchWorldRect(second, 1200, 1600)];
  const rects = trace.filter((x): x is { rect: number[] } => typeof x !== "string" && "rect" in x);
  assert.deepEqual(rects.slice(1, 3).map(x => x.rect), expected.map(r => [r.x, r.y, r.width, r.height]));
  const firstFill = trace.indexOf("fill");
  const lastRect = trace.findIndex((x, i) => i > 1 && typeof x !== "string" && x.rect[0] === expected[1].x);
  assert.ok(firstFill > lastRect, "both tiles enter one common path before the base fill");
  assert.ok(trace.indexOf("clip", firstFill) > firstFill, "world-anchored dirt grain is clipped to the merged fill");
  assert.ok(trace.includes("restore"));
});

test("editing and brush previews use the same path stamps without introducing a new hit-test surface", () => {
  assert.match(page, /dirtPatches=\{dirtPatches\}/);
  assert.match(page, /item\.effectType === "dirt_path" \? null/);
  assert.match(page, /startPlacement\(e, "item", item\)/);
  assert.match(page, /placementSave\.mutate/);
  assert.match(page, /onWheel=\{e =>/);
  assert.match(painter, /ctx\.rect\(rect\.x, rect\.y, rect\.width, rect\.height\)/);
  assert.match(painter, /ctx\.fillStyle = "#846d4e"/);
  assert.match(preview, /rounded-\[3%\]/);
  assert.doesNotMatch(preview, /radial-gradient\(ellipse at 52% 50%/);
});
