import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { wardrobeLayers } from "../client/src/lib/playerAvatarWardrobe";
import { coverArtworkPoint } from "../client/src/lib/artworkCoverGeometry";
import { shouldShowDesktopComingSoon } from "../client/src/lib/desktopComingSoon";

const read = (path: string) => readFileSync(path, "utf8");
const home = read("client/src/pages/HomePage.tsx");
const scene = read("client/src/components/HomeAvatarStage.tsx");
const css = read("client/src/components/HomeAvatarStage.css");
const hud = read("client/src/components/HomePlayerHud.tsx");
const hudCss = read("client/src/components/HomePlayerHud.css");
const wardrobe = read("client/src/pages/PlayerAvatarPage.tsx");
const model = read("client/src/lib/playerAvatarWardrobe.ts");

test("10 cuts over Home actor without mutating the existing Pet routes or admin stage geometry", () => {
  assert.match(home, /const AVATAR_10_HOME_CUTOVER = true/);
  assert.match(home, /<HomeAvatarStage/);
  assert.match(home, /!AVATAR_10_HOME_CUTOVER && \(<>/);
  assert.match(home, /!AVATAR_10_HOME_CUTOVER && !isOverlayActive && !showProfile && !showPetStats/);
  assert.match(home, /!AVATAR_10_HOME_CUTOVER && questGuideMode/);
  assert.match(home, /!AVATAR_10_HOME_CUTOVER && !isOverlayActive && showSpeedUp/);
  assert.match(home, /!AVATAR_10_HOME_CUTOVER && !isOverlayActive && hatchRevealing/);
  assert.match(home, /activePetGroundViewport/);
  assert.match(home, /backgroundImage: \`url\(\$\{bgImg\}\)\`/);
  assert.match(home, /<ViewportHudPortal>\s*<HomeAvatarStage/);
  assert.match(home, /<TopBar user=\{currentUser\}/);
  assert.match(home, /<HomePlayerHud/);
  assert.doesNotMatch(scene, /ActivePetPlacement|PetAnimator|MiniPetRenderer|petTemplateId|petInventoryId|clientToStage/);
});

test("new players see a gold prompt only after a successful created:false API response", () => {
  assert.match(scene, /avatar\.isPending \?/);
  assert.match(scene, /avatar\.isError \?/);
  assert.match(scene, /!created \?/);
  assert.match(scene, /const created = avatar\.data\?\.created === true/);
  assert.match(scene, /data-testid="home-design-character"/);
  assert.match(scene, /data-testid="home-avatar-character"/);
  assert.match(scene, /aria-label="Design Character — open character designer"/);
  assert.match(scene, /parts=\{base\.parts\}/);
  assert.match(scene, /clothingLayers=\{layers\}/);
  assert.match(scene, /wardrobeLayers\(avatar\.data\)/);
  assert.match(scene, /motion="idle"/);
  assert.doesNotMatch(scene, /writePlayerAvatar|\/api\/player-avatar\/create|localStorage/);
  assert.match(model, /Player avatar response was invalid/);
  assert.match(model, /typeof data\.created !== "boolean"/);
  assert.match(model, /credentials: "include", signal, cache: "no-store"/);
  assert.match(scene, /refetchOnMount: "always"/);
});

test("Home and wardrobe retain each other's navigation destinations", () => {
  assert.match(home, /onOpen=\{\(\) => navigate\("\/player-avatar\?from=home"\)\}/);
  assert.match(wardrobe, /const fromHome = new URLSearchParams\(useSearch\(\)\)\.get\("from"\) === "home"/);
  assert.match(wardrobe, /navigate\(fromHome \? "\/" : "\/bag"\)/);
  assert.match(wardrobe, /aria-label=\{fromHome \? "Back to Home" : "Back to Bag"\}/);
});

test("one saved outfit retains its separate head and leg layers", () => {
  const item = (category: "head"|"hair"|"bottom", inventoryId: string, partTypes: string[]) => ({
    category, inventoryId, shopItemId: inventoryId, name: inventoryId, imageUrl: null,
    segments: partTypes.map(partType => ({ partType, imageUrl: "/api/media/test", fit: {
      xPct:50,yPct:50,widthPct:100,pivotXPct:50,pivotYPct:50,rotationDeg:0,zIndex:1,
    }, renderPlane:"with_part" })),
  });
  const equipped = [
    item("head", "hat", ["head"]), item("hair", "hair", ["head"]),
    item("bottom", "pants", ["left_leg", "right_leg"]),
  ];
  const layers = wardrobeLayers({
    created: true, revision: 4, base: null, ownedClothing: [],
    equipped: equipped as any, unavailableEquipmentSlots: [],
  });
  assert.deepEqual(layers.map(x => x.inventoryId), ["hat", "hair", "pants"]);
  assert.equal(layers.flatMap(x=>x.segments).length, 4);
});

test("character stands at the existing artwork landmark with short-screen HUD clearance", () => {
  const point = coverArtworkPoint({width:1620,height:2160},
    {left:0,top:0,width:390,height:844}, {x:810,y:1475});
  assert.ok(point);
  assert.ok(point.y > 0 && point.y < 844);
  assert.match(scene, /landmark\.y - backdrop\.top/);
  assert.match(scene, /backdrop\.height - 228/);
  assert.match(css, /top: min\(68dvh, calc\(100dvh - 228px\)\)/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /home-avatar-gold-turn/);
  assert.match(css, /home-avatar-gold-hover/);
  assert.match(hud, /avatarHome = false/);
  assert.match(hud, /home-player-hud--avatar-home/);
  assert.match(hudCss, /home-player-hud--avatar-home/);
  assert.match(hudCss, /bottom: calc\(77px \+ env\(safe-area-inset-bottom/);
  assert.equal(shouldShowDesktopComingSoon("/", {
    userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    platform:"Win32",maxTouchPoints:0,touchFirst:false,
  }), true);
});

test("old quest Go links forward to inventory-owned actions, not a removed Pet Menu", () => {
  assert.match(home, /const destination =/);
  assert.match(home, /"pet-power-up"/);
  assert.match(home, /"pet-care"/);
  assert.match(home, /encodeURIComponent\(currentUser\.activePetId\)/);
  assert.match(home, /: "\/bag"/);
  assert.match(home, /setQuestGuideMode\("feed"\)/);
  assert.match(home, /!AVATAR_10_HOME_CUTOVER && questGuideMode/);
});
