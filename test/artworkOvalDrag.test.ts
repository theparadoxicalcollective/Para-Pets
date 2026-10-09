import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateArtworkTransform, dragArtworkPercentOffset, artworkPercentToScreen } from "../client/src/lib/artworkViewportTransform";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("same drag on artwork moves saved oval identically on Android, tablet and desktop", () => {
  const artwork = { width: 1440, height: 2560 };
  const saved = { x: 12, y: -8, scale: 1.15 };
  for (const viewport of [
    { width: 320, height: 700 }, { width: 390, height: 844 },
    { width: 412, height: 915 }, { width: 768, height: 1024 },
    { width: 1920, height: 1080 },
  ]) {
    for (const fit of ["cover", "contain"] as const) {
      const transform = calculateArtworkTransform(artwork, viewport, fit);
      const start = artworkPercentToScreen({ x: 50, y: 60 }, transform);
      const end = artworkPercentToScreen({ x: 57, y: 64 }, transform);
      const moved = dragArtworkPercentOffset(saved, start, end, transform);
      close(moved.x, 19);
      close(moved.y, -4);
      assert.equal(moved.scale, saved.scale);
    }
  }
});

test("oval drag clamps saved offsets and ignores display scaling", () => {
  const transform = calculateArtworkTransform({ width: 1000, height: 1000 }, { width: 300, height: 700 }, "cover");
  const next = dragArtworkPercentOffset({ x: 99, y: -99 }, { x: 0, y: 0 }, { x: 900, y: -900 }, transform);
  assert.deepEqual(next, { x: 100, y: -100 });
});

test("existing oval editor uses the shared converter without adding a new placement system", () => {
  const source = readFileSync("client/src/components/PetPageOvalPlacement.tsx", "utf8");
  assert.match(source, /calculateArtworkTransform\(size, size\)/);
  assert.match(source, /dragArtworkPercentOffset\(/);
  assert.match(source, /getPetPlacementTransform\(ground, petValue, anchor\)/);
  assert.match(source, /query\.save\.mutate\(start\.latest/);
});
