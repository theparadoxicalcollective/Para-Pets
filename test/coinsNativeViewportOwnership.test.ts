import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const coins = readFileSync("client/src/pages/CoinShopPage.tsx", "utf8");

test("Coins shop owns actual device viewport without legacy 390x844 wrapper", () => {
  assert.equal(usesDeviceGameplaySurface("/coins"), true);
  assert.ok(app.includes(`location === "/coins" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Coins shop retains purchase interface and viewport backdrop", () => {
  assert.match(coins, /data-stage-coordinate-space="canonical"/);
  assert.match(coins, /<ViewportBackdropPortal>/);
});
