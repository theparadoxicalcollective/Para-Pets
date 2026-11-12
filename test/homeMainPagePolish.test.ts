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
  assert.match(home, /radial-gradient\(ellipse 74% 67% at 50% 50%, transparent 37%/);
  assert.match(home, /className="absolute inset-0 pointer-events-none"/);
});

test("Home companions share their ground circles, keep stars off faces and animate", () => {
  const hud = read("client/src/components/HomePlayerHud.tsx");
  const css = read("client/src/components/HomePlayerHud.css");
  assert.match(hud, /mode="idle" lowMemory size=\{58\}/);
  assert.match(hud, /<MiniPetRenderer petInventoryId=\{pet\.inventoryId\} animated \/>/);
  assert.match(css, /transform: translateY\(6px\) scale\(1\.17\)/);
  assert.match(css, /home-player-hud__slot--position-2 \.home-player-hud__pet-renderer/);
  assert.match(css, /home-player-hud__slot--position-2 \.home-player-hud__slot-stars \{ top: -48px; \}/);
  assert.match(css, /\.home-player-hud__mini-companion \{[\s\S]*?width: 48%/);
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
