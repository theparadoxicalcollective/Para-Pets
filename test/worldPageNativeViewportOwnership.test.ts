import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const world = readFileSync("client/src/pages/WorldPage.tsx", "utf8");

test("individual world pages own the real device viewport, not 390x844", () => {
  for (const route of ["/world/haunted_woods", "/world/elysian_bayou", "/world/example"]) {
    assert.equal(usesDeviceGameplaySurface(route), true);
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: usesDeviceGameplaySurface(route) });
      assert.equal(layout.coordinateOwner, "viewport");
      assert.equal(layout.designWidth, width);
      assert.equal(layout.designHeight, height);
      assert.equal(layout.scale, 1);
    }
  }
  assert.match(app, /location\.startsWith\("\/world\/"\) && \(\s*<StagePageSurface key=\{location\} layout="viewport">/);
});

test("world camera remains viewport-owned and admin placement stays in world scene", () => {
  assert.match(world, /<ViewportScenePortal enabled=\{!worldMapCameraBlocked\}>/);
  assert.match(world, /data-testid="world-expanded-camera"/);
  assert.match(world, /data-quest-guide-pan-surface/);
  assert.match(world, /WORLD_MAP_HEIGHT/);
  assert.match(world, /WORLD_MAP_WIDTH/);
});
