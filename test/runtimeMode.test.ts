import assert from "node:assert/strict";
import test from "node:test";
import { detectRuntimeMode } from "../client/src/lib/runtimeMode";

const iphoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

test("shared runtime helper distinguishes iOS standalone, Safari, and embedded modes", () => {
  const oldWindow = globalThis.window;
  try {
    Object.assign(globalThis, { window: { matchMedia: () => ({ matches: false }) } });
    assert.equal(detectRuntimeMode({ userAgent: iphoneSafari, standalone: true }).displayMode, "ios-standalone");
    assert.equal(detectRuntimeMode({ userAgent: iphoneSafari, standalone: false }).displayMode, "ios-browser");
    assert.equal(detectRuntimeMode({ userAgent: iphoneSafari.replace("Version/18.0 Mobile/15E148 Safari/604.1", "Mobile/15E148"), standalone: false }).displayMode, "ios-embedded");
    assert.equal(detectRuntimeMode({ userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0) Safari/604.1", standalone: false }).displayMode, "desktop");
  } finally {
    Object.assign(globalThis, { window: oldWindow });
  }
});
