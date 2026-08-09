import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeMode } from "../client/src/lib/runtimeMode";

const iphoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

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

test("Android classification follows viewport and capabilities rather than user agent alone", () => {
  const android = { userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36" };
  const phone = detectRuntimeMode(android, { viewportWidth: 412, coarsePointer: true, canHover: false });
  const tablet = detectRuntimeMode(android, { viewportWidth: 800, coarsePointer: true, canHover: false });
  assert.equal(phone.displayMode, "mobile-browser");
  assert.equal(phone.browserClassification, "touch-mobile");
  assert.equal(tablet.displayMode, "desktop");
  assert.equal(tablet.browserClassification, "tablet");
});
