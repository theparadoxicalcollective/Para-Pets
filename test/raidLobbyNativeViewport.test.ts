import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const raid = readFileSync("client/src/pages/RaidPage.tsx", "utf8");

test("Raid lobby owns native device viewport instead of 390x844 stage", () => {
  assert.equal(usesDeviceGameplaySurface("/raid"), true);
  assert.ok(app.includes(`location === "/raid" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Raid lobby keeps boss setup, party slots, potions and battle entry", () => {
  assert.match(raid, /data-testid="button-start-raid-battle"/);
  assert.match(raid, /data-testid="raid-pet-slots"/);
  assert.match(raid, /data-testid="button-set-raid-boss"/);
  assert.match(raid, /data-testid="button-raid-leaderboard"/);
});
