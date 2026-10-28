import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
const modal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");

// Active modal subpages only; Pet Park has its own navigable route.
for (const [name, testId] of [
  ["PvP notice", "pvp-note-viewport-overlay"],
  ["Aquarium nav entry", "aquarium-nav-viewport-overlay"],
] as const) {
  test(`${name} owns the full-device modal surface`, () => {
    const start = nav.indexOf(`data-testid="${testId}"`);
    assert.ok(start >= 0, `${testId} should exist`);
    const before = nav.slice(Math.max(0, start - 180), start);
    const end = nav.indexOf("</ViewportModalPortal>", start);
    assert.match(before, /<ViewportModalPortal>/);
    assert.ok(end > start, `${testId} should close its portal locally`);
    assert.match(nav.slice(start, Math.min(end, start + 260)), /className="absolute inset-0/);
  });
}

test("existing Aquarium and PvP subpage close behavior remains intact", () => {
  assert.match(nav, /<AquariumPage onClose=\{\(\) => setShowAquarium\(false\)\} userId=\{user\.id\} \/>/);
  assert.match(nav, /onClick=\{\(\) => setShowPvpNote\(false\)\}/);
});

test("the former Keeper's Central nav entry opens Pet Park as a route, not a modal", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  assert.match(nav, /id === "keepers"[\s\S]*?navigate\("\/pet-park"\)/);
  assert.match(app, /location === "\/pet-park"/);
  assert.match(app, /<PetParkPage/);
  assert.doesNotMatch(nav, /keepers-nav-viewport-overlay|showKeepers|setShowKeepers|<PetWorldPage/);
});

test("native phones retain ViewportModalPortal inline fallback", () => {
  assert.match(modal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
});
