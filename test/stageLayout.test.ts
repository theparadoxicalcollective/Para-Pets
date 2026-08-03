import assert from "node:assert/strict";
import test from "node:test";
import { calculateStageLayout, DESIGN_H, DESIGN_W } from "../client/src/lib/stage";

test("390x844 standalone golden design remains pixel-faithful", () => {
  const layout = calculateStageLayout(390, 844);
  assert.deepEqual(layout, { designWidth: 390, designHeight: 844, scale: 1, renderedWidth: 390, renderedHeight: 844, left: 0, top: 0 });
});

for (const [width, height] of [[390, 760], [390, 700], [390, 664], [430, 800]]) {
  test(`browser ${width}x${height} uniformly contains the complete stage`, () => {
    const layout = calculateStageLayout(width, height);
    assert.equal(layout.designWidth, DESIGN_W);
    assert.equal(layout.designHeight, DESIGN_H);
    assert.ok(layout.renderedWidth <= width + 1e-9);
    assert.ok(layout.renderedHeight <= height + 1e-9);
    assert.equal(layout.renderedWidth / DESIGN_W, layout.scale);
    assert.equal(layout.renderedHeight / DESIGN_H, layout.scale);
    assert.ok(layout.top + layout.renderedHeight <= height + 1e-9, "bottom shelf is visible");
    const logicalPet = { x: 220, y: 300 };
    const client = { x: layout.left + logicalPet.x * layout.scale, y: layout.top + logicalPet.y * layout.scale };
    assert.ok(Math.abs((client.x - layout.left) / layout.scale - logicalPet.x) < 1e-9);
    assert.ok(Math.abs((client.y - layout.top) / layout.scale - logicalPet.y) < 1e-9);
  });
}
