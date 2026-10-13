import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const badges = readFileSync("client/src/pages/BadgePage.tsx", "utf8");

test("Badges route uses device viewport without 390x844 reference wrapper", () => {
  assert.equal(usesDeviceGameplaySurface("/badges"), true);
  assert.ok(app.includes(`location === "/badges" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Badges retains its existing collection UI and backdrop portal", () => {
  assert.match(badges, /data-stage-coordinate-space="canonical"/);
  assert.match(badges, /<ViewportBackdropPortal>/);
  assert.match(badges, /h-screen-frame/);
});
