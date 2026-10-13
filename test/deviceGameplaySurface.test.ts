import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateStageLayout, usesDeviceGameplaySurface, logicalToRendered, renderedToLogical, getStageTransform, getStageScale, clientToStage, clientPointInRenderedElement } from "../client/src/lib/stage";

test("only migrated gameplay routes opt into device ownership", () => {
  assert.equal(usesDeviceGameplaySurface("/"), true);
  assert.equal(usesDeviceGameplaySurface("/bag"), true);
  assert.equal(usesDeviceGameplaySurface("/pets"), true);
  assert.equal(usesDeviceGameplaySurface("/pet-care/pet-1"), true);
  assert.equal(usesDeviceGameplaySurface("/equip-accessories"), true);
  assert.equal(usesDeviceGameplaySurface("/equip-accessories/pet-1"), true);
  assert.equal(usesDeviceGameplaySurface("/pet-level-up/pet-1"), true);
  assert.equal(usesDeviceGameplaySurface("/world/swamp"), true);
  assert.equal(usesDeviceGameplaySurface("/pet-house"), true);
  for (const route of ["/pets/other", "/pet-care/", "/pet-care/1/extra", "/pet-level-up/", "/pet-level-up/1/extra", "/equip-accessories/", "/equip-accessories/1/extra", "/bag/other"]) {
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

test("Pets uses a device-sized surface while portrait artwork keeps local coordinates", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  try {
    for (const [width, height] of [[320, 568], [390, 844], [412, 915], [834, 1194], [1440, 900], [412, 470]]) {
      const layout = calculateStageLayout(width, height, 37, 5, {
        viewportSurface: usesDeviceGameplaySurface("/pets"), fitPortraitReference: true,
      });
      const rect = { left: layout.left, top: layout.top, width: layout.renderedWidth, height: layout.renderedHeight };
      const stage = { dataset: { designWidth: String(layout.designWidth) }, getBoundingClientRect: () => rect };
      const content = { getBoundingClientRect: () => rect };
      Object.defineProperty(globalThis, "document", { configurable: true, value: {
        getElementById: (id: string) => id === "game-stage" ? stage : id === "game-stage-content" ? content : null,
      } });
      assert.equal(getStageScale(), 1);
      assert.deepEqual(clientToStage(rect.left + width - 12, rect.top + height - 16), { x: width - 12, y: height - 16 });
      // A 140px portrait has a separate 1000px artwork space, independent of UI width.
      const portrait = { left: rect.left + 16, top: rect.top + 100, width: 140, height: 140 };
      assert.deepEqual(clientPointInRenderedElement(portrait, portrait.left + 70, portrait.top + 70, 1000, 1000), { x: 500, y: 500 });
    }
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("both inventory route surfaces opt out of the legacy reference wrapper", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  for (const route of ["/bag", "/pets"]) {
    const start = app.indexOf(`location === "${route}"`);
    assert.ok(start >= 0);
    assert.match(app.slice(start, start + 160), /<StagePageSurface layout="viewport">/);
  }
});
