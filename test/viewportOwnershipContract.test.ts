import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ownership = readFileSync("client/src/lib/viewportOwnership.ts", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const backdrop = readFileSync("client/src/components/ViewportBackdropPortal.tsx", "utf8");
const scene = readFileSync("client/src/components/ViewportScenePortal.tsx", "utf8");
const hud = readFileSync("client/src/components/ViewportHudPortal.tsx", "utf8");
const modal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");
const page = readFileSync("client/src/components/StagePageSurface.tsx", "utf8");
const docs = readFileSync("docs/viewport-ownership.md", "utf8");

test("viewport host IDs and z-order have one source of truth", () => {
  assert.match(ownership, /backdrop: "game-viewport-backdrop"/);
  assert.match(ownership, /page: "game-viewport-page"/);
  assert.match(ownership, /scene: "game-viewport-scene"/);
  assert.match(ownership, /hud: "game-viewport-hud"/);
  assert.match(ownership, /backdrop: 10/);
  assert.match(ownership, /legacyStage: 15/);
  assert.match(ownership, /page: 20/);
  assert.match(ownership, /scene: 30/);
  assert.match(ownership, /hud: 40/);
  assert.match(ownership, /modal: 20_000/);
  for (const token of ["VIEWPORT_LAYER_Z.backdrop","VIEWPORT_LAYER_Z.legacyStage","VIEWPORT_LAYER_Z.page","VIEWPORT_LAYER_Z.scene","VIEWPORT_LAYER_Z.hud"]) {
    assert.ok(app.includes(token), token);
  }
});

test("all shared portals resolve hosts through the ownership contract", () => {
  assert.match(backdrop, /getViewportHost\("backdrop"\)/);
  assert.match(scene, /getViewportHost\("scene"\)/);
  assert.match(hud, /getViewportHost\("hud"\)/);
  assert.match(modal, /getViewportHost\("hud"\)/);
  assert.match(page, /getViewportHost\("page"\)/);
  assert.match(modal, /zIndex: VIEWPORT_LAYER_Z\.modal/);
});

test("contract preserves iPhone 12 authored coordinates instead of widening them", () => {
  assert.match(docs, /390 × 844 \(iPhone 12\)/);
  assert.match(docs, /must not rewrite saved coordinates/);
  assert.match(docs, /Do not widen the 390×844 authored coordinate plane/);
});
