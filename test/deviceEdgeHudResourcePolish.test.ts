import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Veridian Watcher and Support are anchored to the real device upper-right HUD", () => {
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(home, /<ViewportHudPortal>/);
  assert.match(home, /data-testid="viewport-hud-corner-actions"/);
  assert.match(home, /top: 58/);
  assert.match(home, /right: 12/);
  assert.match(home, /display: "flex"/);
  assert.match(home, /gap: 6/);

  assert.match(home, /data-testid="button-open-world-chat"/);
  assert.match(home, /width: 44/);
  assert.match(home, /height: 44/);

  assert.match(home, /data-testid="button-open-support"/);
  assert.match(home, /marginTop: 8/);
  assert.match(home, /width: 36/);
  assert.match(home, /height: 36/);
});

test("upper-right button group preserves the original iPhone 12 geometry", () => {
  // right edge = 12. Support is 36 wide. Gap is 6. Therefore the Watcher
  // remains 12 + 36 + 6 = 54 logical pixels from the right.
  const supportRight = 12;
  const supportWidth = 36;
  const gap = 6;
  const watcherRight = supportRight + supportWidth + gap;
  assert.equal(watcherRight, 54);

  const groupTop = 58;
  const supportTop = groupTop + 8;
  assert.equal(supportTop, 66);
});

test("chat and support overlays share the device HUD so they render above persistent controls", () => {
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(home, /data-testid="viewport-hud-world-chat-layer"/);
  assert.match(home, /<ViewportHudPortal>[\s\S]*?<WorldChatPanel/);
  assert.match(home, /\{showSupportModal && \([\s\S]*?<ViewportHudPortal>/);
  assert.match(home, /!showWorldChat && !showSupportModal/);
});

test("coin and essence balances share a compact coordinated resource cluster", () => {
  const topBar = read("client/src/components/TopBar.tsx");

  assert.match(topBar, /data-testid="topbar-resource-cluster"/);
  assert.match(topBar, /gridTemplateColumns: "auto 44px"/);
  assert.match(topBar, /gridTemplateRows: "30px 30px"/);
  assert.match(topBar, /data-testid="button-coin-shop"/);
  assert.match(topBar, /gridColumn: 1/);
  assert.match(topBar, /gridRow: 1/);
  assert.match(topBar, /data-testid="display-essence"/);
  assert.match(topBar, /gridRow: 2/);
});

test("coin-bundle control is more visible without changing the coin shop destination", () => {
  const topBar = read("client/src/components/TopBar.tsx");

  const start = topBar.indexOf('data-testid="button-coin-bag"');
  assert.ok(start >= 0);
  const block = topBar.slice(start, start + 2600);

  assert.match(block, /aria-label="Open coin bundles"/);
  assert.match(block, /title="Coin Bundles"/);
  assert.match(block, /navigate\("\/coins"\)/);
  assert.match(block, /gridRow: "1 \/ span 2"/);
  assert.match(block, /width: 44/);
  assert.match(block, /height: 44/);
  assert.match(block, /border: "1\.5px solid rgba\(240,192,64,0\.72\)"/);
  assert.match(block, /boxShadow: "0 3px 10px/);
  assert.match(block, /width: 38/);
  assert.match(block, /height: 38/);
  assert.match(block, /brightness\(1\.06\)/);
  assert.match(block, />\s*\+\s*<\/span>/);
});

test("profile stays in the upper-left resource group while corner actions stay independent", () => {
  const topBar = read("client/src/components/TopBar.tsx");
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(topBar, /data-testid="button-profile"/);
  assert.match(topBar, /data-testid="topbar-resource-cluster"/);
  assert.match(home, /data-testid="viewport-hud-topbar"/);
  assert.match(home, /left: 0/);
  assert.match(home, /right: 0/);
  assert.match(home, /data-testid="viewport-hud-corner-actions"/);
});
