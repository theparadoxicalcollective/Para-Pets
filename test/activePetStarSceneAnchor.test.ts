import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("hatched Active Pet rarity stars live inside the pet scene instead of fixed viewport coordinates", () => {
  const scene = home.indexOf('data-platform-artwork-x=');
  const stars = home.indexOf('Hatched rarity stars share the pet scene');
  const sparkles = home.indexOf('Rarity sparkle lights (3/4/5 star)');
  assert.ok(scene >= 0 && stars > scene && sparkles > stars);
  const anchored = home.slice(stars, sparkles);
  assert.match(anchored, /data-testid="display-pet-rarity-stars"/);
  assert.match(anchored, /top: "32%", left: "50%"/);
  assert.doesNotMatch(anchored, /activePetSceneRect/);
  assert.doesNotMatch(anchored, /position: "fixed"/);
});

test("egg and legacy star presentation remains on its original fallback path", () => {
  assert.match(home, /activePet && !\(activePet\.isHatched && activePet\.petTemplateId\) && \(/);
});
