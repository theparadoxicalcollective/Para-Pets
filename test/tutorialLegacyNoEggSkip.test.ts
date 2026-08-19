import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("client/src/pages/PetInventoryPage.tsx", "utf8");

test("legacy players with pets but no unhatched egg skip the egg-only tutorial steps", () => {
  assert.match(page, /const pets = inventory\.filter\(\(item: any\) => item\.type === "pet"\)/);
  assert.match(page, /const hasAnyPet = pets\.length > 0/);
  assert.match(page, /const hasUnhatchedEgg = pets\.some\(\(item: any\) => item\.isHatched === false\)/);
  assert.match(page, /if \(hasAnyPet && !hasUnhatchedEgg\) \{\s*bjSetStep\(6\);\s*navigate\("\/"\);/);
});

test("new players with no pets are not skipped past the starter egg flow", () => {
  assert.doesNotMatch(page, /if \(!hasAnyPet\)[\s\S]*?bjSetStep\(6\)/);
  assert.match(page, /if \(hasAnyPet && !hasUnhatchedEgg\)/);
});

test("the compatibility guard also catches players already on Head back home", () => {
  assert.match(page, /enabled: tutorialStep === 2 \|\| tutorialStep === 3/);
  assert.match(page, /tutorialStep !== 2 && tutorialStep !== 3/);
  assert.match(page, /window\.addEventListener\(BJ_EVENT, syncTutorialStep\)/);
});
