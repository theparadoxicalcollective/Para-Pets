import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, shouldUseDocumentLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const viewport = readFileSync("client/src/lib/stageViewport.ts", "utf8");

test("standalone pages use the native document shell on phones tablets and desktop", () => {
  for (const route of ["/auth", "/hub", "/privacy", "/founders", "/admin", "/forum", "/reset-password/token"]) {
    for (const width of [360, 390, 834, 1440]) {
      assert.equal(shouldUseDocumentLayout(route, width), true, route);
      const layout = calculateStageLayout(width, 800, 0, 0, { viewportSurface: true, fitPortraitReference: false });
      assert.equal(layout.coordinateOwner, "viewport");
      assert.equal(layout.scale, 1);
      assert.equal(layout.designWidth, width);
    }
    assert.equal(usesDeviceGameplaySurface(route), false);
  }
  assert.match(app, /if \(shouldUseDocumentLayout\(location, layout\.viewportWidth\)\)/);
  assert.match(viewport, /usesDeviceGameplaySurface\(pathname\) \|\| shouldUseDocumentLayout\(pathname, viewport\.width\)/);
});

test("player home visits and unknown routes are not silently reclassified", () => {
  for (const route of ["/visit/123", "/unknown-route"]) {
    assert.equal(shouldUseDocumentLayout(route, 390), false, route);
    assert.equal(usesDeviceGameplaySurface(route), false, route);
  }
});
