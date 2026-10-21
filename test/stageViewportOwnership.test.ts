import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateStageLayout,
  DESIGN_H,
  DESIGN_W,
  getStageTransform,
} from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");

test("iPhone 12 remains the exact native stage baseline", () => {
  const layout = calculateStageLayout(DESIGN_W, DESIGN_H);
  assert.equal(DESIGN_W, 390);
  assert.equal(DESIGN_H, 844);
  assert.equal(layout.designWidth, 390);
  assert.equal(layout.designHeight, 844);
  assert.equal(layout.viewportWidth, 390);
  assert.equal(layout.viewportHeight, 844);
  assert.equal(layout.scale, 1);
  assert.equal(layout.renderedWidth, 390);
  assert.equal(layout.renderedHeight, 844);
  assert.equal(layout.left, 0);
  assert.equal(layout.top, 0);
  assert.equal(getStageTransform(layout), undefined);
});

test("one shared module owns gameplay viewport measurement and lifecycle observation", () => {
  const viewport = read("client/src/lib/stageViewport.ts");

  assert.match(viewport, /getVisibleViewport\(\)/);
  assert.match(viewport, /calculateStageLayout\(/);
  assert.match(viewport, /window\.addEventListener\("resize", scheduleUpdate\)/);
  assert.match(viewport, /window\.addEventListener\("orientationchange", scheduleUpdate\)/);
  assert.match(viewport, /window\.addEventListener\("pageshow", scheduleUpdate\)/);
  assert.match(viewport, /document\.addEventListener\("visibilitychange", scheduleUpdate\)/);
  assert.match(viewport, /window\.visualViewport\?\.addEventListener\("resize", scheduleUpdate\)/);
  assert.match(viewport, /window\.visualViewport\?\.addEventListener\("scroll", scheduleUpdate\)/);
  assert.match(viewport, /requestAnimationFrame\(update\)/);
});

test("App and root auth stages consume the shared viewport controller instead of duplicating it", () => {
  const app = read("client/src/App.tsx");
  const root = read("client/src/RootEntry.tsx");

  for (const source of [app, root]) {
    assert.match(source, /useStageViewportLayout\((?:location|"\/"|"\/auth")?\)/);
    assert.doesNotMatch(source, /calculateStageLayout/);
    assert.doesNotMatch(source, /getVisibleViewport/);
    assert.doesNotMatch(source, /--stage-scale/);
    assert.doesNotMatch(source, /--stage-logical-width/);
    assert.doesNotMatch(source, /--stage-logical-height/);
  }

  assert.doesNotMatch(app, /getStageTransform\(layout\)/);
  assert.match(app, /data-coordinate-owner="viewport"/);
  assert.match(root, /data-coordinate-owner="viewport"/);
  assert.doesNotMatch(root, /getStageTransform\(layout\)/);
});

test("shared publisher preserves the existing root viewport variable meanings", () => {
  const viewport = read("client/src/lib/stageViewport.ts");

  assert.ok(viewport.includes('root.setProperty("--stage-scale", String(layout.scale))'));
  assert.ok(viewport.includes('root.setProperty("--viewport-height"'));
  assert.ok(viewport.includes('root.setProperty("--viewport-width"'));
  assert.ok(viewport.includes('root.setProperty("--fh"'));
  assert.ok(viewport.includes('root.setProperty("--vh"'));
  assert.ok(viewport.includes('root.setProperty("--vw"'));
  assert.ok(viewport.includes('root.setProperty("--stage-logical-width"'));
  assert.ok(viewport.includes('root.setProperty("--stage-logical-height"'));
});

test("document app height keeps its established innerHeight behavior but is centrally owned", () => {
  const viewport = read("client/src/lib/stageViewport.ts");
  const main = read("client/src/main.tsx");

  assert.match(viewport, /--app-height/);
  assert.match(viewport, /window\.innerHeight/);
  assert.match(viewport, /window\.addEventListener\("resize", syncAppHeight\)/);
  assert.match(main, /installAppHeightSync\(\)/);
  assert.doesNotMatch(main, /window\.innerHeight/);
  assert.doesNotMatch(main, /--app-height/);
});

test("this foundation PR keeps current phone tablet and desktop geometry unchanged", () => {
  const cases = [
    [360, 760],
    [390, 844],
    [412, 915],
    [768, 1024],
    [834, 1194],
    [1440, 900],
  ] as const;

  const expected = [
    { designWidth: 360, designHeight: 760, scale: 1, left: 0, top: 0 },
    { designWidth: 390, designHeight: 844, scale: 1, left: 0, top: 0 },
    { designWidth: 390, designHeight: 915, scale: 1, left: 11, top: 0 },
    { designWidth: 390, designHeight: 844, scale: 1024 / 844, left: (768 - 390 * (1024 / 844)) / 2, top: 0 },
    { designWidth: 390, designHeight: 844, scale: 1194 / 844, left: (834 - 390 * (1194 / 844)) / 2, top: 0 },
    { designWidth: 390, designHeight: 844, scale: 900 / 844, left: (1440 - 390 * (900 / 844)) / 2, top: 0 },
  ];

  cases.forEach(([width, height], index) => {
    const layout = calculateStageLayout(width, height);
    const target = expected[index];
    assert.equal(layout.designWidth, target.designWidth);
    assert.equal(layout.designHeight, target.designHeight);
    assert.ok(Math.abs(layout.scale - target.scale) < 1e-12);
    assert.ok(Math.abs(layout.left - target.left) < 1e-9);
    assert.ok(Math.abs(layout.top - target.top) < 1e-9);
  });
});


test("root gameplay never opts back into the legacy 390 by 844 reference stage", () => {
  const controller = read("client/src/lib/stageViewport.ts");
  const app = read("client/src/App.tsx");
  const root = read("client/src/RootEntry.tsx");
  assert.match(controller, /const viewportSurface = true;/);
  assert.match(controller, /calculateStageLayout\([\s\S]*?\{ viewportSurface \}/);
  for (const source of [app, root]) {
    assert.match(source, /useStageViewportLayout\(/);
    assert.doesNotMatch(source, /fitPortraitReference\s*:/);
    assert.doesNotMatch(source, /calculateMiniGamePage\(/);
  }
});

test("desktop portrait presentation does not introduce a scaled reference stage", () => {
  const controller = read("client/src/lib/stageViewport.ts");
  assert.match(controller, /if \(touchFirst \|\| !usesDeviceGameplaySurface\(pathname\)/);
  assert.match(controller, /layout\.viewportWidth < 1024 \|\| layout\.viewportWidth <= layout\.viewportHeight/);
  assert.match(controller, /Math\.round\(layout\.viewportHeight \* 0\.72\)/);
  assert.match(controller, /coordinateOwner: "viewport"/);
  assert.match(controller, /referencePortrait: false/);
  assert.match(controller, /scale: 1/);
});
