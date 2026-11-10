import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const hud = read("client/src/components/HomePlayerHud.tsx");
const hudCss = read("client/src/components/HomePlayerHud.css");
const nav = read("client/src/components/FloatingNav.tsx");

test("Home player level gets its own forest-and-gold pill without changing XP math", () => {
  assert.match(hud, /\{avatarHome && \(/);
  assert.match(hud, /className="home-player-hud__level home-player-hud__level-pill"/);
  assert.match(hud, /player \? `Lvl \$\{player\.level\}`/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__level-pill/);
  assert.match(hudCss, /border-radius: 999px/);
  assert.match(hudCss, /rgba\(234, 196, 109, \.82\)/);
  assert.match(hudCss, /box-shadow: 0 2px 9px/);
  assert.match(hud, /totalXpRequiredForPlayerLevel\(player\.level\)/);
  assert.match(hud, /data-testid="home-player-xp-track"/);
  assert.match(hud, /data-testid="home-player-total-xp"/);
});

test("XP stack shifts down without losing the bottom party clearance on short phones", () => {
  assert.match(hudCss, /home-avatar-standing-y[^\n]*\+ 20px/);
  assert.match(hudCss, /home-avatar-standing-y[^\n]*\+ 16px/);
  assert.match(hudCss, /bottom: calc\(63px \+ env\(safe-area-inset-bottom/);
  assert.match(hudCss, /bottom: calc\(58px \+ env\(safe-area-inset-bottom/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__party-panel/);
});

test("Home-only main nav moves below resource balances, while all other pages retain the old anchor", () => {
  assert.match(nav, /const \[location, navigate\] = useLocation\(\)/);
  assert.match(nav, /const isHome = location === "\/"/);
  assert.match(nav, /top: isHome \? "min\(242px, max\(172px, calc\(100dvh - 355px\)\)\)" : undefined/);
  assert.match(nav, /bottom: isHome \? undefined : 16/);
  assert.match(nav, /data-testid="button-floating-nav"/);
  assert.match(nav, /aria-expanded=\{isOpen\}/);
  assert.match(nav, /if \(navHidden\) return null/);
});

test("Home expanded navigation exposes all current routes in a screen-safe three-column arrangement", () => {
  assert.match(nav, /translateX=\{isHome \? -\(i % 3\) \* 62 : -\(spacing \* \(i \+ 1\)\)\}/);
  assert.match(nav, /translateY=\{isHome \? \(Math\.floor\(i \/ 3\) \+ 1\) \* 65 : 0\}/);
  assert.match(nav, /const homeIndex = LEFT_ITEMS\.length \+ i/);
  assert.match(nav, /translateX=\{isHome \? -\(homeIndex % 3\) \* 62 : 0\}/);
  assert.match(nav, /translateY=\{isHome \? \(Math\.floor\(homeIndex \/ 3\) \+ 1\) \* 65 : -\(spacing \* \(i \+ 1\)\)\}/);
  assert.match(nav, /\{LEFT_ITEMS\.map/);
  assert.match(nav, /\{RIGHT_ITEMS\.map/);
  assert.match(nav, /setMainNavOpen\(isOpen && !navHidden\)/);
  // The 50px item hit circles stay distinct at the chosen 62x65 spacing.
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
    const dx = Math.abs(i % 3 - j % 3) * 62;
    const dy = Math.abs(Math.floor(i / 3) - Math.floor(j / 3)) * 65;
    assert.ok(dx >= 50 || dy >= 50, `menu item ${i} and ${j} do not overlap`);
  }
  for (const viewportHeight of [500, 568, 667, 844, 1194]) {
    const top = Math.min(242, Math.max(172, viewportHeight - 355));
    assert.ok(top + 4 * 65 + 50 <= viewportHeight - 8,
      `Home nav fits viewport height ${viewportHeight}`);
  }
});
