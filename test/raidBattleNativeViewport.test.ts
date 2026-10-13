import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const battle = readFileSync("client/src/pages/RaidBattlePage.tsx", "utf8");

test("Raid Battle uses full device viewport without legacy reference wrapper", () => {
  assert.equal(usesDeviceGameplaySurface("/raid/battle"), true);
  assert.ok(app.includes(`location === "/raid/battle" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Potion drag ghost stays in viewport client coordinates while hit tests remain rect-based", () => {
  assert.doesNotMatch(battle, /clientToStagePortal|getStagePortalTarget/);
  assert.match(battle, /x: draggingPotion\.screenX, y: draggingPotion\.screenY/);
  assert.match(battle, /document\.body/);
  assert.match(battle, /getBoundingClientRect\(\)/);
  assert.match(battle, /data-testid=/);
});

test("All gameplay routes have retired reference StagePageSurface wrappers", () => {
  assert.doesNotMatch(app, /<StagePageSurface>/);
});
