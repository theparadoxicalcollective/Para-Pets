import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale } from "../client/src/lib/worldViewport";

test("world maps always fit their full height to the viewport", () => {
  const cases = [
    { frameW: 390, frameH: 844, mapH: 1990 },
    { frameW: 768, frameH: 1024, mapH: 1980 },
    { frameW: 1440, frameH: 900, mapH: 1440 },
  ];

  for (const { frameW, frameH, mapH } of cases) {
    const scale = calculateWorldFitScale(frameW, frameH, mapH, false);
    assert.equal(scale, frameH / mapH);
    assert.ok(Math.abs(mapH * scale - frameH) < 0.000001);
  }
});

test("width no longer changes world zoom level", () => {
  const narrow = calculateWorldFitScale(390, 844, 1990, false);
  const wide = calculateWorldFitScale(1200, 844, 1990, false);
  assert.equal(narrow, wide);
});

test("invalid dimensions fail safely", () => {
  assert.equal(calculateWorldFitScale(390, 0, 1990, false), 1);
  assert.equal(calculateWorldFitScale(390, 844, 0, false), 1);
});
