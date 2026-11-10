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

test("Home navigation flows down the right edge into left columns; other routes keep old anchor", () => {
  assert.match(nav, /const \[location, navigate\] = useLocation\(\)/);
  assert.match(nav, /const isHome = location === "\/"/);
  assert.match(nav, /top: isHome \? "clamp\(108px/);
  assert.match(nav, /bottom: isHome \? undefined : 16/);
  assert.match(nav, /right: 12/);
  assert.match(nav, /data-testid="home-realm-nav-panel"/);
  assert.match(nav, /ref=\{homeAnchorRef\}/);
  assert.match(nav, /homeAnchorRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(nav, /gridTemplateColumns: \x60repeat\(\$\{homeColumns\}, \$\{HOME_TILE_WIDTH\}px\)\x60/);
  assert.match(nav, /homeNavPosition\(index, homeRowCapacity\)/);
  assert.match(nav, /bottom - anchorBottom - 12 - 34/);
  assert.match(nav, /aria-controls=\{isHome \? "home-realm-nav-panel" : undefined\}/);
  assert.match(nav, /aria-expanded=\{isOpen\}/);
  assert.match(nav, /if \(navHidden\) return null/);
  assert.match(nav, /setMainNavOpen\(isOpen && !navHidden\)/);
});

test("Main is first and Support is last in the ordered right-to-left Home icon rail", () => {
  const css = read("client/src/components/FloatingNavHome.css");
  assert.match(nav, /const HOME_NAV_ORDER = \[/);
  assert.match(nav, /"home", "inventory", "map", "pethouse", "quest", "keepers"/);
  assert.match(nav, /"bag", "market", "aquarium", "cards", "pvp", "badges", "support"/);
  assert.match(nav, /HOME_NAV_ORDER\.map\(\(id, index\) =>/);
  assert.match(nav, /gridColumn: columns - column/);
  assert.match(nav, /column === columns - 1 \? rows - count : 0/);
  assert.match(nav, /showQuestReward=\{id === "quest" && questRewardReady\}/);
  assert.match(nav, /isSupport \? handleRight\("support"\)/);
  assert.match(nav, /if \(id === "support"\)/);
  assert.match(nav, /para-pets:open-support/);
  assert.match(nav, /aria-label="Realm navigation"/);
  assert.doesNotMatch(nav, /HOME_NAV_SECTIONS|data-testid="nav-item-coins"|<Compass/);
  assert.match(nav, /src=\{mainNavIcon\}/);
  assert.match(nav, /!isHome && LEFT_ITEMS\.map/);
  assert.match(nav, /!isHome && RIGHT_ITEMS\.map/);
  assert.match(nav, /window\.dispatchEvent\(new Event\("para-pets:main-nav-open"\)\)/);
  assert.match(nav, /window\.addEventListener\("para-pets:pet-menu-open", closeForPetMenu\)/);
  assert.match(css, /\.home-realm-nav\s*\{/);
  assert.match(css, /top: calc\(100% \+ 10px\)/);
  assert.match(css, /pointer-events: none/);
  assert.match(css, /\.home-realm-nav__icon/);
  assert.doesNotMatch(css, /home-realm-nav__shortcut-row|home-realm-nav__section|home-realm-nav__grid/);
});
