import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overlay = readFileSync("client/src/components/BeginJourneyOverlay.tsx", "utf8");

test("tutorial waits for confirmed active egg before leaving Select Egg", () => {
  const forwarderStart = overlay.indexOf("const handleForwarderClick");
  const handlerStart = overlay.indexOf("if (stepNum === 2) {", forwarderStart);
  const handlerEnd = overlay.indexOf("if (stepNum === 6) {", handlerStart);
  assert.ok(forwarderStart >= 0 && handlerStart >= 0 && handlerEnd > handlerStart);

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


test("starter picker uses the live 3-star catalog and does not advance before selection", () => {
  assert.match(overlay, /queryKey: \["\/api\/tutorial\/starter-pets"\]/);
  assert.match(overlay, /starterPets\.map\(\(pet\)/);
  assert.match(overlay, /handleGrantEgg\(pet\.id\)/);
  assert.match(overlay, /\/api\/tutorial\/grant-starter-egg", \{ petId \}/);
  assert.match(overlay, /Use all 3 hatching potions on your egg until it is ready!/);
  assert.doesNotMatch(overlay, /Grassland Cow Egg/);
});

test("tutorial remains on the potion step until inventory confirms hatch-ready", () => {
  assert.doesNotMatch(overlay, /window\.addEventListener\("bj_speedup_used"/);
  assert.match(overlay, /if \(eggReadyToHatch\) \{/);
  assert.match(overlay, /bjSetStep5TapMode\(true\)/);
});


test("empty home stage offers an explicit recoverable Begin Here entry point", async () => {
  const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
  const app = readFileSync("client/src/App.tsx", "utf8");
  const state = readFileSync("client/src/lib/beginJourney.ts", "utf8");
  assert.match(home, /data-testid="button-begin-journey"/);
  assert.match(home, /!ownsAnyPet/);
  assert.match(home, /!currentUser\.tutorial_quest_completed/);
  assert.match(home, /!currentUser\.tutorial_reward_claimed/);
  assert.match(home, /onClick=\{\(\) => bjRestart\(\)\}/);
  assert.match(state, /export function bjRestart\(\) \{\s*bjSetStep\(0\);/);
  assert.doesNotMatch(app, /bjGetStatus\(\) === "not_started"\) bjStart\(\)/);
});
