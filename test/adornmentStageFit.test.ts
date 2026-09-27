import assert from "node:assert/strict";
import test from "node:test";
import { fitAdornmentStage, pointInAdornmentStage } from "../client/src/lib/adornmentStageFit";

test("oversized evolution artwork fits within the editor and stays centered", () => {
  const fit = fitAdornmentStage([
    { posX: -170, posY: -210, width: 1340, height: 1390 },
  ]);
  assert.ok(fit.scale < 1);
  assert.ok(-170 * fit.scale + fit.offsetX >= 0);
  assert.ok(-210 * fit.scale + fit.offsetY >= 0);
  assert.ok(1170 * fit.scale + fit.offsetX <= 1000);
  assert.ok(1180 * fit.scale + fit.offsetY <= 1000);
});

test("drag coordinates invert the exact fit used to draw the adornment", () => {
  const fit = fitAdornmentStage([{ posX: -100, posY: 40, width: 800, height: 950, rotation: 12 }]);
  const point = { x: 135, y: 440 };
  const screen = { x: point.x * fit.scale + fit.offsetX, y: point.y * fit.scale + fit.offsetY };
  const recovered = pointInAdornmentStage(screen.x, screen.y, fit);
  assert.ok(Math.abs(recovered.x - point.x) < 1e-8);
  assert.ok(Math.abs(recovered.y - point.y) < 1e-8);
});
