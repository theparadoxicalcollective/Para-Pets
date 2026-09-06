import assert from "node:assert/strict";
import test from "node:test";
import { calculateWorldFitScale } from "../client/src/lib/worldViewport";

test("fits tall worlds to the viewport height without vertical cropping", () => {
  const frameHeight = 844;
  const mapHeight = 1980;
  const scale = calculateWorldFitScale(390, frameHeight, mapHeight, false);
  assert.equal(scale, frameHeight / mapHeight);
  assert.equal(Math.round(mapHeight * scale), frameHeight);
});

test("fits shorter worlds to the viewport height without leaving a vertical gap", () => {
  const frameHeight = 844;
  const mapHeight = 1440;
  const scale = calculateWorldFitScale(390, frameHeight, mapHeight, false);
  assert.equal(scale, frameHeight / mapHeight);
  assert.equal(Math.round(mapHeight * scale), frameHeight);
});

test("falls back safely when map height is invalid", () => {
  const scale = calculateWorldFitScale(390, 844, 0, false);
  assert.ok(Number.isFinite(scale));
  assert.ok(scale > 0);
});
