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

test("the former Keeper's Central nav entry only enters an open Pet Park or admin preview", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  assert.match(nav, /if \(id === "keepers"\) \{[\s\S]*?openPetPark\(\)/);
  const gate = nav.split("const openPetPark = async () => {")[1]?.split("const handleRight =")[0];
  assert.ok(gate, "navigation must have an availability gate");
  assert.match(gate, /if \(user\.isAdmin\) \{ navigate\("\/pet-park"\); return; \}/);
  assert.match(gate, /apiRequest\("GET", "\/api\/pet-park\/status"\)/);
  assert.match(gate, /if \(status\.enabledForPlayers\)/);
  assert.match(gate, /toast\(\{ title: "Pet Park is under construction" \}\)/);
  assert.match(gate, /navigate\("\/pet-park"\)/);
  assert.match(app, /location === "\/pet-park"/);
  assert.match(app, /<PetParkPage/);
  assert.doesNotMatch(nav, /keepers-nav-viewport-overlay|showKeepers|setShowKeepers|<PetWorldPage/);
});

test("native phones retain ViewportModalPortal inline fallback", () => {
  assert.match(modal, /if \(!enabled \|\| !target\) return <>\{children\}<\/>/);
});
