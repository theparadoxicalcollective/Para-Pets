import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("wheel uses shared coin art, tutorial and arrow pointer without slot odds labels", () => {
  const source = readFileSync("client/src/components/world/BeauPrizeWheelOverlay.tsx", "utf8");
  assert.match(source, /const coinIcon = currencyAssets.coin/);
  assert.match(source, /aria-label="How Beau's Prize Wheel works"/);
  assert.match(source, /aria-labelledby="beau-wheel-help-title"/);
  assert.match(source, /setShowHelp\(false\)/);
  assert.match(source, /polygon\(50% 94%,10% 32%,36% 32%,36% 6%,64% 6%,64% 32%,90% 32%\)/);
  assert.match(source, /LIMITED/);
  assert.doesNotMatch(source, /slot.chance \* 100/);
  assert.match(source, /<img src=\{currencyAssets.coin\} alt="coins"/);
  assert.doesNotMatch(source, /Drag the wheel to turn it · a quick flick starts the spin/);
});

test("pet-care reward coins reuse the Clearing coin asset", () => {
  const source = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
  assert.match(source, /const coinIconImg = currencyAssets.coin/);
  assert.doesNotMatch(source, /Photoroom_20260709_102133_AM_1783610567237\.png/);
});
