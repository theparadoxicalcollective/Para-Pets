import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("AuthPage keeps the original phone presentation while exposing a separate wide-device environment", () => {
  const auth = read("client/src/pages/AuthPage.tsx");
  const css = read("client/src/pages/authPage.css");

  assert.match(auth, /--auth-background-image/);
  assert.match(auth, /auth-page-wide-background/);
  assert.match(auth, /auth-form-screen/);
  assert.equal((auth.match(/auth-form-panel w-full animate-slide-up/g) ?? []).length, 3);

  assert.match(css, /\.auth-page-wide-background\s*\{[\s\S]*?display: none/);
  assert.match(css, /\.auth-form-panel\s*\{[\s\S]*?max-width: 24rem/);

  assert.match(css, /\.auth-title-logo\s*\{[\s\S]*?width: min\(94%, 370px\)/);
  assert.match(css, /\.auth-primary-art-button\s*\{[\s\S]*?width: min\(72%, 280px\)/);
  assert.match(css, /\.auth-hub-art-button\s*\{[\s\S]*?width: min\(64%, 240px\)/);
});

test("tablet and desktop auth use the full device instead of a narrow phone panel", () => {
  const css = read("client/src/pages/authPage.css");
  const tabletStart = css.indexOf("@media (min-width: 768px)");
  assert.ok(tabletStart >= 0);
  const tablet = css.slice(tabletStart);

  assert.match(tablet, /\.auth-page-wide-background\s*\{[\s\S]*?display: block/);
  assert.match(tablet, /background-image: var\(--auth-background-image\)/);
  assert.match(tablet, /transform: scale\(1\.58\)/);
  assert.match(tablet, /\.auth-page-background\s*\{[\s\S]*?display: none/);

  assert.match(tablet, /\.auth-landing\s*\{[\s\S]*?width: min\(100%, 900px\)/);
  assert.match(tablet, /\.auth-title-logo\s*\{[\s\S]*?520px/);
  assert.match(tablet, /\.auth-primary-art-button\s*\{[\s\S]*?360px/);
  assert.match(tablet, /\.auth-form-panel\s*\{[\s\S]*?max-width: 560px/);
  assert.match(tablet, /\.auth-paw-footer\s*\{[\s\S]*?520px/);
});
