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

test("owner drag/drop still converts client input through the actual scene element", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /clientPointInStageElement\(container, e\.clientX, e\.clientY\)/);
  assert.match(owner, /\(localX - panX\) \/ imgWidth/);
  assert.match(owner, /localY \/ containerH/);
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

test("owner outdoor camera suspends for canonical inventory tutorial modal and interior UI", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");

  assert.match(owner, /const homeOutdoorCameraBlocked = Boolean\(/);
  for (const state of [
    "openInterior",
    "openInventory",
    "pendingActivate",
    "openGiftModal",
    "showNoMailPopup",
    "petHomeTutorialStep",
  ]) {
    assert.match(owner, new RegExp(state));
  }

  const portalEnd = owner.indexOf("</ViewportScenePortal>");
  const inventory = owner.indexOf("Bottom inventory bar", portalEnd);
  const tutorial = owner.indexOf("<PetHomeTutorialOverlay", portalEnd);
  const interior = owner.indexOf("<InteriorViewer", portalEnd);
  assert.ok(portalEnd >= 0);
  assert.ok(inventory > portalEnd);
  assert.ok(tutorial > portalEnd);
  assert.ok(interior > portalEnd);
});

test("visitor outdoor camera suspends behind selected pet gift and interior UI while HUD stays canonical", () => {
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(visitor, /const visitorOutdoorCameraBlocked = Boolean\(/);
  assert.match(visitor, /openInterior/);
  assert.match(visitor, /showGiftModal/);
  assert.match(visitor, /selectedPet/);

  const portalEnd = visitor.indexOf("</ViewportScenePortal>");
  const hud = visitor.indexOf("{/* HUD */}", portalEnd);
  const interior = visitor.indexOf("<InteriorViewerVisit", portalEnd);
  const selected = visitor.indexOf("<PetStatPopup", portalEnd);
  assert.ok(portalEnd >= 0);
  assert.ok(hud > portalEnd);
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
