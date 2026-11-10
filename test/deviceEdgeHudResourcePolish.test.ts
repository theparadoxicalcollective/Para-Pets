import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Watcher docks below the pet team in real viewport HUD coordinates", () => {
  const home = read("client/src/pages/HomePage.tsx");
  assert.match(home, /<ViewportHudPortal>/);
  assert.match(home, /data-testid="viewport-hud-watcher-dock"/);
  assert.match(home, /bottom: "calc\(2px \+ env\(safe-area-inset-bottom, 0px\)\)"/);
  assert.match(home, /width: "min\(calc\(100vw - 34px\), 430px\)"/);
  assert.match(home, /data-testid="button-open-world-chat"/);
  assert.match(home, /width: 36/);
  assert.match(home, /height: 36/);
  assert.doesNotMatch(home, /data-testid="viewport-hud-corner-actions"|data-testid="button-open-support"/);
});

test("only new bot IDs produce speech bubbles, and mute is per-account", () => {
  const home = read("client/src/pages/HomePage.tsx");
  const watcher = read("client/src/components/WorldChatPanel.tsx");
  assert.match(home, /msg\?\.isBot === true/);
  assert.match(home, /watcherSeenIdsRef\.current = new Set/);
  assert.match(home, /if \(!seen\) return/);
  assert.match(home, /data-testid="watcher-announcement-bubble"/);
  assert.match(home, /data-testid="button-silence-watcher-announcements"/);
  assert.match(home, /localStorage\.setItem\(\`para-pets:watcher-bubble-muted:/);
  assert.match(watcher, /data-testid="button-toggle-watcher-announcement-bubbles"/);
  assert.match(watcher, /data-testid="button-toggle-shoutouts"/);
});

test("chat uses the device HUD while support uses the topmost modal layer", () => {
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(home, /data-testid="viewport-hud-world-chat-layer"/);
  assert.match(home, /<ViewportHudPortal>[\s\S]*?<WorldChatPanel/);
  assert.match(home, /\{showSupportModal && \([\s\S]*?<ViewportModalPortal>/);
  assert.match(home, /aria-modal="true"/);
  assert.match(home, /!showWorldChat && !showSupportModal/);
});

test("coin and essence balances share a compact coordinated resource cluster", () => {
  const topBar = read("client/src/components/TopBar.tsx");

  assert.match(topBar, /data-testid="topbar-resource-cluster"/);
  // Home stacks readable resource bars under the photo; other pages retain
  // their original coin/essence + bundle-button grid.
  assert.match(topBar, /gridTemplateColumns: location === "\/" \? "max-content" : "auto 44px"/);
  assert.match(topBar, /flexBasis: location === "\/" \? "100%" : undefined/);
  assert.match(topBar, /gridTemplateRows: location === "\/" \? "30px 30px 34px" : "30px 30px"/);
  assert.match(topBar, /data-testid="display-coin-balance"/);
  assert.doesNotMatch(topBar, /data-testid="button-coin-shop"/);
  assert.match(topBar, /gridColumn: 1/);
  assert.match(topBar, /gridRow: location === "\/" \? 2 : 1/);
  assert.match(topBar, /data-testid="display-essence"/);
  assert.match(topBar, /gridRow: location === "\/" \? 1 : 2/);
});

test("coin-bundle control is more visible without changing the coin shop destination", () => {
  const topBar = read("client/src/components/TopBar.tsx");

  const start = topBar.indexOf('data-testid="button-coin-bag"');
  assert.ok(start >= 0);
  const block = topBar.slice(start, start + 2600);

  assert.match(block, /aria-label="Open coin bundles"/);
  assert.match(block, /title="Coin Bundles"/);
  assert.match(block, /navigate\("\/coins"\)/);
  assert.match(block, /gridRow: location === "\/" \? 3 : "1 \/ span 2"/);
  assert.match(block, /width: location === "\/" \? 32 : 44/);
  assert.match(block, /height: location === "\/" \? 32 : 44/);
  assert.match(block, /border: "1\.5px solid rgba\(240,192,64,0\.72\)"/);
  assert.match(block, /boxShadow: "0 3px 10px/);
  assert.match(block, /width: location === "\/" \? 26 : 38/);
  assert.match(block, /height: location === "\/" \? 26 : 38/);
  assert.match(block, /brightness\(1\.06\)/);
  assert.match(block, />\s*\+\s*<\/span>/);
});

test("profile stays in the upper-left resource group while corner actions stay independent", () => {
  const topBar = read("client/src/components/TopBar.tsx");
  const home = read("client/src/pages/HomePage.tsx");

  assert.match(topBar, /data-testid="button-profile"/);
  assert.match(topBar, /data-testid="topbar-resource-cluster"/);
  assert.match(home, /data-testid="viewport-hud-topbar"/);
  assert.match(home, /<div style=\{\{ pointerEvents: "none" \}\}>\s*<TopBar user=\{currentUser\}/);
  assert.match(topBar, /pointerEvents: globalHudHidden \|\| location === "\/" \? "none" : "auto"/);
  assert.match(home, /left: 0/);
  assert.match(home, /right: 0/);
  assert.match(home, /data-testid="viewport-hud-watcher-dock"/);
});
