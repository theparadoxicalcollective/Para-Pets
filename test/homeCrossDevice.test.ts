import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
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
    assert.match(source, /observeHomeViewport\(container, recalc\)/);
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

  assert.match(owner, /if \(e\.type === "pointercancel"\) return;[\s\S]*toggleLightEffect/);
  assert.match(visitor, /if \(e\.type === "pointercancel"\) return;[\s\S]*toggleLightEffect/);
  assert.match(owner, /if \(e\.type === "pointercancel"\) \{[\s\S]*petInvDragRef\.current = null;[\s\S]*inventoryDragRef\.current = null;/);
  assert.match(owner, /if \(!drag \|\| e\.type === "pointercancel"\) \{[\s\S]*setPetDragLive\(null\)/);

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
});

test("Home fixed overlays respect mobile viewport and Admin safe areas", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");
  const admin = read("client/src/components/HomeBundleSection.tsx");
  const effects = read("client/src/components/HomeInteriorEffect.tsx");

  assert.match(owner, /HOME_FIXED_VIEWPORT_STYLE/);
  assert.match(visitor, /HOME_FIXED_VIEWPORT_STYLE/);
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
