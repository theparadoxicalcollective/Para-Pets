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

test("existing pet heart and sparkle effects remain stage-local", () => {
  assert.match(source, /const p = clientToStage\(spawnX, spawnY\)/);
  assert.match(source, /const p = clientToStage\(cx, cy\)/);
});
