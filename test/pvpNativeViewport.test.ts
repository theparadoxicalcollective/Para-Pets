import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calculateStageLayout, usesDeviceGameplaySurface } from "../client/src/lib/stage";

const app = readFileSync("client/src/App.tsx", "utf8");
const pvp = readFileSync("client/src/pages/PvpArenaPage.tsx", "utf8");

test("PvP arena uses device viewport rather than legacy 390x844 stage", () => {
  assert.equal(usesDeviceGameplaySurface("/pvp"), true);
  assert.ok(app.includes(`location === "/pvp" && (
          <StagePageSurface layout="viewport">`));
  for (const [width, height] of [[390, 844], [834, 1194], [1440, 900]]) {
    const layout = calculateStageLayout(width, height, 0, 0, { viewportSurface: true });
    assert.equal(layout.coordinateOwner, "viewport");
    assert.equal(layout.designWidth, width);
    assert.equal(layout.designHeight, height);
    assert.equal(layout.scale, 1);
  }
});

test("PvP keeps arena controls, tickets, leaderboard and viewport backdrop", () => {
  assert.match(pvp, /data-testid="pvp-arena-page"/);
  assert.match(pvp, /<ViewportBackdropPortal>/);
  assert.match(pvp, /data-testid="button-close-pvp"/);
  assert.match(pvp, /data-testid="button-open-ticket-shop"/);
  assert.match(pvp, /data-testid="row-leaderboard-header"/);
});

test("PvP arena restores pointer input on the native viewport host and keeps the main list scrollable", () => {
  assert.match(app, /id="game-viewport-page"[\s\S]{0,180}pointerEvents: "none"/);
  assert.match(pvp, /data-testid="pvp-arena-page"[\s\S]{0,180}pointerEvents: "auto"/);
  assert.match(pvp, /touchAction: "pan-y"/);
  assert.match(pvp, /flex-1 min-h-0 overflow-y-auto overscroll-contain/);
  assert.match(pvp, /data-testid="button-open-ticket-shop"/);
});
