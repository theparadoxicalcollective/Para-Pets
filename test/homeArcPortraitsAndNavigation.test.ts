import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const homeHud = read("client/src/components/HomePlayerHud.tsx");
const homeCss = read("client/src/components/HomePlayerHud.css");
const nav = read("client/src/components/FloatingNav.tsx");
const navCss = read("client/src/components/FloatingNavHome.css");
const topBar = read("client/src/components/TopBar.tsx");
const home = read("client/src/pages/HomePage.tsx");

test("Home enlarges and raises the avatar's five Elevation stars, not the pet rarities", () => {
  assert.match(homeCss, /width: clamp\(37px, 10vw, 51px\)/);
  assert.match(homeCss, /home-avatar-visual-size, 220px\) - 24px/);
  assert.match(homeHud, /avatarHome \? 31 : 14/);
  assert.match(homeHud, /i < \(player\?\.stars \?\? 1\)/);
  assert.match(homeHud, /data-testid=\{\`home-player-team-stars-\$\{index \+ 1\}\`\}/);
});

test("Home XP forms a more semicircular arc with accessible proportional progress", () => {
  assert.match(homeHud, /className="home-player-hud__xp-arc"/);
  assert.match(homeHud, /d="M 22 8 Q 160 112 298 8"/);
  assert.match(homeHud, /strokeDashoffset=\{100 - xpFillPct\}/);
  assert.match(homeHud, /xpFillPct !== null && xpFillPct > 0/);
  assert.match(homeHud, /className="home-player-hud__xp-arc-rim"/);
  assert.match(homeCss, /\.home-player-hud__xp-arc-track \{\s*stroke: #122b1d/);
  assert.match(homeCss, /\.home-player-hud__xp-arc-rim \{\s*stroke: rgba\(210, 181, 113, \.6\)/);
  assert.match(homeHud, /xpEarnedThisLevel\.toLocaleString\(\)/);
  assert.match(homeHud, /pathLength=\{100\}/);
  assert.match(homeHud, /role="progressbar"/);
  assert.match(homeHud, /aria-valuenow=\{xpFillPct === null/);
  assert.match(homeHud, /totalXpRequiredForPlayerLevel\(player\.level\)/);
  assert.match(homeHud, /: <span aria-hidden="true" style=\{xpFillPct === null/);
  assert.match(homeCss, /width: min\(calc\(100vw - 108px\), 265px\)/);
});

test("pet team keeps five editable hit targets but no circular frames or helper copy", () => {
  assert.match(homeHud, /Array\.from\(\{ length: PLAYER_PET_TEAM_MAX \}/);
  assert.match(homeHud, /onClick=\{\(\) => setPickerSlot\(index\)\}/);
  assert.match(homeHud, /saveTeam\(next\)/);
  assert.match(homeHud, /src=\{emptyPetIcon\}/);
  assert.match(homeHud, /\{id \? "!" : "\+"\}/);
  assert.match(homeCss, /home-player-hud__slot::before/);
  assert.match(homeCss, /border: 1px solid rgba\(204, 181, 115, \.32\)/);
  assert.match(homeCss, /translateY\(-24px\)/);
  assert.match(homeCss, /translateY\(-9px\)/);
  assert.match(homeCss, /translateY\(5px\)/);
  assert.match(homeCss, /border-radius: 50%/);
  assert.match(homeCss, /home-player-hud__slot:nth-child\(1\)/);
  assert.match(homeCss, /border: 0;\s*border-radius: 0;\s*background: none/);
  assert.match(homeHud, /avatarHome \? null : "Tap a portrait to edit your team"/);
});

test("compact blinking pet thumbnails retain equipped adornments and mini pets", () => {
  assert.match(homeHud, /<PetAnimator petTemplateId=\{pet\.petTemplateId\}/);
  assert.match(homeHud, /petInventoryId=\{pet\.inventoryId\}/);
  assert.match(homeHud, /mode="house" lowMemory size=\{58\}/);
  assert.match(homeHud, /<MiniPetRenderer petInventoryId=\{pet\.inventoryId\} animated=\{false\}/);
  assert.match(homeHud, /home-player-hud__fallback-pet/);
  assert.match(homeCss, /home-player-hud__pet-renderer/);
  assert.match(homeCss, /home-player-hud__mini-companion/);
  assert.match(homeCss, /:has\(\.home-player-hud__pet-renderer \[data-testid="pet-animator"\] img\)/);
  assert.match(homeCss, /drop-shadow\(1px 0 0/);
});

test("Home keeps username above smaller Watcher without changing its tap target or messages", () => {
  assert.ok(topBar.indexOf('data-testid="home-header-player-name"') <
    topBar.indexOf('data-testid="home-header-watcher"'));
  assert.match(home, /data-testid="button-open-world-chat"/);
  assert.match(home, /data-testid="home-watcher-art"/);
  assert.match(home, /width: 44,\s*height: 44/);
  assert.match(home, /clamp\(32px, 4\.3vh, 36px\)/);
  assert.match(home, /data-testid="watcher-announcement-bubble"/);
  assert.match(topBar, /location === "\/" \? 44 : 46/);
  assert.match(topBar, /location === "\/" \? 30 : 43/);
  assert.match(topBar, /onClick=\{\(\) => navigate\("\/coins"\)\}/);
});

test("only Home navigation uses a translucent forest panel with outlined icon silhouettes", () => {
  assert.match(nav, /const HOME_NAV_ORDER = \[/);
  assert.match(nav, /!isHome && LEFT_ITEMS\.map/);
  assert.match(nav, /!isHome && RIGHT_ITEMS\.map/);
  assert.match(nav, /data-testid="home-realm-nav-panel"/);
  assert.match(nav, /homeNavPosition\(index\)/);
  assert.match(navCss, /background: linear-gradient\(155deg, rgba\(21, 63, 40, \.52\)/);
  assert.match(navCss, /\.home-realm-nav__icon \{/);
  assert.match(navCss, /border: 0;\s*border-radius: 0;\s*background: transparent/);
  assert.match(navCss, /filter: drop-shadow\(1px 0 0/);
  assert.match(navCss, /\.home-realm-nav__tile:focus-visible/);
  assert.match(nav, /const HOME_NAV_ROWS = 3/);
  assert.match(nav, /const HOME_NAV_COLUMNS = 5/);
});
