import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const topBar = read("client/src/components/TopBar.tsx");
const nav = read("client/src/components/FloatingNav.tsx");
const hud = read("client/src/components/HomePlayerHud.tsx");
const hudCss = read("client/src/components/HomePlayerHud.css");

test("Home name is lower and more legible; small coin shortcut sits below reordered balances", () => {
  assert.match(topBar, /data-testid="home-account-header"/);
  assert.match(topBar, /data-testid="home-header-player-name"/);
  assert.match(topBar, /data-testid="button-profile"/);
  assert.match(topBar, /data-testid="button-coin-bag"/);
  assert.match(topBar, /location === "\/" && !hideProfile/);
  assert.match(topBar, /\{coinBundleShopButton\}/);
  assert.match(topBar, /data-testid="home-account-header"/);
  assert.match(topBar, /self-center/);
  assert.match(topBar, /transform: "translateY\(17px\)"/);
  assert.match(topBar, /fontSize: "clamp\(11px, 3\.1vw, 15px\)"/);
  assert.match(topBar, /data-testid="home-header-watcher"/);
  assert.ok(topBar.indexOf('data-testid="home-header-player-name"') < topBar.indexOf('data-testid="home-header-watcher"'),
    "the player name precedes the smaller Watcher on Home");
  assert.match(topBar, /borderRadius: 0/);
  assert.match(topBar, /gridRow: location === "\/" \? 3 : "1 \/ span 2"/);
  assert.match(topBar, /borderLeft: "2px solid rgba\(245, 205, 118/);
  assert.match(nav, /"badges", "support"/);
  assert.match(nav, /testId=\{`nav-item-\$\{id\}`\}/);
  assert.match(nav, /isSupport \? handleRight\("support"\)/);
  assert.doesNotMatch(nav, /data-testid="nav-item-coins"/);
  assert.match(nav, /@assets\/uploads\/NewMainNavButton\.PNG/);
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

test("Home keeps curved level text on an artwork-relative XP bar with quantity hidden", () => {
  assert.match(hud, /\{!avatarHome && \(/);
  assert.match(hud, /className="home-player-hud__level-curved"/);
  assert.match(hud, /<textPath href="#home-player-level-curve" startOffset="50%">/);
  assert.match(hud, /data-testid="home-player-level"/);
  assert.doesNotMatch(hud, /<text data-testid="home-player-total-xp"/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__level-curved/);
  assert.match(hudCss, /--home-xp-art-width/);
  assert.match(hud, /homeXpArcGeometry\(curveDepth\)/);
  assert.match(hud, /aria-label=\{player && xpNeededThisLevel !== null/);
  assert.match(hud, /xpFillPct/); // Progression calculations are unchanged.
});

test("player avatar stars are larger; party portraits keep rarity stars but no dots", () => {
  assert.match(hudCss, /width: clamp\(37px, 10vw, 51px\)/);
  assert.match(hudCss, /height: clamp\(37px, 10vw, 51px\)/);
  assert.match(hudCss, /opacity: \.42/);
  assert.match(hud, /home-player-hud__slot-stars/);
  assert.doesNotMatch(hud, /home-player-hud__slot-dot/);
  assert.doesNotMatch(hudCss, /\.home-player-hud__slot-dot/);
  assert.match(hud, /saveTeam\(next\)/);
});
