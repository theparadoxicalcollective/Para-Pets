import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

test("Active Pet owns native viewport dimensions across phone, tablet and desktop", () => {
  for (const [width, height] of [[390, 844], [412, 915], [768, 1024], [1024, 1366], [1440, 900]]) {
    assert.equal(usesDeviceGameplaySurface("/"), true);
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: usesDeviceGameplaySurface("/") });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
    assert.equal(layout.left, 0);
    assert.equal(layout.top, 0);
  }
});
test("world and Pet Home pages use native viewport", () => {
  assert.equal(usesDeviceGameplaySurface("/pet-house"), true);
  assert.equal(usesDeviceGameplaySurface("/world/swamp"), true);
});
