import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStageLayout,
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

const viewports = [
  [360, 800], [360, 780], [375, 812], [390, 844], [393, 873], [412, 915], [430, 932],
  [768, 1024], [800, 1280], [820, 1180], [834, 1194], [1024, 1366],
  [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440],
] as const;

for (const [width, height] of viewports) {
  test(`${width}x${height} contains the stage and round-trips gameplay hit coordinates`, () => {
    const layout = calculateStageLayout(width, height);
    assert.equal(layout.designWidth, DESIGN_W);
    assert.equal(layout.designHeight, DESIGN_H);
    assert.ok(layout.renderedWidth <= width + Number.EPSILON);
    assert.ok(layout.renderedHeight <= height + Number.EPSILON);
    assert.ok(Math.abs(layout.renderedWidth / layout.designWidth - layout.scale) < 1e-12);
    assert.ok(Math.abs(layout.renderedHeight / DESIGN_H - layout.scale) < 1e-12);
    assert.ok(Math.abs(layout.renderedWidth / layout.renderedHeight - DESIGN_W / DESIGN_H) < 1e-12, "portrait aspect ratio is preserved");
    assert.ok(layout.scale <= MAX_STAGE_SCALE, "large monitors use the capped frame scale");
    assert.ok(layout.left >= 0);
    assert.ok(Math.abs(layout.left + layout.renderedWidth / 2 - width / 2) < 1e-9, "frame is horizontally centered");
    assert.ok(Math.abs(layout.top + layout.renderedHeight / 2 - height / 2) < 1e-9, "frame is vertically centered");
    assert.ok(layout.top + layout.renderedHeight <= height + Number.EPSILON, "bottom controls remain visible");

    for (const logicalTarget of [{ x: 0, y: 0 }, { x: 220, y: 300 }, { x: layout.designWidth - 1, y: DESIGN_H - 1 }]) {
      const pointer = logicalToRendered(layout, logicalTarget.x, logicalTarget.y);
      const hit = renderedToLogical(layout, pointer.x, pointer.y);
      assert.ok(Math.abs(hit.x - logicalTarget.x) < 1e-9, "pointer hits logical x");
      assert.ok(Math.abs(hit.y - logicalTarget.y) < 1e-9, "pointer hits logical y");
    }
  });
}

test("visual viewport offsets are included in rendered coordinates", () => {
  const layout = calculateStageLayout(360, 780, 47, 3);
  assert.ok(layout.top >= 47);
  assert.ok(layout.left >= 3);
  const pointer = logicalToRendered(layout, 123, 456);
  assert.deepEqual(renderedToLogical(layout, pointer.x, pointer.y), { x: 123, y: 456 });
});
