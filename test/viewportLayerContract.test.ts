import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { VIEWPORT_LAYER_Z, viewportPointerEvents } from "../client/src/lib/viewportLayers";

const read = (path: string) => readFileSync(path, "utf8");

test("viewport layer order stays explicit and monotonic", () => {
  assert.ok(VIEWPORT_LAYER_Z.backdrop < VIEWPORT_LAYER_Z.scene);
  assert.ok(VIEWPORT_LAYER_Z.scene < VIEWPORT_LAYER_Z.page);
  assert.ok(VIEWPORT_LAYER_Z.page < VIEWPORT_LAYER_Z.hud);
  assert.ok(VIEWPORT_LAYER_Z.hud < VIEWPORT_LAYER_Z.modal);
});

test("decorative surfaces never own input", () => {
  assert.equal(viewportPointerEvents("decorative"), "none");
  assert.equal(viewportPointerEvents("interactive"), "auto");
  assert.equal(viewportPointerEvents("blocking"), "auto");
});

test("viewport portals use the shared input contract", () => {
  const backdrop = read("client/src/components/ViewportBackdropPortal.tsx");
  const scene = read("client/src/components/ViewportScenePortal.tsx");
  const modal = read("client/src/components/ViewportModalPortal.tsx");

  assert.match(backdrop, /viewportPointerEvents\("decorative"\)/);
  assert.match(scene, /viewportPointerEvents\(interactive \? "interactive" : "decorative"\)/);
  assert.match(modal, /viewportPointerEvents\(blocking \? "blocking" : "decorative"\)/);
  assert.match(modal, /VIEWPORT_LAYER_Z\.modal/);
});
