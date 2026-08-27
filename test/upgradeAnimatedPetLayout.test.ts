import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");

test("Power Up animated pet stays inside its existing pet zone", () => {
  assert.match(power, /<PetAnimator[\s\S]*?size=\{350\}[\s\S]*?fillContainer/);
  assert.match(power, /className="w-full h-full"/);
  assert.doesNotMatch(power, /<PetAnimator[^>]*size=\{700\}/);
});

test("Level Up is mounted directly as its own page", () => {
  assert.match(home, /import PetLevelUpPage from "@\/components\/PetLevelUpPage"/);
  assert.match(home, /import PetPowerUpPage from "@\/components\/PetPowerUpPage"/);
  assert.match(home, /activePetModal === "level_up"[\s\S]*<PetLevelUpPage/);
  assert.match(home, /activePetModal === "power_up"[\s\S]*<PetPowerUpPage/);
  assert.doesNotMatch(home, /PetPowerUpModal/);
});

test("Level Up keeps an isolated animated pet with a loading fallback", () => {
  assert.match(level, /const StableLevelUpPet = memo/);
  assert.match(level, /queryKey: \["\/api\/pet-template-parts", petTemplateId\]/);
  assert.match(level, /templateData\?\.parts\?\.length/);
  assert.match(level, /mode="idle"/);
  assert.match(level, /refetchOnWindowFocus: false/);
  assert.match(level, /data-testid="img-levelup-pet-fallback"/);
  assert.doesNotMatch(level, /petInventoryId=\{/);
  assert.doesNotMatch(level, /performanceStatic/);
});

test("Level Up clears transient animation timers when it closes", () => {
  assert.match(level, /transientTimers/);
  assert.match(level, /transientTimers\.current\.forEach\(\(timer\) => window\.clearTimeout\(timer\)\)/);
  assert.match(level, /scheduleTransient\(\(\) => setPetAnim\("flash"\), 260\)/);
});
