import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Active Pet HUD sparkles remain in browser client coordinates", () => {
  assert.match(source, /const burstRingSparkles = useCallback\(\(clientX: number, clientY: number/);
  assert.match(source, /const origin = \{ x: clientX, y: clientY \}/);
  assert.match(source, /x: origin\.x/);
  assert.match(source, /y: origin\.y/);
  assert.match(source, /data-testid="active-pet-side-menu"/);
});

test("Home speed-up drag ghost and hit tests both use device coordinates", () => {
  assert.match(source, /setHomeDragging\(\{ item, x: ev\.clientX, y: ev\.clientY \}\)/);
  assert.match(source, /setHomeDragging\(prev => prev \? \{ \.\.\.prev, x: ev\.clientX, y: ev\.clientY \} : null\)/);
  assert.match(source, /ev\.clientX >= dropRect\.left && ev\.clientX <= dropRect\.right/);
  assert.match(source, /ev\.clientY >= dropRect\.top\s+&& ev\.clientY <= dropRect\.bottom/);
  assert.doesNotMatch(source, /clientToStage\(/);
});

test("Begin Journey potion glow threshold follows the visible device height", () => {
  assert.match(source, /getVisibleViewport\(\)\.height \* 0\.65/);
  assert.doesNotMatch(source, /window\.innerHeight \* 0\.65/);
});

test("petting hearts and sparkles use viewport coordinates outside the scaled stage", () => {
  assert.match(source, /createPortal\(<div className="fixed inset-0 pointer-events-none"/);
  assert.match(source, /data-testid="active-pet-viewport-particles"/);
  assert.match(source, /cx: clampX\(spawnX, size, Math\.abs\(dx\)\)/);
  assert.match(source, /cx: clampX\(cx, size, Math\.abs\(dx\)\)/);
  assert.match(source, /const w = window\.innerWidth/);
  const petting = source.slice(source.indexOf("const burstPetHearts"), source.indexOf("const homePettingRewardMutation"));
  assert.doesNotMatch(petting, /clientToStage\(/);
});
