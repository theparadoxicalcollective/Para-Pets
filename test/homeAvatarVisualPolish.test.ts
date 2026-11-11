import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { homeAvatarPosition } from "../client/src/lib/homeAvatarLayout";

const read = (path: string) => readFileSync(path, "utf8");
const topBar = read("client/src/components/TopBar.tsx");
const hud = read("client/src/components/HomePlayerHud.tsx");
const hudCss = read("client/src/components/HomePlayerHud.css");
const avatar = read("client/src/components/HomeAvatarStage.tsx");
const avatarCss = read("client/src/components/HomeAvatarStage.css");
const home = read("client/src/pages/HomePage.tsx");

test("Home keeps the profile frame but hides the duplicate nameplate only on Home", () => {
  assert.match(topBar, /data-testid="button-profile"/);
  assert.match(topBar, /\{location !== "\/" && \(/);
  assert.match(topBar, /data-testid="text-username"/);
  assert.match(home, /<TopBar user=\{currentUser\}/);
  assert.match(hud, /data-testid="home-player-name"/);
});

test("avatar Elevation stars and name\/XP are separate from the party panel and share one world anchor", () => {
  assert.match(avatar, /homeAvatarPosition\(landmark, backdrop\)/);
  assert.match(hud, /homeAvatarPosition\(avatarLandmark, avatarBackdrop\)/);
  assert.match(home, /avatarLandmark=\{activePetGroundViewport\}/);
  assert.match(home, /avatarBackdrop=\{activePetBackdropRect\}/);
  assert.match(hud, /--home-avatar-standing-y/);
  assert.match(hud, /--home-avatar-x/);
  assert.match(hudCss, /top: calc\(var\(--home-avatar-standing-y/);
  assert.match(hudCss, /height: 12px/);
  assert.match(hudCss, /\.home-player-hud--avatar-home \.home-player-hud__party-panel/);
  assert.match(avatarCss, /--home-avatar-visual-size/);
  assert.match(hud, /data-testid="home-player-empty-stars"/);
  assert.match(hud, /i < \(player\?\.stars \?\? 1\)/);
  assert.match(hud, /data-testid="home-player-total-xp"/);
  assert.doesNotMatch(hud, /petLevelPoints/);
});

test("selected party portraits show their own rarity stars without altering saved team logic", () => {
  assert.match(hud, /rarity\?: number \| null/);
  assert.match(hud, /Math\.trunc\(pet\.rarity \?\? 0\)/);
  assert.match(hud, /Math\.min\(5/);
  assert.match(hud, /home-player-hud__slot-stars/);
  assert.match(hud, /Array\.from\(\{ length: rarity \}/);
  assert.match(hudCss, /\.home-player-hud__slot-portrait/);
  assert.match(hudCss, /\.home-player-hud__slot-stars img/);
  assert.match(hud, /saveTeam\(next\)/);
  assert.match(hud, /avatarHome \? null : "Tap a portrait to edit your team"/);
});

test("phone, tablet and short-screen avatar offsets remain clamped to the same viewport artwork", () => {
  assert.deepEqual(homeAvatarPosition({ x: 195, y: 520 },
    { left: 0, top: 0, width: 390, height: 844 }), { x: 195, standingY: 520 });
  assert.deepEqual(homeAvatarPosition({ x: 417, y: 816 },
    { left: 0, top: 0, width: 834, height: 1194 }), { x: 417, standingY: 816 });
  assert.deepEqual(homeAvatarPosition({ x: 160, y: 420 },
    { left: 0, top: 0, width: 320, height: 568 }), { x: 160, standingY: 340 });
  assert.deepEqual(homeAvatarPosition(null,
    { left: 0, top: 0, width: 0, height: 0 }), { x: null, standingY: null });
  assert.match(avatarCss, /@media \(max-height: 600px\)/);
  assert.match(hudCss, /@media \(max-height: 690px\)/);
});
