import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale } from "../client/src/lib/worldViewport";

const MAP_W = 924;
const MAP_H = 1703;

test("world maps contain the entire fixed composition inside the viewport", () => {
  const cases = [
    { frameW: 390, frameH: 844 },
    { frameW: 768, frameH: 1024 },
    { frameW: 1440, frameH: 900 },
  ];

  for (const { frameW, frameH } of cases) {
    const scale = calculateWorldFitScale(frameW, frameH, MAP_H, false);
    assert.equal(scale, Math.min(frameW / MAP_W, frameH / MAP_H));
    assert.ok(MAP_W * scale <= frameW + 0.000001);
    assert.ok(MAP_H * scale <= frameH + 0.000001);
  }
});

test("narrower widths reduce scale instead of creating horizontal overflow", () => {
  const narrow = calculateWorldFitScale(390, 844, MAP_H, false);
  const wide = calculateWorldFitScale(1200, 844, MAP_H, false);
  assert.ok(narrow < wide);
  assert.ok(MAP_W * narrow <= 390 + 0.000001);
});

test("legacy map-height argument no longer changes fixed canvas sizing", () => {
  const oldShort = calculateWorldFitScale(390, 844, 1440, false);
  const oldTall = calculateWorldFitScale(390, 844, 2400, false);
  assert.equal(oldShort, oldTall);
});

test("invalid viewport dimensions fail safely", () => {
  assert.equal(calculateWorldFitScale(0, 844, MAP_H, false), 1);
  assert.equal(calculateWorldFitScale(390, 0, MAP_H, false), 1);
});
