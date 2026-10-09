import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Level Up uses the same CardStar asset and five-star curved rarity display as Active Pet", () => {
  assert.match(home, /import cardStarImg from "@assets\/uploads\/CardStar.png"/);
  assert.match(level, /import cardStarImg from "@assets\/uploads\/CardStar.png"/);
  assert.match(level, /data-testid="levelup-active-pet-style-stars"/);
  assert.match(level, /Array.from\(\{ length: 5 \}/);
  assert.match(level, /const curveY = -\(1 - t \* t\) \* 12/);
  assert.doesNotMatch(level, /"★"\.repeat/);
});

test("Level Up stats open on pet tap without changing item drop, oval, or upgrade behavior", () => {
  assert.match(level, /const \[showStats, setShowStats\] = useState\(false\)/);
  assert.match(level, /aria-expanded=\{showStats\}/);
  assert.match(level, /data-testid="levelup-pet-stats-popover"/);
  assert.match(level, /Tap your pet to view ATK/);
  assert.match(level, /onPointerUp=\{onPointerUp\}/);
  assert.match(level, /onUseItem\(item\)/);
  assert.match(level, /PetPageOvalPlacement page="levelUp"/);
  assert.match(level, /data-testid="zone-levelup-pet-drop"/);
});
