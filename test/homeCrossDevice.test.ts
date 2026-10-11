import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  centeredHomeCameraPanX,
  clampHomeCameraPanX,
  homeCameraPointerDeltaX,
  HOME_FIXED_VIEWPORT_STYLE,
  HOME_TOUCH_SURFACE_STYLE,
  safeSetPointerCapture,
} from "../client/src/lib/homeCrossDevice";

const read = (path: string) => readFileSync(path, "utf8");

test("Home cross-device pointer capture is best-effort instead of throwable", () => {
  let captured = -1;
  const good = {
    setPointerCapture(id: number) {
      captured = id;
    },
  } as unknown as EventTarget;
  assert.equal(safeSetPointerCapture(good, 7), true);
  assert.equal(captured, 7);

  const unsupported = {} as EventTarget;
  assert.equal(safeSetPointerCapture(unsupported, 8), false);

  const cancelled = {
    setPointerCapture() {
      throw new Error("pointer already cancelled");
    },
  } as unknown as EventTarget;
  assert.equal(safeSetPointerCapture(cancelled, 9), false);
});

test("Home touch surfaces suppress browser gestures without changing scene coordinates", () => {
  assert.equal(HOME_TOUCH_SURFACE_STYLE.touchAction, "none");
  assert.equal(HOME_TOUCH_SURFACE_STYLE.userSelect, "none");
  assert.equal(HOME_TOUCH_SURFACE_STYLE.WebkitUserSelect, "none");
  assert.equal(HOME_TOUCH_SURFACE_STYLE.WebkitTouchCallout, "none");
  assert.equal(HOME_TOUCH_SURFACE_STYLE.overscrollBehavior, "none");
  assert.equal(HOME_FIXED_VIEWPORT_STYLE.height, "var(--home-visual-height, 100dvh)");
});

