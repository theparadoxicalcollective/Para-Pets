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

test("XP, level pill and companion panel sit lower while retaining short-phone clearance", () => {
  assert.match(hudCss, /home-avatar-standing-y[^\n]*\+ 32px/);
  assert.match(hudCss, /home-avatar-standing-y[^\n]*\+ 28px/);
  assert.match(hudCss, /bottom: calc\(44px \+ env\(safe-area-inset-bottom/);
  assert.match(hudCss, /bottom: calc\(40px \+ env\(safe-area-inset-bottom/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__party-panel/);
  assert.match(hudCss, /pointer-events: auto/);
});

test("Home-only navigation presents a grouped upper-right folio; other routes keep the old anchor", () => {
  assert.match(nav, /const \[location, navigate\] = useLocation\(\)/);
  assert.match(nav, /const isHome = location === "\/"/);
  assert.match(nav, /top: isHome \? "clamp\(108px/);
  assert.match(nav, /bottom: isHome \? undefined : 16/);
  assert.match(nav, /right: 12/);
  assert.match(nav, /data-testid="home-realm-nav-panel"/);
  assert.match(nav, /aria-controls=\{isHome \? "home-realm-nav-panel" : undefined\}/);
  assert.match(nav, /aria-expanded=\{isOpen\}/);
  assert.match(nav, /if \(navHidden\) return null/);
  assert.match(nav, /setMainNavOpen\(isOpen && !navHidden\)/);
});

test("all twelve actions and their route handlers remain available in three rows", () => {
  assert.match(nav, /const HOME_NAV_SECTIONS = \[/);
  assert.match(nav, /title: "Explore"/);
  assert.match(nav, /title: "Companions"/);
  assert.match(nav, /title: "Activities"/);
  assert.match(nav, /section\.ids\.map\(id =>/);
  assert.match(nav, /handleLeft\(item\.id\) : handleRight\(item\.id\)/);
  assert.match(nav, /questBadge=\{item\.id === "quest" && questRewardReady\}/);
  assert.match(nav, /!isHome && LEFT_ITEMS\.map/);
  assert.match(nav, /!isHome && RIGHT_ITEMS\.map/);
  assert.match(nav, /window\.dispatchEvent\(new Event\("para-pets:main-nav-open"\)\)/);
  assert.match(nav, /window\.addEventListener\("para-pets:pet-menu-open", closeForPetMenu\)/);
  const ids = [
    ["map", "pethouse", "keepers", "aquarium"],
    ["inventory", "bag", "cards", "market"],
    ["quest", "pvp", "badges", "home"],
  ];
  assert.equal(ids.flat().length, 12);
  assert.equal(new Set(ids.flat()).size, 12);
});
