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

test("hatched stars stay high in the pet artwork frame and never use legacy fixed screen coordinates", () => {
  const anchor = home.slice(home.indexOf("Hatched rarity stars share the pet scene"), home.indexOf("Rarity sparkle lights (3/4/5 star)"));
  assert.match(anchor, /top: "8%", left: "50%"/);
  assert.match(anchor, /visibility: activePetModal \? "hidden" : "visible"/);
  const eggStars = home.slice(home.indexOf('activePet && !\(activePet.isHatched && activePet.petTemplateId\)'), home.indexOf("Hatched rarity stars share the pet scene"));
  assert.doesNotMatch(eggStars, /position: "fixed"/);
  assert.doesNotMatch(eggStars, /activePetSceneRect\.top/);
});

test("unhatched eggs share the active pet artwork stage without legacy viewport offsets", () => {
  const stage = home.slice(home.indexOf('ref={(element) => { activePetSceneRef.current = element; }}'), home.indexOf('Hatched rarity stars share the pet scene'));
  assert.match(stage, /width: activePet \? "min\(88vw, 38dvh, 520px\)"/);
  assert.match(stage, /top: activePetGroundViewport \? activePetGroundViewport.y - activePetContentRect.top/);
  assert.match(stage, /transform: "translate\(-50%, -100%\)"/);
  assert.doesNotMatch(stage, /activePet\?\.isHatched && activePet.petTemplateId \?/);
  const egg = home.slice(home.indexOf('data-testid="button-egg-tap"'), home.indexOf('data-testid="display-egg-hatch-ready"'));
  assert.match(egg, /width: "70%"/);
  assert.match(egg, /maxHeight: "70%"/);
  assert.doesNotMatch(egg, /paddingTop: "clamp\(8px, 4dvh, 36px\)"/);
});
