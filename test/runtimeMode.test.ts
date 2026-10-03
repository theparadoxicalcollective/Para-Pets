import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeMode } from "../client/src/lib/runtimeMode";
import { shouldUseLowMemoryPetRenderer } from "../client/src/lib/petRenderSafety";
import { getPetCareRuntimeDecisions } from "../client/src/lib/petCareSafeMode";
import { calculateStageLayout, DESIGN_W, DESIGN_H } from "../client/src/lib/stage";

const iphoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const androidChrome = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36";

test("shared runtime helper distinguishes iOS standalone, Safari, and embedded modes", () => {
  const oldWindow = globalThis.window;
  try {
    Object.assign(globalThis, { window: { matchMedia: () => ({ matches: false }) } });
    assert.equal(detectRuntimeMode({ userAgent: iphoneSafari, standalone: true }, { viewportWidth: 390 }).displayMode, "ios-standalone");
    assert.equal(detectRuntimeMode({ userAgent: iphoneSafari, standalone: false }, { viewportWidth: 390 }).displayMode, "ios-browser");
    assert.equal(detectRuntimeMode({ userAgent: iphoneSafari.replace("Version/18.0 Mobile/15E148 Safari/604.1", "Mobile/15E148"), standalone: false }, { viewportWidth: 390 }).displayMode, "ios-embedded");
    assert.equal(detectRuntimeMode({ userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0) Safari/604.1", standalone: false }, { viewportWidth: 834, coarsePointer: true }).browserClassification, "tablet");
  } finally {
    Object.assign(globalThis, { window: oldWindow });
  }
});

test("Android phones distinguish browser and installed web app without changing layout class", () => {
  const browser = detectRuntimeMode(
    { userAgent: androidChrome },
    { viewportWidth: 412, standalone: false, coarsePointer: true, canHover: false },
  );
  const installed = detectRuntimeMode(
    { userAgent: androidChrome },
    { viewportWidth: 412, standalone: true, coarsePointer: true, canHover: false },
  );
  assert.equal(browser.displayMode, "android-browser");
  assert.equal(browser.browserClassification, "android-chrome");
  assert.equal(browser.isStandalone, false);
  assert.equal(installed.displayMode, "android-standalone");
  assert.equal(installed.browserClassification, "android-chrome");
  assert.equal(installed.isStandalone, true);
});

test("Android tablets still follow viewport size instead of the Android user agent", () => {
  const tablet = detectRuntimeMode(
    { userAgent: androidChrome },
    { viewportWidth: 800, standalone: false, coarsePointer: true, canHover: false },
  );
  assert.equal(tablet.displayMode, "desktop");
  assert.equal(tablet.browserClassification, "tablet");
});


const mobileDevices = [
  { name: "Safari iPhone", ua: iphoneSafari, width: 390, height: 844, touch: 1 },
  { name: "installed iPhone", ua: iphoneSafari, width: 390, height: 844, touch: 1, standalone: true },
  { name: "Chrome iOS", ua: iphoneSafari.replace("Version/18.0", "CriOS/130.0"), width: 393, height: 852, touch: 1 },
  { name: "Firefox iOS", ua: iphoneSafari.replace("Version/18.0", "FxiOS/130.0"), width: 390, height: 760, touch: 1 },
  { name: "Android phone", ua: androidChrome, width: 412, height: 915, touch: 5 },
  { name: "installed Android", ua: androidChrome, width: 360, height: 800, touch: 5, standalone: true },
  { name: "Android tablet with a mouse", ua: androidChrome, width: 800, height: 1280, touch: 5, mouse: true },
  { name: "iPad", ua: "Mozilla/5.0 (iPad; CPU OS 18_0) Version/18.0 Safari/604.1", width: 834, height: 1194, touch: 5 },
  { name: "iPad desktop UA with a trackpad", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", width: 1024, height: 768, touch: 5, mouse: true },
  { name: "touch mobile browser", ua: "Mozilla/5.0 Mobile", width: 375, height: 812, touch: 1 },
] as const;

for (const device of mobileDevices) {
  test(`${device.name} keeps mobile render safety independently of its phone/tablet layout`, () => {
    const hasMouse = "mouse" in device && device.mouse;
    const mode = detectRuntimeMode({ userAgent: device.ua, maxTouchPoints: device.touch }, {
      viewportWidth: device.width, coarsePointer: !hasMouse, canHover: hasMouse,
      standalone: "standalone" in device && device.standalone,
    });
    assert.equal(mode.mobileDevice, true);
    assert.equal(shouldUseLowMemoryPetRenderer(mode), true);
    assert.deepEqual(getPetCareRuntimeDecisions(mode, ""), { reducedVisualMode: true, dragEnabled: true, emergencyInteractionFallback: false });
    assert.equal(getPetCareRuntimeDecisions(mode, "?petCareSafe=0").reducedVisualMode, false);
    const layout = calculateStageLayout(device.width, device.height);
    assert.equal(layout.designWidth, Math.min(DESIGN_W, device.width));
    assert.equal(layout.designHeight, device.width < 768 ? device.height : DESIGN_H);
    if (device.width >= 768) assert.equal(mode.displayMode, "desktop");
  });
}

test("desktop Safari and Chrome retain full rendering and the same phone composition", () => {
  for (const ua of ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0"]) {
    const mode = detectRuntimeMode({ userAgent: ua, maxTouchPoints: 0 }, { viewportWidth: 1440, coarsePointer: false, canHover: true });
    assert.equal(mode.mobileDevice, false);
    assert.equal(shouldUseLowMemoryPetRenderer(mode), false);
    assert.equal(getPetCareRuntimeDecisions(mode, "").dragEnabled, true);
    const layout = calculateStageLayout(1440, 900);
    assert.equal(layout.designWidth, 390);
    assert.equal(layout.designHeight, 844);
  }
});
