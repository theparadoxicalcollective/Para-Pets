import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale } from "../client/src/lib/worldViewport";

const MAP_W = 924;
const MAP_H = 1703;

test("phone browser fits the entire 924x1703 world composition", () => {
  const frameW = 390;
  const frameH = 760;
  const scale = calculateWorldFitScale(frameW, frameH, MAP_H, true);
  assert.equal(scale, Math.min(frameW / MAP_W, frameH / MAP_H));
  assert.ok(MAP_W * scale <= frameW + 0.000001);
  assert.ok(MAP_H * scale <= frameH + 0.000001);
});

test("standalone portrait view cannot overflow horizontally or vertically", () => {
  const frameW = 390;
  const frameH = 844;
  const scale = calculateWorldFitScale(frameW, frameH, MAP_H, false);
  assert.ok(MAP_W * scale <= frameW + 0.000001);
  assert.ok(MAP_H * scale <= frameH + 0.000001);
});

test("browser display mode does not change fixed world fit", () => {
  const browser = calculateWorldFitScale(390, 760, MAP_H, true);
  const installed = calculateWorldFitScale(390, 760, MAP_H, false);
  assert.equal(browser, installed);
});
