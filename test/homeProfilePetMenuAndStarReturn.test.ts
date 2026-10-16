import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("pet menu does not cover profile or other full-screen overlays", () => {
  const guard = home.slice(home.indexOf("Screen-relative Pet Menu"), home.indexOf("Daily quest hints follow"));
  assert.match(guard, /!showProfile && !showPetStats && !showSupportModal && !showWorldChat && activePetModal === null/);
  assert.match(guard, /data-testid="button-open-pet-menu"/);
});

test("hatched stars remain mounted but hidden while Power Up is open", () => {
  const anchor = home.slice(home.indexOf("Hatched rarity stars share the pet scene"), home.indexOf("Rarity sparkle lights (3/4/5 star)"));
  assert.match(anchor, /activePet && activePet\.isHatched && activePet\.petTemplateId && \(/);
  assert.doesNotMatch(anchor, /&& !activePetModal &&/);
  assert.match(anchor, /visibility: activePetModal \? "hidden" : "visible"/);
  assert.match(anchor, /data-testid="display-pet-rarity-stars"/);
});
