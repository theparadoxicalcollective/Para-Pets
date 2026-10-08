import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("client/src/tabletStageShell.css", "utf8");
const market = readFileSync("client/src/pages/MarketPage.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const surface = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");

test("tablet viewport page owns background overrides outside the old game-stage tree", () => {
  assert.match(surface, /game-viewport-page/);
  assert.match(css, /#game-viewport-page \[data-page-presentation="viewport"\] \[data-viewport-visual-owner="backdrop"\]/);
  assert.match(css, /#game-viewport-page \[data-page-presentation="viewport"\] \[data-canonical-visual-layer="duplicate-backdrop"\]/);
  assert.match(css, /#game-viewport-page \[data-page-presentation="viewport"\] \.active-pet-canonical-ambient/);
});

test("Market has one full-viewport backdrop on tablet while phone keeps authored fallback", () => {
  assert.match(market, /data-testid="market-canonical-page"/);
  assert.match(market, /data-viewport-visual-owner="backdrop"/);
  assert.equal((market.match(/data-canonical-visual-layer="duplicate-backdrop"/g) ?? []).length, 2);
  assert.match(market, /<ViewportBackdropPortal>/);
  assert.match(home, /data-testid="active-pet-viewport-backdrop"/);
  assert.match(home, /data-testid="active-pet-canonical-ambient"/);
});
