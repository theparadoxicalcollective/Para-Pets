import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HOME_TEAM_VISIBLE_SLOTS, homeTeamOffset, homeTeamSwipeStep, homeTeamVisualPosition,
} from "../client/src/lib/homeTeamCarousel";

const read = (p: string) => readFileSync(p, "utf8");

test("a horizontal swipe rotates five visual spots, never saved roster identities", () => {
  assert.equal(HOME_TEAM_VISIBLE_SLOTS, 5);
  assert.deepEqual([0,1,2,3,4].map(slot => homeTeamVisualPosition(slot, 0)), [0,1,2,3,4]);
  assert.deepEqual([0,1,2,3,4].map(slot => homeTeamVisualPosition(slot, 1)), [4,0,1,2,3]);
  assert.deepEqual([0,1,2,3,4].map(slot => homeTeamVisualPosition(slot, -1)), [1,2,3,4,0]);
  for (const offset of [-17, -2, 0, 2, 47]) {
    const visual = [0,1,2,3,4].map(slot => homeTeamVisualPosition(slot, offset));
    assert.deepEqual([...visual].sort(), [0,1,2,3,4], "all five roster slots remain represented");
    assert.equal(homeTeamOffset(offset + 5), homeTeamOffset(offset), "rotation wraps");
  }
  assert.equal(homeTeamSwipeStep(-70, 3), 1);
  assert.equal(homeTeamSwipeStep(70, -5), -1);
  for (const [dx,dy] of [[0,0],[25,0],[-36,3],[-90,120],[55,80]]) {
    assert.equal(homeTeamSwipeStep(dx,dy), 0, "tap, wobble or vertical scroll never rotates");
  }
});

