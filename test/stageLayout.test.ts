import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStageLayout,
  clientToPortalPoint,
  DESIGN_H,
  DESIGN_W,
  logicalToRendered,
  MAX_STAGE_SCALE,
  renderedToLogical,
} from "../client/src/lib/stage";

test("390x844 iPhone design remains pixel-faithful", () => {
  const layout = calculateStageLayout(390, 844);
  assert.equal(layout.designWidth, DESIGN_W);
  assert.equal(layout.designHeight, DESIGN_H);
  assert.equal(layout.scale, 1);
  assert.equal(layout.renderedWidth, 390);
  assert.equal(layout.renderedHeight, 844);
  assert.equal(layout.left, 0);
  assert.equal(layout.top, 0);
});

test("390x760 Safari visual viewport scales the complete phone composition to fit", () => {
  const layout = calculateStageLayout(390, 760);
  assert.equal(layout.scale, 760 / DESIGN_H);
  assert.equal(layout.designWidth, 390);
  assert.equal(layout.designHeight, DESIGN_H);
  assert.equal(layout.renderedHeight, 760);
  assert.equal(layout.top, 0);
  assert.equal(layout.viewportHeight, 760);
  assert.ok(Math.abs(layout.viewportHeight * 0.01 - 7.6) < 1e-12);
});

test("tall standalone iPhone viewport remains an unscaled, top-aligned mobile stage", () => {
  const layout = calculateStageLayout(393, 852, 12, 0);
  assert.equal(layout.scale, 1);
  assert.equal(layout.designWidth, 390);
  assert.equal(layout.designHeight, 852);
  assert.equal(layout.top, 12);
  assert.equal(layout.left, 1.5);
});

test("narrower, shorter browser viewports scale the complete composition", () => {
  const layout = calculateStageLayout(360, 760);
  assert.equal(layout.designWidth, 360);
  assert.equal(layout.designHeight, DESIGN_H);
  assert.equal(layout.scale, 760 / DESIGN_H);
  assert.equal(layout.renderedWidth, 360 * 760 / DESIGN_H);
});

test("mobile portal coordinates remain viewport coordinates used by DOM hit testing", () => {
  const layout = calculateStageLayout(393, 852);
  assert.deepEqual(clientToPortalPoint(layout, 198, 420), { x: 198, y: 420 });
});

for (const [width, height] of [[1440, 900], [1920, 1080]] as const) {
  test(`${width}x${height} uses the centered desktop portrait presentation`, () => {
    const layout = calculateStageLayout(width, height);
    assert.ok(layout.scale > 1);
    assert.equal(layout.designHeight, DESIGN_H);
    assert.equal(layout.left + layout.renderedWidth / 2, width / 2);
    assert.equal(layout.top + layout.renderedHeight / 2, height / 2);
  });
}

const viewports = [
  [360, 800], [360, 780], [375, 812], [390, 844], [393, 873], [412, 915], [430, 932],
  [768, 1024], [800, 1280], [820, 1180], [834, 1194], [1024, 1366],
  [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440],
] as const;

for (const [width, height] of viewports) {
  test(`${width}x${height} contains the stage and round-trips gameplay hit coordinates`, () => {
    const layout = calculateStageLayout(width, height);
    assert.equal(layout.designWidth, width < 768 ? Math.min(DESIGN_W, width) : DESIGN_W);
    assert.equal(layout.designHeight, width < 768 ? Math.max(DESIGN_H, height) : DESIGN_H);
    assert.ok(layout.renderedWidth <= width + Number.EPSILON);
    assert.ok(layout.renderedHeight <= height + Number.EPSILON);
    assert.ok(Math.abs(layout.renderedWidth / layout.designWidth - layout.scale) < 1e-12);
    assert.ok(Math.abs(layout.renderedHeight / layout.designHeight - layout.scale) < 1e-12);
    assert.ok(layout.scale <= MAX_STAGE_SCALE, "large monitors use the capped frame scale");
    assert.ok(layout.left >= 0);
    assert.ok(Math.abs(layout.left + layout.renderedWidth / 2 - width / 2) < 1e-9, "frame is horizontally centered");
    if (width < 768) assert.equal(layout.top, 0, "mobile starts at the visible top");
    else assert.ok(Math.abs(layout.top + layout.renderedHeight / 2 - height / 2) < 1e-9, "desktop frame is vertically centered");
    assert.ok(layout.top + layout.renderedHeight <= height + Number.EPSILON, "bottom controls remain visible");

    for (const logicalTarget of [{ x: 0, y: 0 }, { x: 220, y: 300 }, { x: layout.designWidth - 1, y: layout.designHeight - 1 }]) {
      const pointer = logicalToRendered(layout, logicalTarget.x, logicalTarget.y);
      const hit = renderedToLogical(layout, pointer.x, pointer.y);
      assert.ok(Math.abs(hit.x - logicalTarget.x) < 1e-9, "pointer hits logical x");
      assert.ok(Math.abs(hit.y - logicalTarget.y) < 1e-9, "pointer hits logical y");
    }
  });
}

test("visual viewport offsets are included in rendered coordinates", () => {
  const layout = calculateStageLayout(360, 780, 47, 3);
  assert.equal(layout.top, 47);
  assert.ok(layout.left >= 3);
  const pointer = logicalToRendered(layout, 123, 456);
  const logical = renderedToLogical(layout, pointer.x, pointer.y);
  assert.ok(Math.abs(logical.x - 123) < 1e-9);
  assert.ok(Math.abs(logical.y - 456) < 1e-9);
});
