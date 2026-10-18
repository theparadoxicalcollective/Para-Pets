import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const world = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
const fish = readFileSync("client/src/pages/SellFishPage.tsx", "utf8");

test("world persistent map HUD is absent while a foreground page is open", () => {
  assert.match(world, /worldMapCameraBlocked = Boolean\([\s\S]*?showSellFish/);
  assert.match(world, /\{!worldMapCameraBlocked && \(\s*<div data-testid="world-map-only-controls"/);
  assert.match(world, /data-testid="button-back-to-map"/);
});

test("fish market owns pointer input without blocking its own controls", () => {
  assert.match(fish, /data-testid="sell-fish-blocking-page"/);
  assert.match(fish, /pointerEvents: "auto"/);
  assert.match(fish, /onPointerDown=\{event => event\.stopPropagation\(\)\}/);
  assert.match(fish, /onPointerMove=\{event => event\.stopPropagation\(\)\}/);
  assert.match(fish, /onPointerUp=\{event => event\.stopPropagation\(\)\}/);
});
