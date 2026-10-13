import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const home = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");

test("Pet Home owns device viewport rather than a 390x844 reference plane", () => {
  assert.equal(usesDeviceGameplaySurface("/pet-house"), true);
  assert.ok(app.includes(`location === "/pet-house" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Pet Home preserves interior and outdoor scene cameras and placement controls", () => {
  assert.match(home, /data-testid="pet-home-interior-camera"/);
  assert.match(home, /data-testid="pet-home-stage"/);
  assert.match(home, /<ViewportScenePortal/);
  assert.match(home, /data-testid="button-pet-home-size-minus"/);
  assert.match(home, /data-testid="button-pet-home-size-plus"/);
});
