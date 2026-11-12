import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOME_XP_DEFAULT_CURVE, HOME_XP_MIN_CURVE, HOME_XP_MAX_CURVE, homeXpArcGeometry, isHomeXpAnchor } from "../shared/homeXpAnchor";

const read = (path: string) => readFileSync(path, "utf8");
test("Home XP artwork anchors reject invalid coordinates", () => {
  assert.equal(isHomeXpAnchor({xPct:0.5,yPct:0.68}), true);
  assert.equal(isHomeXpAnchor({xPct:.5,yPct:.7,curveDepth:HOME_XP_DEFAULT_CURVE}),true);
  assert.equal(isHomeXpAnchor({xPct:.5,yPct:.7,curveDepth:HOME_XP_MIN_CURVE}),true);
  assert.equal(isHomeXpAnchor({xPct:.5,yPct:.7,curveDepth:HOME_XP_MAX_CURVE}),true);
  assert.equal(isHomeXpAnchor({xPct:.5,yPct:.7,curveDepth:19}),false);
  assert.equal(isHomeXpAnchor({xPct:.5,yPct:.7,curveDepth:221}),false);
  assert.equal(isHomeXpAnchor({xPct:.5,yPct:.7,curveDepth:NaN}),false);
  assert.equal(isHomeXpAnchor({xPct:0,yPct:1}), true);
  for (const bad of [undefined, null, [], {}, {xPct:-1,yPct:0.5},
    {xPct:0.5,yPct:1.5}, {xPct:Infinity,yPct:0.5}, {xPct:"0.5",yPct:0.5}])
    assert.equal(isHomeXpAnchor(bad), false);
});
test("admin-only artwork anchor is stored using existing game settings", () => {
  const api = read("server/routes.ts");
  const hud = read("client/src/components/HomePlayerHud.tsx");
  const home = read("client/src/pages/HomePage.tsx");
  assert.match(api, /app\.put\("\/api\/admin\/settings\/home-xp-anchor", isAdmin/);
  assert.match(api, /storage\.setGameSetting\(HOME_XP_ANCHOR_KEY/);
  assert.match(hud, /viewportPointToCoverArtwork\(avatarArtworkSize, avatarBackdrop/);
  assert.match(hud, /coverArtworkPoint\(avatarArtworkSize, avatarBackdrop/);
  assert.match(hud, /onPointerDown=\{startXpDrag\}/);
  assert.match(hud, /if \(!avatarHome \|\| !isAdmin \|\| !movingXp/);
  assert.match(home, /isAdmin=\{currentUser\.isAdmin === true\}/);
});

test("rounded U geometry keeps rim and level label aligned while changing curve", () => {
  const shallow=homeXpArcGeometry(HOME_XP_MIN_CURVE);
  const deep=homeXpArcGeometry(HOME_XP_MAX_CURVE);
  assert.equal(HOME_XP_MIN_CURVE, 20);
  assert.match(shallow.path, /C 76 20 244 20/);
  assert.ok(shallow.viewHeight < homeXpArcGeometry(HOME_XP_DEFAULT_CURVE).viewHeight);
  assert.match(shallow.path,/^M 12 14 C 76 /);
  assert.match(deep.path,/ 244 220 308 14$/);
  assert.ok(deep.viewHeight>shallow.viewHeight);
  assert.notEqual(deep.levelPath,shallow.levelPath);
});
