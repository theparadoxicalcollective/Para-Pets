import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dragScenePercentage } from "../client/src/lib/coordinateContracts";
import { worldCameraPointerDelta } from "../client/src/lib/worldViewport";

const source = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");

test("Pet World admin locations decor and doors use scene-relative drags", () => {
  assert.match(source, /dragScenePercentage/);
  assert.match(source, /worldCameraPointerDelta\(/);
  assert.match(source, /\{ width: map\.clientWidth, height: map\.clientHeight \}/);
  assert.doesNotMatch(source, /\{ x: dx, y: dy \}, rect,/);
  assert.match(source, /x: locDragRef\.current\.origPosX/);
  assert.match(source, /x: decorDragRef\.current\.origPosX/);
  assert.match(source, /x: doorDragRef\.current\.origPosX/);
  assert.match(source, /minX: -10, maxX: 110, minY: -10, maxY: 110/);
  assert.match(source, /minX: 0, maxX: 100, minY: 0, maxY: 100/);
  assert.match(source, /minX: 2, maxX: 98, minY: 2, maxY: 98/);
});

test("admin drag saves equivalent positions on proportionally scaled backgrounds", () => {
  const bounds = { minX: -10, maxX: 110, minY: -10, maxY: 110 };
  for (const [width, height] of [[390, 844], [780, 1688], [1200, 2600]]) {
    const result = dragScenePercentage({ x: 32, y: 58 }, { x: width * 0.15, y: height * -0.1 }, { width, height }, bounds);
    assert.ok(Math.abs(result.x - 47) < 1e-9);
    assert.ok(Math.abs(result.y - 48) < 1e-9);
  }
});


test("admin map drag conversion uses the authored map plane under CSS camera scaling", () => {
  const map = { clientWidth: 1080, clientHeight: 691, getBoundingClientRect: () => ({ width: 540, height: 345.5 }) } as unknown as HTMLElement;
  // Equivalent to a 54px horizontal, 34.55px vertical finger movement at 50% map zoom.
  const delta = worldCameraPointerDelta(54, -34.55, map);
  const result = dragScenePercentage({ x: 25, y: 60 }, delta, { width: map.clientWidth, height: map.clientHeight }, { minX: 0, maxX: 100, minY: 0, maxY: 100 });
  assert.ok(Math.abs(result.x - 35) < 1e-9);
  assert.ok(Math.abs(result.y - 50) < 1e-9);
});


test("Pet Central admin decor drag preview escapes the scaled iPhone stage", () => {
  assert.match(source, /createPortal\(/);
  assert.match(source, /data-testid="pet-central-decor-viewport-drag-ghost"/);
  assert.match(source, /document\.body,/);
  assert.match(source, /left: panelDragGhost\.clientX - 28, top: panelDragGhost\.clientY - 28/);
  assert.match(source, /document\.addEventListener\("pointercancel", cancel\)/);
  assert.match(source, /window\.addEventListener\("blur", cancel\)/);
  assert.match(source, /addDecorPlacementMutation\.mutate\(\{ item, posX: x, posY: y \}\)/);
});
