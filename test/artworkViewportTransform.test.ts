import assert from "node:assert/strict";
import test from "node:test";
import {
  artworkPercentToPoint,
  artworkPercentToScreen,
  artworkPointToPercent,
  artworkPointToScreen,
  artworkRectToScreen,
  calculateArtworkTransform,
  screenPointToArtwork,
  screenPointToArtworkPercent,
} from "../client/src/lib/artworkViewportTransform";

const artwork = { width: 1440, height: 2560 };
const oval = { x: 50, y: 67.5 };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("admin oval stays attached to same background pixel on Android, iPhone, tablet and PC", () => {
  const original = artworkPercentToPoint(oval, artwork);
  for (const viewport of [
    { width: 320, height: 700 }, { width: 360, height: 800 },
    { width: 390, height: 844 }, { width: 412, height: 915 },
    { width: 768, height: 1024 }, { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    for (const fit of ["contain", "cover"] as const) {
      const transform = calculateArtworkTransform(artwork, viewport, fit);
      const screen = artworkPercentToScreen(oval, transform);
      const recovered = screenPointToArtwork(screen, transform);
      close(recovered.x, original.x);
      close(recovered.y, original.y);
      const restored = screenPointToArtworkPercent(screen, transform);
      close(restored.x, oval.x);
      close(restored.y, oval.y);
    }
  }
});

test("background crop and letterbox offsets also apply to foreground objects", () => {
  const crop = calculateArtworkTransform({ width: 1000, height: 1000 }, { width: 400, height: 800 }, "cover");
  assert.equal(crop.scale, 0.8);
  assert.equal(crop.left, -200);
  assert.equal(crop.top, 0);
  assert.deepEqual(artworkPointToScreen({ x: 500, y: 500 }, crop), { x: 200, y: 400 });
  assert.deepEqual(artworkRectToScreen({ x: 400, y: 450, width: 200, height: 100 }, crop),
    { x: 120, y: 360, width: 160, height: 80 });
  const contain = calculateArtworkTransform({ width: 1000, height: 1000 }, { width: 400, height: 800 });
  assert.equal(contain.top, 200);
  assert.equal(contain.left, 0);
});

test("preserves signed existing admin offsets and supports rectangular artwork", () => {
  const size = { width: 2000, height: 1200 };
  const point = { x: -12, y: 125 };
  assert.deepEqual(artworkPointToPercent(artworkPercentToPoint(point, size), size), point);
  const transform = calculateArtworkTransform(size, { width: 600, height: 900 }, "cover");
  const screen = artworkPercentToScreen(point, transform);
  const restored = screenPointToArtworkPercent(screen, transform);
  close(restored.x, point.x);
  close(restored.y, point.y);
});

test("rejects invalid geometry rather than storing corrupted admin positions", () => {
  assert.throws(() => calculateArtworkTransform({ width: 0, height: 100 }, { width: 300, height: 400 }), RangeError);
  assert.throws(() => calculateArtworkTransform(artwork, { width: NaN, height: 400 }), RangeError);
});
