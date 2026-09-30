import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateWorldFitScale,
  clampWorldMapOffset,
  WORLD_MAP_WIDTH,
} from "../client/src/lib/worldViewport";

const PRODUCTION_WORLD_WIDTH = 924;
const PRODUCTION_WORLD_HEIGHT = 1703;

test("production 924x1703 world clamps every edge without exposing blank space", () => {
  for (const { frameWidth, frameHeight } of [
    { frameWidth: 390, frameHeight: 844 },
    { frameWidth: 768, frameHeight: 1024 },
    { frameWidth: 1440, frameHeight: 900 },
  ]) {
    const scale = calculateWorldFitScale(
      frameWidth,
      frameHeight,
      PRODUCTION_WORLD_HEIGHT,
      false,
      PRODUCTION_WORLD_WIDTH,
    );

    const left = clampWorldMapOffset(
      -99999,
      0,
      scale,
      frameWidth,
      frameHeight,
      PRODUCTION_WORLD_HEIGHT,
      PRODUCTION_WORLD_WIDTH,
    );
    const right = clampWorldMapOffset(
      99999,
      0,
      scale,
      frameWidth,
      frameHeight,
      PRODUCTION_WORLD_HEIGHT,
      PRODUCTION_WORLD_WIDTH,
    );
    const top = clampWorldMapOffset(
      0,
      99999,
      scale,
      frameWidth,
      frameHeight,
      PRODUCTION_WORLD_HEIGHT,
      PRODUCTION_WORLD_WIDTH,
    );
    const bottom = clampWorldMapOffset(
      0,
      -99999,
      scale,
      frameWidth,
      frameHeight,
      PRODUCTION_WORLD_HEIGHT,
      PRODUCTION_WORLD_WIDTH,
    );

    const renderedWidth = PRODUCTION_WORLD_WIDTH * scale;
    const renderedHeight = PRODUCTION_WORLD_HEIGHT * scale;

    assert.equal(right.x, renderedWidth <= frameWidth ? (frameWidth - renderedWidth) / 2 : 0);
    assert.ok(
      renderedWidth <= frameWidth
        ? Math.abs(left.x - (frameWidth - renderedWidth) / 2) < 0.000001
        : Math.abs(left.x + renderedWidth - frameWidth) < 0.000001,
    );
    assert.equal(top.y, renderedHeight <= frameHeight ? (frameHeight - renderedHeight) / 2 : 0);
    assert.ok(
      renderedHeight <= frameHeight
        ? Math.abs(bottom.y - (frameHeight - renderedHeight) / 2) < 0.000001
        : Math.abs(bottom.y + renderedHeight - frameHeight) < 0.000001,
    );
  }
});

test("rendered map width controls fit instead of the legacy 1080px fallback", () => {
  const frameWidth = 390;
  const frameHeight = 844;

  const productionScale = calculateWorldFitScale(
    frameWidth,
    frameHeight,
    PRODUCTION_WORLD_HEIGHT,
    false,
    PRODUCTION_WORLD_WIDTH,
  );
  const legacyScale = calculateWorldFitScale(
    frameWidth,
    frameHeight,
    PRODUCTION_WORLD_HEIGHT,
    false,
    WORLD_MAP_WIDTH,
  );

  assert.equal(productionScale, Math.max(
    frameWidth / PRODUCTION_WORLD_WIDTH,
    frameHeight / PRODUCTION_WORLD_HEIGHT,
  ));
  assert.equal(legacyScale, Math.max(
    frameWidth / WORLD_MAP_WIDTH,
    frameHeight / PRODUCTION_WORLD_HEIGHT,
  ));
});

test("production build width flows through WorldPage into both fit and clamp helpers", () => {
  const source = readFileSync("client/src/pages/WorldPage.tsx", "utf8");
  const vite = readFileSync("vite.config.ts", "utf8");

  assert.ok(vite.includes("const WORLD_MAP_DESIGN_W = 924;"));
  assert.ok(vite.includes("/const MAP_W = WORLD_MAP_WIDTH;/"));
  assert.ok(vite.includes("const MAP_W = ${WORLD_MAP_DESIGN_W};"));

  assert.match(
    source,
    /clampWorldMapOffset\(x, y, sc, frameWRef\.current, frameHRef\.current, mapHRef\.current, MAP_W\)/,
  );

  const fitCalls = source.match(
    /calculateWorldFitScale\(frameWRef\.current, frameHRef\.current, mapHRef\.current, fitFullComposition, MAP_W\)/g,
  ) ?? [];
  assert.equal(fitCalls.length, 2);
});

test("viewport helpers keep backward-compatible defaults for non-WorldPage callers", () => {
  const frameWidth = 390;
  const frameHeight = 844;
  const mapHeight = 1440;
  const scale = calculateWorldFitScale(frameWidth, frameHeight, mapHeight, false);
  const edge = clampWorldMapOffset(
    -99999,
    0,
    scale,
    frameWidth,
    frameHeight,
    mapHeight,
  );

  assert.ok(Math.abs(edge.x + WORLD_MAP_WIDTH * scale - frameWidth) < 0.000001);
});
