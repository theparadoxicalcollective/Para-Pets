import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const topBar = read("client/src/components/TopBar.tsx");
const nav = read("client/src/components/FloatingNav.tsx");
const hud = read("client/src/components/HomePlayerHud.tsx");
const hudCss = read("client/src/components/HomePlayerHud.css");

test("Home name is lower and more legible; shop moves to menu while balances stay below portrait", () => {
  assert.match(topBar, /data-testid="home-account-header"/);
  assert.match(topBar, /data-testid="home-header-player-name"/);
  assert.match(topBar, /data-testid="button-profile"/);
  assert.match(topBar, /data-testid="button-coin-bag"/);
  assert.match(topBar, /location === "\/" && !hideProfile/);
  assert.doesNotMatch(topBar, /!hideCoins && coinBundleShopButton/);
  assert.match(topBar, /location !== "\/" && coinBundleShopButton/);
  assert.match(topBar, /paddingTop: 23/);
  assert.match(topBar, /borderLeft: "2px solid rgba\(245, 205, 118/);
  assert.match(nav, /data-testid="nav-item-coins"/);
  assert.match(nav, /@assets\/uploads\/CoinBundleIcon\.png/);
  assert.match(topBar, /marginTop: location === "\/" \? 17 : 0/);
  assert.match(topBar, /\{location !== "\/" && \(/); // Non-Home nameplates survive.
});

test("coin and essence balance artwork is read-only; only shop icon navigates", () => {
  assert.doesNotMatch(topBar, /data-testid="button-coin-shop"/);
  const start = topBar.indexOf('data-testid="display-coin-balance"');
  const end = topBar.indexOf('</div>', start);
  assert.ok(start >= 0 && end > start);
  const balance = topBar.slice(start, end);
  assert.doesNotMatch(balance, /onClick|navigate\("/);
  assert.match(balance, /data-testid="text-coins"/);
  assert.match(topBar, /data-testid="display-essence"/);
  assert.match(topBar, /onClick=\{\(\) => navigate\("\/coins"\)\}/);
});

test("Home moves XP beneath bar and places level centered with XP to its left", () => {
  assert.match(hud, /\{!avatarHome && \(/);
  assert.match(hud, /className="home-player-hud__level-below"/);
  assert.match(hud, /data-testid="home-player-level"/);
  assert.match(hud, /data-testid="home-player-total-xp"/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__level-below/);
  assert.match(hudCss, /justify-content: center/);
  assert.match(hudCss, /top: calc\(100% \+ 14px\)/);
  assert.match(hudCss, /text-align: left/);
  assert.match(hud, /xpFillPct/); // Progression calculations are unchanged.
});

test("player avatar stars are larger; party portraits keep rarity stars but no dots", () => {
  assert.match(hudCss, /width: clamp\(32px, 9vw, 44px\)/);
  assert.match(hudCss, /height: clamp\(32px, 9vw, 44px\)/);
  assert.match(hudCss, /opacity: \.42/);
  assert.match(hud, /home-player-hud__slot-stars/);
  assert.doesNotMatch(hud, /home-player-hud__slot-dot/);
  assert.doesNotMatch(hudCss, /\.home-player-hud__slot-dot/);
  assert.match(hud, /saveTeam\(next\)/);
});
