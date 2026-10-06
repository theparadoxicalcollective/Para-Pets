import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("owner and visitor outdoor Homes opt into the shared viewport-scene camera", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /import ViewportScenePortal from "@\/components\/ViewportScenePortal"/);
  assert.match(visitor, /import ViewportScenePortal from "@\/components\/ViewportScenePortal"/);
  assert.match(owner, /<ViewportScenePortal enabled=\{!homeOutdoorCameraBlocked\}>/);
  assert.match(visitor, /<ViewportScenePortal enabled=\{!visitorOutdoorCameraBlocked\}>/);
  assert.match(owner, /data-testid="pet-home-stage"/);
  assert.match(visitor, /data-testid="visit-pet-home-stage"/);
});


test("persistent Pet Home controls use the device HUD above the expanded scene on non-390 phones", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /import ViewportHudPortal from "@\/components\/ViewportHudPortal"/);
  }

  const ownerSceneEnd = owner.indexOf("</ViewportScenePortal>");
  const ownerHudStart = owner.indexOf("<ViewportHudPortal>", ownerSceneEnd);
  const ownerInventory = owner.indexOf('data-testid="pet-home-inventory-hud"', ownerHudStart);
  const ownerHudEnd = owner.indexOf("</ViewportHudPortal>", ownerHudStart);
  assert.ok(ownerSceneEnd >= 0);
  assert.ok(ownerHudStart > ownerSceneEnd);
  assert.ok(ownerInventory > ownerHudStart && ownerInventory < ownerHudEnd);

  const visitorSceneEnd = visitor.indexOf("</ViewportScenePortal>");
  const visitorHudStart = visitor.indexOf("<ViewportHudPortal>", visitorSceneEnd);
  const visitorHud = visitor.indexOf('data-testid="visit-pet-home-hud"', visitorHudStart);
  const visitorHudEnd = visitor.indexOf("</ViewportHudPortal>", visitorHudStart);
  assert.ok(visitorSceneEnd >= 0);
  assert.ok(visitorHudStart > visitorSceneEnd);
  assert.ok(visitorHud > visitorHudStart && visitorHud < visitorHudEnd);

  assert.match(owner, /data-testid=\{\`button-\$\{key\}-inventory\`\}/);
  assert.match(visitor, /data-testid="button-back-visit"/);
});

test("outdoor camera measurement uses the expanded scene element without changing image-space placement", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /const w = container\.offsetWidth/);
    assert.match(source, /const h = container\.offsetHeight/);
    assert.match(source, /const imgW = h \* bgAspect/);
    assert.match(source, /setPanX\(centeredHomeCameraPanX\(w, imgW\)\)/);
    assert.match(source, /clampHomeCameraPanX\(drag\.startPanX \+ panDelta, w, imgW\)/);
  }

  assert.match(owner, /left = panX \+ xPct \* imgWidth/);
  assert.match(owner, /top = yPct \* containerH/);
  assert.match(owner, /left = panX \+ item\.xPct \* imgWidth/);
  assert.match(owner, /top = item\.yPct \* containerH/);
  assert.match(visitor, /left: panX \+ xPct \* imgWidth/);
  assert.match(visitor, /top: yPct \* containerH/);
  assert.match(visitor, /left: panX \+ item\.xPct \* imgWidth/);
  assert.match(visitor, /top: item\.yPct \* containerH/);
});

test("owner drag/drop converts client input through the active Home scene element", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /const dropElement = interior\?\.element \?\? container/);
  assert.match(owner, /clientPointInStageElement\(dropElement, e\.clientX, e\.clientY\)/);
  assert.match(owner, /\(localX - panX\) \/ imgWidth/);
  assert.match(owner, /localY \/ containerH/);
  assert.match(owner, /\(localX - interior\.panX\) \/ interior\.imgWidth/);
  assert.match(owner, /localY \/ interior\.containerH/);
  assert.match(owner, /drag\.startXPct \+ clientDeltaToStage\(e\.clientX - drag\.startPointerX, 0\)\.x \/ imgWidth/);
  assert.match(owner, /drag\.startYPct \+ clientDeltaToStage\(0, e\.clientY - drag\.startPointerY\)\.y \/ containerH/);
});

test("Home bundle buildings remain authored percentages inside the real background image", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  for (const source of [owner, visitor]) {
    assert.match(source, /left: `\$\{b\.posX\}%`/);
    assert.match(source, /top: `\$\{b\.posY\}%`/);
    assert.match(source, /left: `\$\{panX\}px`/);
    assert.match(source, /width: imgWidth/);
  }
});

test("extra Home camera area follows current night darkness without changing the authored image", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /data-testid="pet-home-camera-extension-darkness"/);
  assert.match(owner, /outdoorLighting\.darkness\) \/ 100/);
  assert.match(visitor, /data-testid="visit-pet-home-camera-extension-darkness"/);
  assert.match(visitor, /outdoorLighting\.darkness \/ 100/);

  for (const source of [owner, visitor]) {
    assert.match(source, /height: "100%"/);
    assert.match(source, /width: "auto"/);
    assert.match(source, /maxWidth: "none"/);
    assert.doesNotMatch(source, /backgroundSize:\s*"100% 100%"/);
  }
});



test("owner outdoor Home uses a blurred camera extension instead of a hard tablet seam", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  assert.match(owner, /data-testid="pet-home-outdoor-camera-extension"/);
  assert.match(owner, /scale-110 object-cover opacity-45 blur-md/);
  assert.match(owner, /src=\{bgUrl\}/);
  assert.match(owner, /style=\{\{ zIndex: 0 \}\}/);
});

test("owner outdoor camera stays expanded for HUD inventory and modal UI", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  const blockedStart = owner.indexOf("const homeOutdoorCameraBlocked = Boolean(");
  const blockedEnd = owner.indexOf(");", blockedStart);
  const blocked = owner.slice(blockedStart, blockedEnd + 2);

  assert.match(blocked, /openInterior/);
  assert.match(blocked, /petHomeTutorialStep/);
  assert.doesNotMatch(blocked, /openInventory|pendingActivate|openGiftModal|showNoMailPopup/);

  const portalEnd = owner.indexOf("</ViewportScenePortal>");
  const inventory = owner.indexOf("Bottom inventory bar", portalEnd);
  const tutorial = owner.indexOf("<PetHomeTutorialOverlay", portalEnd);
  const interior = owner.indexOf("<InteriorViewer", portalEnd);
  assert.ok(portalEnd >= 0);
  assert.ok(inventory > portalEnd);
  assert.ok(tutorial > portalEnd);
  assert.ok(interior > portalEnd);
});

test("visitor outdoor camera suspends behind selected pet gift and interior UI while HUD stays above the scene", () => {
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(visitor, /const visitorOutdoorCameraBlocked = Boolean\(/);
  assert.match(visitor, /openInterior/);
  assert.match(visitor, /showGiftModal/);
  assert.match(visitor, /selectedPet/);

  const portalEnd = visitor.indexOf("</ViewportScenePortal>");
  const hudPortal = visitor.indexOf("<ViewportHudPortal>", portalEnd);
  const hud = visitor.indexOf('data-testid="visit-pet-home-hud"', hudPortal);
  const hudPortalEnd = visitor.indexOf("</ViewportHudPortal>", hudPortal);
  const interior = visitor.indexOf("<InteriorViewerVisit", portalEnd);
  const selected = visitor.indexOf("<PetStatPopup", portalEnd);
  assert.ok(portalEnd >= 0);
  assert.ok(hudPortal > portalEnd);
  assert.ok(hud > hudPortal && hud < hudPortalEnd);
  assert.ok(interior > portalEnd);
  assert.ok(selected > portalEnd);
});

test("iPhone 12 still uses ViewportScenePortal inline fallback and existing 390-stage contract", () => {
  const portal = read("client/src/components/ViewportScenePortal.tsx");
  const stage = read("client/src/lib/stage.ts");

  assert.match(portal, /if \(!enabled \|\| !target\) return <>\{children\}<\/?>/);
  assert.match(stage, /export const DESIGN_W = 390/);
  assert.match(stage, /export const DESIGN_H = 844/);
  assert.match(stage, /viewportOwned: true/);
});


test("HUD-only Pet Home UI does not reset the expanded camera measurement", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(
    owner,
    /return observeHomeViewport\(container, recalc\);\s*\}, \[\s*bgAspect,\s*openInterior,\s*petHomeTutorialStep,?\s*\]\);/,
  );
});

test("owner outdoor scene layers unmount inside buildings and remount outside", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /!openInterior && imgWidth > 0 && activeBundle\?\.buildings/);
  assert.match(owner, /!openInterior && imgWidth > 0 && outdoorPets\.map/);
  assert.match(owner, /!openInterior && outdoorPopupPet &&/);
  assert.match(owner, /!openInterior && imgWidth > 0 && placedDecor\.map/);
});

test("visited Home camera also remeasures when returning from an interior", () => {
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(
    visitor,
    /return observeHomeViewport\(container, recalc\);\s*\}, \[bgAspect, openInterior, showGiftModal, selectedPet\]\);/,
  );
});