test("Home canvases react to ResizeObserver, orientation, and mobile VisualViewport changes", () => {
  const helper = read("client/src/lib/homeCrossDevice.ts");
  assert.match(helper, /typeof ResizeObserver !== "undefined"/);
  assert.match(helper, /window\.addEventListener\("resize"/);
  assert.match(helper, /window\.addEventListener\("orientationchange"/);
  assert.match(helper, /window\.visualViewport\?\.addEventListener\("resize"/);
  assert.match(helper, /--home-visual-height/);
  assert.match(helper, /requestAnimationFrame/);

  for (const path of [
    "client/src/pages/PetHousePage.tsx",
    "client/src/pages/VisitPetHousePage.tsx",
    "client/src/components/HomeBundleSection.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /observeHomeViewport\(container, recalc(?:, "artwork-scene")?\)/);
    assert.doesNotMatch(source, /new ResizeObserver\(recalc\)/);
  }
});

test("Home owner, visitor, and Admin canvases use defensive pointer capture", () => {
  for (const path of [
    "client/src/pages/PetHousePage.tsx",
    "client/src/pages/VisitPetHousePage.tsx",
    "client/src/components/HomeBundleSection.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /safeSetPointerCapture/);
    assert.doesNotMatch(source, /\.setPointerCapture\(/);
  }
});

test("cancelled mobile gestures do not toggle lights, place inventory items, or persist Admin drags", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const admin = read("client/src/components/HomeBundleSection.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");

  assert.match(owner, /if \(e\.type !== "pointerup"\) return;[\s\S]*onToggleLightEffect/);
  assert.match(visitor, /if \(e\.type !== "pointerup"\) return;[\s\S]*onToggleLightEffect/);
  assert.match(visitor, /onToggleEffect=\{onToggleLightEffect\}/);
  assert.match(visitor, /panStartRef\.current = null;[\s\S]*if \(e\.type !== "pointerup"\) return;/);
  assert.match(owner, /if \(e\.type !== "pointerup"\) \{[\s\S]*petInvDragRef\.current = null;[\s\S]*inventoryDragRef\.current = null;/);
  assert.match(owner, /if \(!drag \|\| e\.type !== "pointerup"\) \{[\s\S]*setPetDragLive\(null\)/);

  assert.match(admin, /const onLeaveBtnCancel/);
  assert.match(admin, /setLeaveX\(drag\.startLX\)/);
  assert.match(admin, /const onEffectPointerCancel/);
  assert.match(admin, /x: drag\.startEffectX/);
  assert.match(admin, /y: drag\.startEffectY/);
  assert.match(admin, /const onGiftBtnCancel/);
  assert.match(admin, /setGiftX\(drag\.startGX\)/);
  assert.match(admin, /setGiftY\(drag\.startGY\)/);
  assert.match(admin, /setLocalPos\(prev => \(\{ \.\.\.prev, \[drag\.id\]: \{ x: drag\.origX, y: drag\.origY \} \}\)\)/);

  assert.match(effects, /onEffectPointerCancel\?: EffectPointerHandler/);
  assert.match(effects, /onPointerCancel=\{interactive && onEffectPointerCancel/);
  assert.match(effects, /onLostPointerCapture=\{interactive && onEffectPointerCancel/);
  assert.match(owner, /onLostPointerCapture=\{onContainerUp\}/);
  assert.match(owner, /onLostPointerCapture=\{handlePointerUp\}/);
  assert.match(visitor, /onLostPointerCapture=\{onUp\}/);
  assert.match(admin, /onLostPointerCapture=\{handleBuildingPointerCancel\}/);
});

test("Home player interiors use the shared scene camera while Admin fixed overlays keep safe areas", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const admin = read("client/src/components/HomeBundleSection.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");

  assert.match(owner, /<ViewportScenePortal>/);
  assert.match(visitor, /<ViewportScenePortal>/);
  assert.doesNotMatch(owner, /className="fixed inset-0"[\s\S]{0,220}HOME_FIXED_VIEWPORT_STYLE/);
  assert.doesNotMatch(visitor, /className="fixed inset-0"[\s\S]{0,220}HOME_FIXED_VIEWPORT_STYLE/);
  assert.match(admin, /HOME_FIXED_VIEWPORT_STYLE/);
  assert.match(admin, /bottom: "max\(16px, env\(safe-area-inset-bottom, 0px\)\)"/);
  assert.match(admin, /env\(safe-area-inset-top, 0px\)/);
  assert.match(effects, /colorInterpolation="sRGB"/);
});

test("cross-device hardening preserves image-space scene placement", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const admin = read("client/src/components/HomeBundleSection.tsx");

  assert.match(owner, /left = panX \+ item\.xPct \* imgWidth/);
  assert.match(owner, /top = item\.yPct \* containerH/);
  assert.match(visitor, /left: panX \+ item\.xPct \* imgWidth/);
  assert.match(visitor, /top: item\.yPct \* containerH/);
  assert.match(admin, /x: Math\.max\(0, Math\.min\(1, drag\.startEffectX/);
  assert.match(admin, /y: Math\.max\(0, Math\.min\(1, drag\.startEffectY/);
});


test("expanded Home camera pans real artwork but centers it when the camera is wider", () => {
  assert.equal(centeredHomeCameraPanX(390, 760), -185);
  assert.equal(clampHomeCameraPanX(-9999, 390, 760), -370);
  assert.equal(clampHomeCameraPanX(9999, 390, 760), 0);

  assert.equal(centeredHomeCameraPanX(700, 560), 70);
  assert.equal(clampHomeCameraPanX(-9999, 700, 560), 70);
  assert.equal(clampHomeCameraPanX(9999, 700, 560), 70);

  assert.equal(clampHomeCameraPanX(Number.NaN, 700, 560), 0);
});

test("player and visitor Home cameras measure artwork viewport instead of phone stage", () => {
  const helper = read("client/src/lib/homeCrossDevice.ts");
  assert.match(helper, /container\.getBoundingClientRect\(\)\.height/);
  assert.match(helper, /sizing === "artwork-scene"/);
  for (const path of ["client/src/pages/PetHousePage.tsx", "client/src/pages/VisitPetHousePage.tsx"]) {
    const source = read(path);
    assert.match(source, /observeHomeViewport\(container, recalc, "artwork-scene"\)/);
  }
  const admin = read("client/src/components/HomeBundleSection.tsx");
  assert.match(admin, /observeHomeViewport\(container, recalc\)/);
});


test("outdoor Home cameras convert pan movement using their rendered surface, not global stage scale", () => {
  const helper = readFileSync("client/src/lib/homeCrossDevice.ts", "utf8");
  const owner = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  const visitor = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");
  assert.match(helper, /clientDeltaX \* logicalWidth \/ rect\.width/);
  for (const source of [owner, visitor]) {
    assert.equal((source.match(/homeCameraPointerDeltaX\(e\.clientX - drag\.startX, container\)/g) ?? []).length, 2);
    assert.doesNotMatch(source, /const panDelta = clientDeltaToStage/);
  }
});


test("Home camera pan preserves client-to-scene distances across device scale", () => {
  const camera = (clientWidth: number, renderedWidth: number) => ({
    clientWidth,
    getBoundingClientRect: () => ({ width: renderedWidth }),
  }) as unknown as Element;
  assert.equal(homeCameraPointerDeltaX(60, camera(600, 600)), 60);
  assert.equal(homeCameraPointerDeltaX(60, camera(600, 300)), 120);
  assert.equal(homeCameraPointerDeltaX(60, camera(600, 1200)), 30);
  assert.equal(homeCameraPointerDeltaX(60, null), 0);
  assert.equal(homeCameraPointerDeltaX(60, camera(600, 0)), 0);
});
