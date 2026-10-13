import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const friends = readFileSync("client/src/pages/FriendsPage.tsx", "utf8");

test("Friends route is mounted on real device viewport, not reference plane", () => {
  assert.equal(usesDeviceGameplaySurface("/friends"), true);
  assert.ok(app.includes(`location === "/friends" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: usesDeviceGameplaySurface("/friends") });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Friends existing controls and player detail remain available", () => {
  assert.match(friends, /className="absolute inset-0 flex flex-col"/);
  assert.match(friends, /data-testid="button-back-friends"/);
  assert.match(friends, /data-testid="button-toggle-requests"/);
  assert.match(friends, /<PlayerDetailPanel/);
});
