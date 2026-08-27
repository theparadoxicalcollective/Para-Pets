import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modal = readFileSync("client/src/components/PetPowerUpModal.tsx", "utf8");
const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("Power Up animated pet stays inside its existing pet zone", () => {
  assert.match(power, /<PetAnimator[\s\S]*?size=\{350\}[\s\S]*?fillContainer/);
  assert.match(power, /className="w-full h-full"/);
  assert.doesNotMatch(power, /<PetAnimator[^>]*size=\{700\}/);
});

test("Level Up keeps the flattened pet image and a static optimized fallback", () => {
  assert.match(level, /const StableLevelUpPet = memo/);
  assert.match(level, /if \(petImage\)/);
  assert.match(level, /data-testid="img-levelup-pet-static"/);
  assert.match(level, /mode="static"/);
  assert.match(level, /performanceStatic/);
  assert.doesNotMatch(level, /mode="idle"/);
  assert.doesNotMatch(level, /petInventoryId=\{/);
});

test("upgrade adapter only suppresses the still image for Power Up", () => {
  assert.match(modal, /if \(isLevelUp\) return <PetLevelUpPage \{\.\.\.props\} \/>/);
  assert.match(modal, /powerUpProps = props\.petTemplateId \? \{ \.\.\.props, petImage: null \} : props/);
  assert.match(modal, /<PetPowerUpPage \{\.\.\.powerUpProps\} \/>/);
});

test("Level Up clears transient animation timers when it closes", () => {
  assert.match(level, /transientTimers/);
  assert.match(level, /transientTimers\.current\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
  assert.match(level, /scheduleTransient\(\(\) => setPetAnim\("flash"\), 260\)/);
});