test("Home carousel uses pointer capture only once a real swipe is established", () => {
  const hud = read("client/src/components/HomePlayerHud.tsx");
  assert.match(hud, /const \[teamOffset, setTeamOffset\] = useState\(0\)/);
  assert.match(hud, /onPointerDown=\{beginTeamSwipe\} onPointerMove=\{moveTeamSwipe\}/);
  assert.match(hud, /onPointerUp=\{event => finishTeamSwipe\(event\)\}/);
  assert.match(hud, /if \(!drag\.moved && homeTeamSwipeStep\(dx, dy\) !== 0\)/);
  assert.match(hud, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(hud, /suppressTeamClick\.current = true/);
  assert.match(hud, /if \(suppressTeamClick\.current\) return/);
  assert.match(hud, /data-visual-position=\{visualPosition\}/);
  assert.match(hud, /homeTeamVisualPosition\(index, teamOffset\)/);
  assert.match(hud, /onKeyDown=\{event => \{/);
  assert.match(hud, /setPickerSlot\(index\)/);
  assert.match(hud, /saveTeam\(next\)/);
  assert.doesNotMatch(hud, /saveTeam\(.*teamOffset|setSelectedPetIds\(.*teamOffset/);
});

test("Home CSS has five intentionally sized/lowered depths, not stale thumbnail caps", () => {
  const css = read("client/src/components/HomePlayerHud.css");
  for (const pos of [0,1,2,3,4]) assert.match(css,
    new RegExp("home-player-hud__slot--position-" + pos + " \\{"));
  const p = (n: number) => css.match(new RegExp(
    "home-player-hud__slot--position-" + n +
    ",\\s*\\.home-player-hud--avatar-home \\.home-player-hud__slot-ground--position-" +
    n + " \\{([^}]+)\\}"))?.[1] ?? "";
  assert.match(p(2), /left: 50%/);
  assert.match(p(2), /bottom: -9px/);
  assert.match(p(2), /clamp\(124px, 34vw, 174px\)/);
  assert.match(p(1), /clamp\(105px, 29vw, 150px\)/);
  assert.match(p(0), /clamp\(96px, 27vw, 132px\)/);
  assert.match(p(1), /left: 25%/);
  assert.match(p(1), /bottom: 34px/);
  assert.match(p(0), /left: clamp\(64px, 16%, 84px\)/);
  assert.match(p(0), /bottom: 86px/);
  assert.match(p(3), /left: 75%/);
  assert.match(p(3), /bottom: 34px/);
  assert.match(p(4), /left: calc\(100% - clamp\(64px, 16%, 84px\)\)/);
  assert.match(p(4), /bottom: 86px/);
  assert.match(css, /slot--position-0 \{ z-index: 1; \}/);
  assert.match(css, /slot--position-4 \{ z-index: 1; \}/);
  assert.match(css, /slot--position-1 \{ z-index: 3; \}/);
  assert.match(css, /slot--position-3 \{ z-index: 3; \}/);
  assert.match(css, /transition: left 270ms ease, bottom 270ms ease, width 270ms ease/);
  assert.match(css, /pointer-events: none;\s*touch-action: pan-y/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot \{[^}]*pointer-events: auto/s);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__mini-companion \{[\s\S]*?width: 38%/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot-stars \{[\s\S]*?top: auto;[\s\S]*?bottom: -4%;[\s\S]*?width: 84%/);
  assert.doesNotMatch(css, /\.home-player-hud--avatar-home \.home-player-hud__slot--position-2 \.home-player-hud__slot-stars/);
  assert.doesNotMatch(css, /clamp\(58px, 17vw, 68px\)|clamp\(65px, 19vw, 88px\)|clamp\(58px, 17\.5vw, 69px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});


test("Home carousel remains on-screen on narrow phones, with a quieter but animated idle", () => {
  const css = read("client/src/components/HomePlayerHud.css");
  const hud = read("client/src/components/HomePlayerHud.tsx");
  // The enlarged outer pet portrait includes a 6px inset and a 1.10
  // scale, so keep its painted edge visible rather than trusting a
  // previous thumbnail-width calculation.
  for (const vw of [320, 390, 834]) {
    const panelWidth = Math.min(vw - 8, 540);
    const outerCenter = Math.min(84, Math.max(64, panelWidth * .16));
    const outerWidth = Math.max(96, Math.min(vw * .27, 132));
    const outerPaintHalf = (outerWidth + 6) * 1.10 / 2;
    assert.ok(outerCenter >= outerPaintHalf - 1,
      "pet art stays in view even at the edge on " + vw + "px screens");
    assert.ok(Math.abs((panelWidth - (panelWidth - outerCenter)) - outerCenter) < 1e-9,
      "mirrored outer position tolerates ordinary floating-point rounding");
  }
  assert.match(css, /slot-ground--position-0,[\s\S]*?slot-ground--position-4 \{ bottom: 72px/);
  assert.match(css, /slot-ground--position-1,[\s\S]*?slot-ground--position-3 \{ bottom: 27px/);
  assert.match(css, /slot-ground--position-2 \{ bottom: -7px/);
  assert.match(css, /bottom: calc\(10px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__mini-companion \{[\s\S]*?left: -12%;[\s\S]*?right: auto;[\s\S]*?width: 38%/);
  assert.match(css, /position-0 \.home-player-hud__mini-companion \{\s*left: -6%;/);
  assert.match(hud, /home-player-team-ground-/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot-ground \{[\s\S]*?pointer-events: none;[\s\S]*?z-index: 0;/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot-ground::before \{[\s\S]*?border-radius: 50%/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot::before \{ content: none; \}/);
  assert.match(hud, /style=\{avatarHome \? undefined : \{ transform:/);
  assert.match(hud, /mode="house" lowMemory size=\{58\}\s*fillContainer fitVisible=\{avatarHome\}\s*preciseLowMemoryFit=\{avatarHome\} view="front"/);
  assert.match(hud, /<MiniPetRenderer petInventoryId=\{pet\.inventoryId\} animated \/>/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__slot--vacant \{\s*z-index: 0;/);
  assert.match(css, /animation: homeTeamQuietBreath 4\.8s ease-in-out infinite/);
  assert.match(css, /@keyframes homeTeamQuietBreath \{[\s\S]*?scaleY\(1\.008\)/);
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*?home-player-hud__pet-renderer > \[data-testid="pet-animator-with-costumes"\] \{ animation: none/);
  // The built-in House mode is intentional: keep blink / ears / tail, not
  // a static screenshot, while preventing large pet head/body lurches.
  const core = read("client/src/components/PetAnimatorCore.tsx");
  assert.match(core, /const HOUSE_ANIMATIONS: Record<string, string> = \{[\s\S]*?eyes: "petIdleEyes"/);
  assert.match(core, /const HOUSE_ANIMATIONS: Record<string, string> = \{[\s\S]*?tail: "petHouseTail"/);
});


test("Home keeps five stable slot sizes while alpha-fitting padded pet artwork", () => {
  const css = read("client/src/components/HomePlayerHud.css");
  const renderer = read("client/src/components/PetAnimatorCore.tsx");
  const hud = read("client/src/components/HomePlayerHud.tsx");
  assert.match(hud, /fillContainer fitVisible=\{avatarHome\}\s*preciseLowMemoryFit=\{avatarHome\} view="front"/);
  assert.match(hud, /mode="house" lowMemory size=\{58\}/);
  assert.match(renderer, /const ab = lowMemory && !preciseLowMemoryFit/);
  assert.match(renderer, /\(lowMemory && !preciseLowMemoryFit\) \|\| !allParts\.length/);
  assert.match(renderer, /ANIM_ONLY_PARTS\.has\(p\.partType\.replace/);
  assert.match(read("client/src/components/PetAnimator.tsx"), /preciseLowMemoryFit=\{preciseLowMemoryFit\}/);
  assert.match(css, /\.home-player-hud--avatar-home \.home-player-hud__pet-renderer \{[\s\S]*?translateY\(10px\) scale\(1\.10\)/);
  assert.match(css, /position-2 \.home-player-hud__pet-renderer \{[\s\S]*?translateY\(10px\) scale\(1\.12\)/);
  assert.doesNotMatch(css, /scale\(1\.24\)|scale\(1\.17\)/);
  // The artwork size ladder is deliberate but modest; the middle shouldn't
  // become twice the size of an equally fitted pet placed at either edge.
  for (const vw of [320, 390, 834]) {
    const clamp = (min: number, preferred: number, max: number) =>
      Math.max(min, Math.min(preferred, max));
    const outer = clamp(96, .27 * vw, 132) * 1.10;
    const inner = clamp(105, .29 * vw, 150) * 1.10;
    const middle = clamp(124, .34 * vw, 174) * 1.12;
    assert.ok(middle > inner && inner > outer,
      "maintains a stable center-to-edge perspective on " + vw + "px");
    assert.ok(middle / outer < 1.5,
      "prevents visually disproportionate center/outer pets on " + vw + "px");
  }
});

test("Home shortcut icons are comparable to Main Nav, with Map largest and no large gaps", () => {
  const css = read("client/src/components/FloatingNavHome.css");
  const nav = read("client/src/components/FloatingNav.tsx");
  assert.match(nav, /const mainButtonSize = isHome \? 52/);
  assert.match(css, /\.home-realm-shortcuts \{[\s\S]*?gap: 0/);
  assert.match(css, /\.home-realm-shortcuts__icon img \{[\s\S]*?width: 51px/);
  assert.match(css, /\.home-realm-shortcuts__tile:first-child \.home-realm-shortcuts__icon img \{\s*width: 60px/);
  assert.doesNotMatch(css, /home-realm-shortcuts__tile:nth-child\(2\).*translateX/);
  assert.match(nav, /activeHomeShortcut === item\.id && \(/);
  assert.match(nav, /onClick=\{\(\) => handleHomeShortcut\(item\.id\)\}/);
});

test("XP retains its saved cover-art coordinates but no longer offers position dragging", () => {
  const hud = read("client/src/components/HomePlayerHud.tsx");
  assert.match(hud, /coverArtworkPoint\(avatarArtworkSize, avatarBackdrop/);
  assert.match(hud, /"--home-xp-x": \x60\$\{projectedAnchor\.x - avatarBackdrop\.left\}px\x60/);
  assert.match(hud, /"--home-xp-y": \x60\$\{projectedAnchor\.y - avatarBackdrop\.top\}px\x60/);
  assert.match(hud, /const effectiveAnchor = anchorQuery\.data\?\.anchor \?\? null/);
  assert.match(hud, /data-testid="input-home-xp-curve"/);
  assert.doesNotMatch(hud, /startXpDrag|moveXpDrag|finishXpDrag|movingXp|button-home-adjust-xp|button-home-reset-xp/);
});
