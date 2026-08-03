import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("active pet has one authored platform baseline separate from interaction scale", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");
  const css = readFileSync("client/src/index.css", "utf8");
  assert.match(css, /--home-active-pet-ground-y:\s*610px/);
  assert.match(css, /bottom:\s*calc\(844px - var\(--home-active-pet-ground-y\)\)/);
  assert.doesNotMatch(page, /marginBottom: activePet \? "calc\(26\*var\(--vh\)\)"/);
  assert.doesNotMatch(page, /translateY\(8%\)/);
  assert.match(page, /<PetAnimator[^>]*fitVisible/);
  assert.match(page, /transformOrigin: "center bottom"/);
});
