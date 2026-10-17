import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const market = readFileSync("client/src/pages/MarketPage.tsx", "utf8");

test("Market route uses native device viewport rather than 390x844 reference stage", () => {
  assert.equal(usesDeviceGameplaySurface("/market"), true);
  assert.ok(app.includes(`location === "/market" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("Market preserves canonical content, viewport backdrop, and page interactions", () => {
  assert.match(market, /data-testid="market-canonical-page"/);
  assert.match(market, /position: "relative", pointerEvents: "auto", overflow: "hidden"/);
  assert.match(market, /<ViewportBackdropPortal>/);
  assert.match(market, /data-viewport-visual-owner="backdrop"/);
});
