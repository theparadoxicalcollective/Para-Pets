import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldUseDocumentLayout } from "../client/src/lib/stage";

test("Hub to sign-in uses the real viewport on phones and tablets", () => {
  for (const width of [320, 360, 390, 412, 768, 1024, 1440]) {
    assert.equal(shouldUseDocumentLayout("/hub", width), true);
    assert.equal(shouldUseDocumentLayout("/auth", width), true);
  }
});

test("gameplay, home bundles and world maps remain on their existing stage path", () => {
  for (const path of ["/", "/world/volcanic", "/pet-home", "/coins"]) {
    assert.equal(shouldUseDocumentLayout(path, 390), false);
    assert.equal(shouldUseDocumentLayout(path, 1024), false);
  }
});

test("auth uses the same untransformed viewport shell as Hub", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const auth = readFileSync("client/src/pages/AuthPage.tsx", "utf8");
  assert.match(app, /if \(shouldUseDocumentLayout\(location, layout\.viewportWidth\)\)/);
  assert.match(app, /data-coordinate-owner="viewport"/);
  assert.match(app, /data-design-width=\{layout\.viewportWidth\}/);
  assert.match(auth, /auth-form-screen/);
  assert.match(auth, /overflow-y-auto/);
});
