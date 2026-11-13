import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOME_XP_DEFAULT_CURVE, HOME_XP_MIN_CURVE, homeXpArcGeometry } from "../shared/homeXpAnchor";

const read = (path: string) => readFileSync(path, "utf8");

test("admin can flatten the Home XP curve without changing a saved default", () => {
  const hud = read("client/src/components/HomePlayerHud.tsx");
  assert.equal(HOME_XP_MIN_CURVE, 20);
  assert.ok(homeXpArcGeometry(HOME_XP_MIN_CURVE).viewHeight < homeXpArcGeometry(HOME_XP_DEFAULT_CURVE).viewHeight);
  assert.match(hud, /min=\{HOME_XP_MIN_CURVE\} max=\{HOME_XP_MAX_CURVE\}/);
  assert.match(hud, /data-testid="input-home-xp-curve"/);
  assert.match(hud, /data-testid="button-home-edit-xp-curve"/);
  assert.doesNotMatch(hud, /button-home-adjust-xp|startXpDrag|moveXpDrag|finishXpDrag/);
});

test("Home-only overlay darkens all four edges, not the center or touch targets", () => {
  const home = read("client/src/pages/HomePage.tsx");
  assert.match(home, /data-testid="home-edge-vignette" aria-hidden="true"/);
  assert.match(home, /radial-gradient\(ellipse 66% 60% at 50% 52%, transparent 16%/);
  assert.match(home, /rgba\(1, 7, 6, 0\.92\) 100%/);
  assert.match(home, /data-testid="active-pet-background-depth"/);
  assert.match(home, /className="absolute inset-0 pointer-events-none"/);
});

test("Home pets rotate over fixed ground ovals with stars along each oval and calmer size", () => {
  const hud = read("client/src/components/HomePlayerHud.tsx");
  const css = read("client/src/components/HomePlayerHud.css");
  assert.match(hud, /mode="house" lowMemory size=\{58\}/);
  assert.match(hud, /<MiniPetRenderer petInventoryId=\{pet\.inventoryId\} animated \/>/);
  assert.match(hud, /home-player-team-ground-/);
  assert.match(css, /transform: translateY\(10px\) scale\(1\.10\)/);
  assert.match(css, /home-player-hud__slot--position-2 \.home-player-hud__pet-renderer/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot-ground::before/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot::before \{ content: none; \}/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot-stars \{[\s\S]*?bottom: -4%/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__level-curved \{[\s\S]*?font: 700 17px Georgia, serif/);
  assert.match(hud, /preciseLowMemoryFit=\{avatarHome\}/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__mini-companion \{[\s\S]*?width: 38%/);
  assert.doesNotMatch(css, /width: min\(100%, clamp\(58px, 17vw, 68px\)\)/);
});

test("Home quick icons reveal labels only once selected, while routes reuse their delay", () => {
  const nav = read("client/src/components/FloatingNav.tsx");
  assert.match(nav, /activeHomeShortcut === item\.id && \(/);
  assert.match(nav, /onClick=\{\(\) => handleHomeShortcut\(item\.id\)\}/);
  assert.match(nav, /setActiveHomeShortcut\(id\);\s*handleLeft\(id\)/);
  assert.match(nav, /setTimeout\(\(\) => navigate\("\/map"\), NAV_DELAY\)/);
  assert.match(nav, /setTimeout\(\(\) => navigate\("\/pvp"\), NAV_DELAY\)/);
  assert.match(nav, /!isHome \|\| isOpen \|\| showQuest/);
});

test("level follows above the XP rim across flat, default, and deep admin curves", () => {
  for (const depth of [HOME_XP_MIN_CURVE, HOME_XP_DEFAULT_CURVE, 220]) {
    const { levelPath, path } = homeXpArcGeometry(depth);
    const matched = levelPath.match(/^M 100 ([\d.]+) Q 160 ([\d.]+) 220 ([\d.]+)$/);
    assert.ok(matched && path.includes(`C 76 ${depth} 244 ${depth}`));
    const labelMidpoint = (+matched[1] + +matched[2]) / 2;
    const barMidpoint = (14 + 3 * depth) / 4;
    assert.ok(labelMidpoint < barMidpoint - 5,
      "Lvl label should sit just above, never below, the bar at depth " + depth);
    assert.ok(barMidpoint - labelMidpoint < 25,
      "Lvl should stay visually close to the XP rim at depth " + depth);
  }
});
