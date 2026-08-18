import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overlay = readFileSync("client/src/components/BeginJourneyOverlay.tsx", "utf8");

test("tutorial waits for confirmed active egg before leaving Select Egg", () => {
  const handlerStart = overlay.indexOf("if (stepNum === 2) {");
  const handlerEnd = overlay.indexOf("if (stepNum === 6) {", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);

  const step2Handler = overlay.slice(handlerStart, handlerEnd);
  assert.match(step2Handler, /setStep2Selecting\(true\);\s*eggButton\.click\(\);\s*return;/);
  assert.doesNotMatch(step2Handler, /bjSetStep\(3\)/);
  assert.doesNotMatch(step2Handler, /setStep\(3\)/);
});

test("tutorial advances only after auth state confirms an unhatched active egg", () => {
  assert.match(
    overlay,
    /const activeEgg = user\?\.activePetId[\s\S]*?i\.inventoryId === user\.activePetId[\s\S]*?i\.isHatched === false[\s\S]*?if \(!activeEgg\) return;[\s\S]*?bjSetStep\(3\);[\s\S]*?setStep\(3\);/,
  );
  assert.match(overlay, /\[step, location, invCheck, user\?\.activePetId\]/);
});

test("failed or slow egg selection can be retried without advancing", () => {
  assert.match(overlay, /const \[step2Selecting, setStep2Selecting\][\s\S]*?useState\(false\)/);
  assert.match(overlay, /setTimeout\(\(\) => setStep2Selecting\(false\), 5000\)/);
  assert.match(overlay, /eggAlreadyActive \|\| step2Selecting/);
});

test("home rescue does not bounce back while a confirmed active pet exists", () => {
  assert.match(overlay, /targetRect !== null \|\| user\?\.activePetId/);
  assert.match(overlay, /setTimeout\(\(\) => setShowRescue\(true\), 3000\)/);
  assert.match(overlay, /\[step, location, targetRect, user\?\.activePetId\]/);
});
