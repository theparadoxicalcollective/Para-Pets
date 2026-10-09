import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("Active Pet legacy sparkle helper converts browser pixels into logical stage coordinates", () => {
  assert.match(source, /const burstRingSparkles = useCallback\(\(clientX: number, clientY: number/);
  assert.match(source, /const origin = clientToStage\(clientX, clientY\)/);
  assert.match(source, /x: origin\.x/);
  assert.match(source, /y: origin\.y/);
  assert.match(source, /data-testid="active-pet-side-menu"/);
});

test("Home speed-up drag ghost stores stage-local points while hit testing stays in client pixels", () => {
  assert.match(source, /const stagePoint = clientToStage\(ev\.clientX, ev\.clientY\);\s*setHomeDragging\(\{ item, x: stagePoint\.x, y: stagePoint\.y \}\)/);
  assert.match(source, /setHomeDragging\(prev => prev \? \{ \.\.\.prev, x: stagePoint\.x, y: stagePoint\.y \} : null\)/);
  assert.match(source, /ev\.clientX >= dropRect\.left && ev\.clientX <= dropRect\.right/);
  assert.match(source, /ev\.clientY >= dropRect\.top\s+&& ev\.clientY <= dropRect\.bottom/);
  assert.doesNotMatch(source, /setHomeDragging\(\{ item, x: ev\.clientX, y: ev\.clientY \}\)/);
});

test("Begin Journey potion glow threshold follows logical stage height instead of browser height", () => {
  assert.match(source, /getStageSurface\(\)\.logicalHeight \* 0\.65/);
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
