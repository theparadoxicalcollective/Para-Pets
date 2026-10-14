import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateStageLayout,
  DESIGN_H,
  DESIGN_W,
  getStageTransform,
  logicalToRendered,
  renderedToLogical,
  shouldFitPortraitReference,
} from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

test("the iPhone 12 reference remains native in portrait Safari and PWA heights", () => {
  for (const height of [844, 800, 760, 700, 420]) {
    assert.equal(shouldFitPortraitReference(390, height, true, height === 420), false);
    const layout = calculateStageLayout(390, height);
    assert.equal(layout.scale, 1);
    assert.equal(layout.designWidth, 390);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(getStageTransform(layout), undefined);
  }
});

test("portrait touch phones and tablets opt into the 390x844 reference composition", () => {
  const viewports = [
    [360, 740],
    [360, 800],
    [375, 812],
    [393, 852],
    [393, 873],
    [412, 915],
    [430, 932],
    [768, 1024],
    [800, 1280],
    [834, 1194],
    [1024, 1366],
  ] as const;

  for (const [width, height] of viewports) {
    assert.equal(shouldFitPortraitReference(width, height, true, false), true);
    const layout = calculateStageLayout(width, height, 0, 0, { fitPortraitReference: true });
    assert.equal(layout.designWidth, DESIGN_W);
    assert.equal(layout.designHeight, DESIGN_H);
    assert.equal(layout.coordinateOwner, "stage");
    assert.equal(layout.referencePortrait, true);
    assert.ok(layout.renderedWidth <= width + 1e-9);
    assert.ok(layout.renderedHeight <= height + 1e-9);
    assert.ok(Math.abs(layout.left + layout.renderedWidth / 2 - width / 2) < 1e-9);
    assert.ok(Math.abs(layout.top + layout.renderedHeight / 2 - height / 2) < 1e-9);

    const logical = { x: 247, y: 611 };
    const client = logicalToRendered(layout, logical.x, logical.y);
    const roundTrip = renderedToLogical(layout, client.x, client.y);
    assert.ok(Math.abs(roundTrip.x - logical.x) < 1e-9);
    assert.ok(Math.abs(roundTrip.y - logical.y) < 1e-9);
  }
});

test("smaller and larger portrait phones uniformly scale instead of reflowing the logical canvas", () => {
  const small = calculateStageLayout(360, 740, 0, 0, { fitPortraitReference: true });
  const large = calculateStageLayout(430, 932, 0, 0, { fitPortraitReference: true });

  assert.ok(small.scale < 1);
  assert.ok(large.scale > 1);
  assert.equal(small.designWidth, 390);
  assert.equal(small.designHeight, 844);
  assert.equal(large.designWidth, 390);
  assert.equal(large.designHeight, 844);
  assert.ok(Math.abs(small.renderedWidth / small.renderedHeight - 390 / 844) < 1e-12);
  assert.ok(Math.abs(large.renderedWidth / large.renderedHeight - 390 / 844) < 1e-12);
});

test("portrait fitting is touch-first only and does not activate during keyboard or landscape", () => {
  assert.equal(shouldFitPortraitReference(393, 852, false, false), false, "desktop/non-touch stays on desktop policy");
  assert.equal(shouldFitPortraitReference(393, 420, true, true), false, "software keyboard keeps the usable viewport native");
  assert.equal(shouldFitPortraitReference(844, 390, true, false), false, "touch landscape is unchanged");
  assert.equal(shouldFitPortraitReference(1024, 768, true, false), false, "tablet landscape is unchanged");
});

test("desktop geometry remains on its existing comfortable centered presentation", () => {
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]] as const) {
    const layout = calculateStageLayout(width, height);
    assert.equal(layout.referencePortrait, false);
    assert.equal(layout.coordinateOwner, "stage");
    assert.equal(layout.designWidth, 390);
    assert.equal(layout.designHeight, 844);
    assert.ok(layout.scale > 0);
    assert.ok(layout.renderedWidth <= width);
    assert.ok(layout.renderedHeight <= height);
  }
});

test("runtime viewport controller applies portrait fitting only after touch/orientation/keyboard classification", () => {
  const viewport = read("client/src/lib/stageViewport.ts");
  const stage = read("client/src/lib/stage.ts");

  assert.match(viewport, /isTouchFirstDevice\(\)/);
  assert.match(viewport, /shouldFitPortraitReference\(/);
  assert.match(viewport, /viewport\.keyboardReduced/);
  assert.match(viewport, /const viewportSurface = usesDeviceGameplaySurface\(pathname\) \|\| shouldUseDocumentLayout\(pathname, viewport\.width\)/);
  assert.match(viewport, /const fitPortraitReference = !viewportSurface && shouldFitPortraitReference\(/);
  assert.match(viewport, /\{ fitPortraitReference, viewportSurface \}/);
  assert.match(stage, /navigator\.maxTouchPoints/);
  assert.match(stage, /\(pointer: coarse\)/);
  assert.match(stage, /\(hover: none\)/);
});

test("rendered stages expose coordinate ownership so portals follow scaled portrait phones", () => {
  const app = read("client/src/App.tsx");
  const root = read("client/src/RootEntry.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(app, /data-coordinate-owner=\{layout\.coordinateOwner\}/);
  assert.match(root, /data-coordinate-owner="viewport"/);
  assert.doesNotMatch(root, /data-coordinate-owner=\{layout\.coordinateOwner\}/);
  assert.match(app, /data-reference-portrait=\{layout\.referencePortrait \? "true" : "false"\}/);
  assert.match(stage, /stage\?\.dataset\.coordinateOwner === "stage"/);
  assert.match(stage, /getStagePortalTarget\(\) === document\.body/);
});

test("Pet Home keeps authored placements while player cameras measure actual artwork scene", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const homeViewport = read("client/src/lib/homeCrossDevice.ts");

  assert.match(owner, /clientDeltaToStage/);
  assert.match(owner, /homeCameraDropToPlacement/);
  assert.match(owner, /HOME_INVENTORY_DROP_BOUNDS/);
  assert.doesNotMatch(owner, /clientPointInStageElement/);
  assert.match(owner, /left: inventoryDragState\.ghostX - 65, top: inventoryDragState\.ghostY - 65/);
  assert.match(owner, /left: petInvDragState\.ghostX - 60, top: petInvDragState\.ghostY - 60/);
  assert.match(visitor, /homeCameraPointerDeltaX\(e\.clientX - drag\.startX, container\)/);
  assert.match(homeViewport, /const surface = sizing === "legacy-admin" \? getStageSurface\(\) : null/);
  assert.match(homeViewport, /surface\?\.logicalHeight/);
});
