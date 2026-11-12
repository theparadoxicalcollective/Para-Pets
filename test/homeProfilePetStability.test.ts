import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path:string)=>readFileSync(path,"utf8");
test("Home player slots remain fixed when a pet swap starts or finishes saving", () => {
  const css=read("client/src/components/HomePlayerHud.css");
  const hud=read("client/src/components/HomePlayerHud.tsx");
  assert.match(css,/grid-auto-rows: clamp\(68px, 19vw, 95px\)/);
  assert.match(css,/\.home-player-hud--avatar-home \.home-player-hud__status \{\s*position: absolute/);
  assert.match(css,/\.home-player-hud--avatar-home \.home-player-hud__slot:disabled \{\s*opacity: 1/);
  assert.match(hud,/key=\{index\}/);
  assert.match(hud,/saveTeam\(next\)/);
});
test("XP curve remains admin-only, mutable and artwork-relative", () => {
  const hud=read("client/src/components/HomePlayerHud.tsx");
  const server=read("server/routes.ts");
  assert.match(hud,/data-testid="input-home-xp-curve"/);
  assert.match(hud,/void saveXpAnchor\(\{ \.\.\.base, curveDepth: depth \}\)/);
  assert.match(hud,/viewportPointToCoverArtwork\(avatarArtworkSize, avatarBackdrop/);
  assert.match(server,/app\.put\("\/api\/admin\/settings\/home-xp-anchor", isAdmin/);
});
test("profile settings use forest greens and gold but preserve all account actions", () => {
  const p=read("client/src/components/UserProfilePanel.tsx");
  assert.match(p,/data-testid="player-settings-panel"/);
  assert.match(p,/#28513a 0%, #153625 55%, #0b241b 100%/);
  assert.match(p,/235,203,125,0\.77/);
  for(const marker of ["button-close-profile","button-profile-pic-change",
    "button-save-username","profile-time-zone-settings","button-save-password",
    "button-toggle-feedback","button-submit-feedback","button-logout",
    "button-show-delete-account","button-crop-confirm"])
    assert.ok(p.includes(marker),marker);
  const main=p.split("{/* Delete Account */}")[0];
  assert.doesNotMatch(main,/#8ab4f8|#1a0e05|#2a1808/);
});
