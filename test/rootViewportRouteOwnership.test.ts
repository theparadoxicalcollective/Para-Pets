import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const viewport = readFileSync("client/src/lib/stageViewport.ts", "utf8");

test("native routes bypass portrait fitting before stage layout is calculated", () => {
  assert.match(viewport, /const viewportSurface = usesDeviceGameplaySurface\(pathname\) \|\| shouldUseDocumentLayout\(pathname, viewport\.width\)/);
  assert.match(viewport, /const fitPortraitReference = !viewportSurface && shouldFitPortraitReference\(/);
  assert.match(viewport, /\{ fitPortraitReference, viewportSurface \}/);
});

test("migrated routes keep native device geometry across phones, tablets and desktop", () => {
  for (const route of ["/", "/map", "/world/haunted-forest", "/pet-house", "/visit/123", "/cards", "/bag", "/pets", "/pet-level-up/123", "/pet-care/123", "/equip-accessories/123", "/raid", "/raid/battle", "/pvp"]) {
    assert.equal(usesDeviceGameplaySurface(route), true, route);
    for (const [width, height] of [[375, 667], [390, 844], [834, 1194], [1440, 900]]) {
      const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true, fitPortraitReference: false });
      assert.equal(layout.coordinateOwner, "viewport", route);
      assert.equal(layout.designWidth, width, route);
      assert.equal(layout.designHeight, height, route);
      assert.equal(layout.scale, 1, route);
      assert.equal(layout.referencePortrait, false, route);
    }
  }
});

test("unmigrated routes retain explicit legacy handling", () => {
  for (const route of ["/casino", "/bingo", "/unknown-route"]) {
    assert.equal(usesDeviceGameplaySurface(route), false, route);
  }
});
