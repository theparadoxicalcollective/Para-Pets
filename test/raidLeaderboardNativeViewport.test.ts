import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const leaderboard = readFileSync("client/src/pages/RaidLeaderboardPage.tsx", "utf8");

test("raid leaderboard no longer uses 390x844 reference stage", () => {
  assert.equal(usesDeviceGameplaySurface("/raid/leaderboard"), true);
  assert.ok(app.includes(`location === "/raid/leaderboard" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("raid leaderboard retains ranking and player profile interactions", () => {
  assert.match(leaderboard, /data-testid=\{\`row-raid-leaderboard-\$\{rank\}\`\}/);
  assert.match(leaderboard, /<PlayerDetailPanel/);
});
