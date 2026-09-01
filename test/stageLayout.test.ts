import assert from "node:assert/strict";
import test from "node:test";
import { calculateStageLayout, clientToPortalPoint, DESIGN_H, DESIGN_W, getStageTransform, logicalToRendered, MAX_STAGE_SCALE, renderedToLogical, resolveMobileBrowserHeight } from "../client/src/lib/stage";

test("iPhone 12 retains 390 by 844 geometry at scale one", () => {
  const s = calculateStageLayout(390, 844);
  assert.equal(s.scale, 1);
  assert.equal(s.left, 0);
  assert.equal(s.top, 0);
  assert.equal(getStageTransform(s), "scale(1)");
});

test("short phone scrolls the missing height instead of rearranging the scene", () => {
  const s = calculateStageLayout(390, 760);
  assert.equal(s.designHeight, 844);
  assert.equal(s.scale, 1);
  assert.equal(s.renderedHeight - s.viewportHeight, 84);
  assert.equal(s.top, 0);
});

test("narrow phones scale both axes equally and wider phones can enlarge the game", () => {
  assert.equal(calculateStageLayout(360, 760).scale, 360 / 390);
  assert.equal(calculateStageLayout(430, 932).scale, 430 / 390);
});

test("short desktop windows scroll without reducing controls below native size", () => {
  const s = calculateStageLayout(1280, 600);
  assert.equal(s.scale, 1);
  assert.equal(s.top, 0);
  assert.equal(s.renderedHeight, 844);
});

test("ordinary tablet and desktop viewports retain the previous uniform fit", () => {
  for (const [w, h] of [[768, 1024], [1440, 900], [1920, 1080]]) {
    const s = calculateStageLayout(w, h);
    assert.equal(s.scale, Math.min(w / 390, h / 844, 1.5));
    assert.ok(Math.abs(s.left + s.renderedWidth / 2 - w / 2) < 1e-9);
    assert.ok(Math.abs(s.top + s.renderedHeight / 2 - h / 2) < 1e-9);
  }
});

for (const [w, h] of [[320,568],[360,760],[375,812],[390,844],[393,852],[412,915],[430,932],[768,1024],[800,1280],[1024,768],[1280,720],[1920,1080],[2560,1440]]) {
  test(`${w}x${h} preserves authored coordinates, horizontal fit, and pointer round trips`, () => {
    const s = calculateStageLayout(w, h, 7, 3);
    assert.equal(s.designWidth, DESIGN_W);
    assert.equal(s.designHeight, DESIGN_H);
    assert.ok(s.renderedWidth <= w + 1e-9);
    assert.ok(s.scale <= MAX_STAGE_SCALE);
    assert.equal(s.viewportTop, 7);
    assert.equal(s.viewportLeft, 3);
    for (const y of [0, 400, 843]) {
      const p = logicalToRendered(s, 100, y);
      assert.ok(Math.abs(renderedToLogical(s, p.x, p.y).y - y) < 1e-9);
      assert.ok(Math.abs(clientToPortalPoint(s, p.x, p.y).x - 100) < 1e-9);
    }
  });
}

test("keyboard changes visible space without resizing the composition or its controls", () => {
  const normal = calculateStageLayout(390, 844);
  const keyboard = calculateStageLayout(390, 420, 20);
  assert.equal(keyboard.designHeight, normal.designHeight);
  assert.equal(keyboard.scale, normal.scale);
  assert.equal(keyboard.top, 20);
});

test("browser toolbar and keyboard detection remain unchanged", () => {
  assert.equal(resolveMobileBrowserHeight(667, 564), 667);
  assert.equal(resolveMobileBrowserHeight(760, 680), 760);
  assert.equal(resolveMobileBrowserHeight(760, 420), 420);
  assert.equal(resolveMobileBrowserHeight(915, 520), 520);
  assert.equal(resolveMobileBrowserHeight(844, 844), 844);
});
