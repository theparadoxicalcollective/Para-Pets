import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const hud = read("client/src/components/HomePlayerHud.tsx");
const hudCss = read("client/src/components/HomePlayerHud.css");
const nav = read("client/src/components/FloatingNav.tsx");

test("Home level lettering curves beneath the platform XP arc without changing XP math", () => {
  assert.match(hud, /className="home-player-hud__level-curved"/);
  assert.match(hud, /<textPath href="#home-player-level-curve" startOffset="50%">/);
  assert.match(hud, /player \? `Lvl \$\{player\.level\}`/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__level-curved/);
  assert.doesNotMatch(hud, /home-player-hud__level-pill/);
  assert.match(hud, /totalXpRequiredForPlayerLevel\(player\.level\)/);
  assert.match(hud, /data-testid="home-player-xp-track"/);
  assert.doesNotMatch(hud, /<text data-testid="home-player-total-xp"/);
});
test("deep XP curve and lower pets preserve short-phone clearance", () => {
  assert.match(hudCss, /The SVG viewBox follows the saved curve depth/);
  assert.match(hudCss, /\.home-player-hud__xp-arc-track/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__party-panel/);
  assert.match(hudCss, /bottom: calc\(10px \+ env\(safe-area-inset-bottom/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__party-panel\s*\{[^}]*pointer-events: none/s);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__slot\s*\{[^}]*pointer-events: auto/s);
});

test("Home navigation spans five columns and two rows without changing non-Home anchors", () => {
  assert.match(nav, /const \[location, navigate\] = useLocation\(\)/);
  assert.match(nav, /const isHome = location === "\/"/);
  assert.match(nav, /top: isHome \? "clamp\(108px/);
  assert.match(nav, /bottom: isHome \? undefined : 16/);
  assert.match(nav, /right: 12/);
  assert.match(nav, /data-testid="home-realm-nav-panel"/);
  assert.match(nav, /const HOME_NAV_COLUMNS = 5/);
  assert.match(nav, /const HOME_NAV_ROWS = 2/);
  assert.match(nav, /gridTemplateColumns: \x60repeat\(\$\{HOME_NAV_COLUMNS\}, minmax\(0, 1fr\)\)\x60/);
  assert.match(nav, /homeNavPosition\(index\)/);
  assert.match(nav, /aria-controls=\{isHome \? "home-realm-nav-panel" : undefined\}/);
  assert.match(nav, /aria-expanded=\{isOpen\}/);
  assert.match(nav, /if \(navHidden\) return null/);
  assert.match(nav, /setMainNavOpen\(isOpen && !navHidden\)/);
});

test("Main is first and Support stays last in the horizontal Home menu", () => {
  const css = read("client/src/components/FloatingNavHome.css");
  assert.match(nav, /const HOME_NAV_ORDER = \[/);
  assert.match(nav, /"home", "inventory", "bag", "keepers", "pethouse"/);
  assert.match(nav, /"market", "aquarium", "cards", "badges", "support"/);
  assert.match(nav, /HOME_SHORTCUT_ITEMS\.map\(item =>/);
  assert.match(nav, /data-testid=\{\x60home-shortcut-\$\{item\.id\}\x60\}/);
  assert.match(nav, /HOME_NAV_ORDER\.map\(\(id, index\) =>/);
  assert.match(nav, /gridColumn: HOME_NAV_COLUMNS, gridRow: HOME_NAV_ROWS/);
  assert.match(nav, /gridColumn: index % HOME_NAV_COLUMNS \+ 1/);
  assert.match(nav, /item\.id === "quest" && questRewardReady/);
  assert.match(nav, /showQuestReward=\{false\}/);
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
