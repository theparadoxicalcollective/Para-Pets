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

test("Home enlarges both player and companion stars while keeping their positions", () => {
  assert.match(homeCss, /width: clamp\(41px, 11vw, 55px\)/);
  assert.match(homeCss, /home-avatar-visual-size, 220px\) - 24px/);
  assert.match(homeHud, /avatarHome \? 31 : 14/);
  assert.match(homeHud, /i < \(player\?\.stars \?\? 1\)/);
  assert.match(homeHud, /data-testid=\{\`home-player-team-stars-\$\{index \+ 1\}\`\}/);
});

test("Home XP forms a more semicircular arc with accessible proportional progress", () => {
  assert.match(homeHud, /className="home-player-hud__xp-arc"/);
  assert.match(homeHud, /d=\{xpArc\.path\}/);
  assert.match(homeHud, /xpArc\.viewHeight/);
  assert.match(homeHud, /className="home-player-hud__level-curved"/);
  assert.match(homeHud, /<textPath href="#home-player-level-curve" startOffset="50%">/);
  assert.doesNotMatch(homeHud, /<text data-testid="home-player-total-xp"/);
  assert.doesNotMatch(homeHud, /home-player-hud__level-pill/);
  assert.match(homeHud, /strokeDashoffset=\{100 - xpFillPct\}/);
  assert.match(homeHud, /xpFillPct !== null && xpFillPct > 0/);
  assert.match(homeHud, /className="home-player-hud__xp-arc-rim"/);
  assert.match(homeCss, /\.home-player-hud__xp-arc-track \{ stroke: #123b27/);
  assert.match(homeCss, /\.home-player-hud__xp-arc-rim \{\s*stroke: #eed28e/);
  assert.match(homeHud, /xpEarnedThisLevel \/ xpNeededThisLevel/);
  assert.match(homeHud, /pathLength=\{100\}/);
  assert.match(homeHud, /role="progressbar"/);
  assert.match(homeHud, /aria-valuenow=\{xpFillPct === null/);
  assert.match(homeHud, /totalXpRequiredForPlayerLevel\(player\.level\)/);
  assert.match(homeHud, /: <span aria-hidden="true" style=\{xpFillPct === null/);
  assert.match(homeCss, /--home-xp-art-width, 220px/);
  assert.match(homeCss, /drop-shadow\(0 0 5px rgba\(255, 226, 140, \.75\)\)/);
});

test("pet team keeps five editable hit targets but no circular frames or helper copy", () => {
  assert.match(homeHud, /Array\.from\(\{ length: PLAYER_PET_TEAM_MAX \}/);
  assert.match(homeHud, /setPickerSlot\(index\)/);
  assert.match(homeHud, /suppressTeamClick\.current/);
  assert.match(homeHud, /saveTeam\(next\)/);
  assert.match(homeHud, /src=\{emptyPetIcon\}/);
  assert.match(homeHud, /\{id \? "!" : "\+"\}/);
  assert.match(homeCss, /home-player-hud__slot::before/);
  assert.match(homeCss, /border: 1px solid rgba\(204, 181, 115, \.35\)/);
  assert.match(homeCss, /home-player-hud__slot--position-0/);
  assert.match(homeCss, /home-player-hud__slot--position-1/);
  assert.match(homeCss, /home-player-hud__slot--position-2/);
  assert.match(homeCss, /home-player-hud__slot--position-3/);
  assert.match(homeCss, /home-player-hud__slot--position-4/);
  assert.match(homeCss, /border-radius: 50%/);
  assert.match(homeCss, /border: 0;\s*border-radius: 0;\s*background: none/);
  assert.match(homeHud, /avatarHome \? null : "Tap a portrait to edit your team"/);
});

test("compact blinking pet thumbnails retain equipped adornments and mini pets", () => {
  assert.match(homeHud, /<PetAnimator petTemplateId=\{pet\.petTemplateId\}/);
  assert.match(homeHud, /petInventoryId=\{pet\.inventoryId\}/);
  assert.match(homeHud, /mode="house" lowMemory size=\{58\}/);
  assert.match(homeHud, /<MiniPetRenderer petInventoryId=\{pet\.inventoryId\} animated/);
  assert.match(homeHud, /home-player-hud__fallback-pet/);
  assert.match(homeCss, /home-player-hud__pet-renderer/);
  assert.match(homeCss, /home-player-hud__mini-companion/);
  assert.match(homeCss, /:has\(\.home-player-hud__pet-renderer \[data-testid="pet-animator"\] img\)/);
  assert.match(homeCss, /drop-shadow\(1px 0 0/);
  const miniCss = homeCss.split("\n.home-player-hud__mini-companion {")[1].split("}")[0];
  assert.doesNotMatch(miniCss, /drop-shadow\(1px 0 0|drop-shadow\(-1px 0 0/);
  assert.match(miniCss, /drop-shadow\(0 2px 2px rgba/);
  assert.match(homeCss, /transform: translateY\(4px\) scale\(1\.10\)/);
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
  assert.match(nav, /const HOME_NAV_ROWS = 2/);
  assert.match(nav, /const HOME_NAV_COLUMNS = 5/);
});


test("Home promotes Map, Quest and PvP outside the reordered navigation", () => {
  const menu = nav.match(/const HOME_NAV_ORDER = \[([\s\S]*?)\] as const;/)?.[1];
  assert.ok(menu, "Home menu order is defined");
  const order = [...menu.matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, [
    "home", "inventory", "bag", "keepers", "pethouse",
    "market", "aquarium", "cards", "badges", "support",
  ]);
  assert.equal(order.at(-1), "support");
  for (const route of ["map", "quest", "pvp"]) {
    assert.ok(!order.includes(route), route + " no longer clutters Main Navigation");
    assert.match(nav, new RegExp('id: "' + route + '"'));
    assert.match(nav, new RegExp('home-shortcut-'));
  }
  assert.match(nav, /HOME_SHORTCUT_ITEMS\.map\(item =>/);
  assert.match(nav, /onClick=\{\(\) => handleHomeShortcut\(item\.id\)\}/);
  assert.match(nav, /questRewardReady && \(/);
  assert.match(nav, /questRewardReady && !isHome && !isOpen/);
  assert.match(navCss, /\.home-realm-shortcuts \{/);
  assert.match(navCss, /\.home-realm-shortcuts__tile:focus-visible/);
  assert.match(navCss, /min-height: 44px/);
});

test("non-Home navigation keeps existing World Map and quest pointers", () => {
  const left = nav.split("const LEFT_ITEMS = [")[1].split("];")[0];
  const right = nav.split("const RIGHT_ITEMS = [")[1].split("];")[0];
  for (const id of ["map", "quest", "pvp"]) {
    assert.match(left + right, new RegExp('id: "' + id + '"'));
  }
  assert.match(nav, /!isHome && LEFT_ITEMS\.map/);
  assert.match(nav, /if \(id === "map"\)/);
  assert.match(nav, /if \(id === "quest"\)/);
  assert.match(nav, /if \(id === "pvp"\)/);
  const guide=readFileSync("client/src/components/LonelleQuestOverlay.tsx","utf8");
  assert.match(guide, /home-shortcut-map/);
  assert.match(guide, /mapTarget/);
});
