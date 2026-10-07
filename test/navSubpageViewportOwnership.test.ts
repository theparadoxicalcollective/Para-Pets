import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nav = readFileSync("client/src/components/FloatingNav.tsx", "utf8");
const modal = readFileSync("client/src/components/ViewportModalPortal.tsx", "utf8");

for (const [name, testId] of [
  ["PvP notice", "pvp-note-viewport-overlay"],
  ["Aquarium nav entry", "aquarium-nav-viewport-overlay"],
  ["Keeper's Central nav entry", "keepers-nav-viewport-overlay"],
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

test("existing subpage components and close behavior remain intact", () => {
  assert.match(nav, /<AquariumPage onClose=\{\(\) => setShowAquarium\(false\)\} userId=\{user\.id\} \/>/);
  assert.match(nav, /<PetWorldPage user=\{user\} onClose=\{\(\) => setShowKeepers\(false\)\} \/>/);
  assert.match(nav, /onClick=\{\(\) => setShowPvpNote\(false\)\}/);
});

test("native phones retain ViewportModalPortal inline fallback", () => {
  assert.match(modal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
});
