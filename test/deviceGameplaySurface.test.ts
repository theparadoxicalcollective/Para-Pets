import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateStageLayout, usesDeviceGameplaySurface, logicalToRendered, renderedToLogical, getStageTransform } from "../client/src/lib/stage";

test("only audited Bag gameplay opts into device ownership", () => {
  assert.equal(usesDeviceGameplaySurface("/bag"), true);
  for (const route of ["/", "/pets", "/pet-house", "/world/swamp", "/pet-care/1", "/pet-level-up/1", "/equip-accessories", "/bag/other"]) {
    assert.equal(usesDeviceGameplaySurface(route), false);
  }
});

test("device gameplay uses the full viewport even when legacy portrait fitting is requested", () => {
  for (const [width, height] of [[320, 568], [390, 844], [412, 915], [768, 1024], [834, 1194], [1440, 900], [412, 470]]) {
    const layout = calculateStageLayout(width, height, 37, 5, { viewportSurface: true, fitPortraitReference: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.referencePortrait, false);
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.renderedWidth, width);
    assert.equal(layout.renderedHeight, height);
    assert.equal(layout.scale, 1);
    assert.equal(layout.left, 5);
    assert.equal(layout.top, 37);
    assert.equal(getStageTransform(layout), undefined);
    const point = logicalToRendered(layout, width - 1, height - 1);
    assert.deepEqual(renderedToLogical(layout, point.x, point.y), { x: width - 1, y: height - 1 });
  }
});

test("device gameplay has no reference wrapper and preserves modal stacking", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const device = app.slice(app.indexOf('if (usesDeviceGameplaySurface(location))'), app.indexOf('// Public entry and authentication'));
  assert.doesNotMatch(device, /reference-plane|scale\(/);
  assert.match(device, /data-coordinate-owner="viewport"/);
  assert.match(device, /id="game-viewport-hud"/);
  assert.match(device, /zIndex: 40/);
  const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
  assert.match(surface, /const fullViewport = layout === "viewport";/);
});
