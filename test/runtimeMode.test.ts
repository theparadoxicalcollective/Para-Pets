import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeMode } from "../client/src/lib/runtimeMode";

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
