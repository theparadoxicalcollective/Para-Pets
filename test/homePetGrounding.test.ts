import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("active pet uses the restored responsive home flow", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.match(
    page,
    /className="relative flex items-center justify-center w-full max-w-\[520px\] md:max-w-\[680px\] lg:max-w-\[800px\]"/,
  );
  assert.match(
    page,
    /style=\{\{ marginBottom: activePet \? "calc\(26\*var\(--vh\)\)" : undefined \}\}/,
  );
  assert.doesNotMatch(page, /className="home-active-pet-stage"/);
});

test("Begin Journey keeps the active egg compact on the phone stage", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.match(page, /width: "min\(calc\(70\*var\(--vw\)\), 320px\)"/);
  assert.match(page, /maxHeight: "calc\(46\*var\(--vh\)\)"/);
  assert.doesNotMatch(page, /max-h-\[calc\(55\*var\(--vh\)\)\]/);
});

test("Home excludes raid chrome and tutorial suppresses the duplicate hatch cinematic", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.doesNotMatch(page, /raidBossData/);
  assert.doesNotMatch(page, /data-testid="display-raid-boss"/);
  assert.match(page, /tutorialStep === 5 \|\| tutorialStep === 6/);
  assert.match(page, /setHatchRevealing\(false\)/);
});

test("tutorial potion progress updates immediately and rejects duplicate in-flight drops", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.match(page, /tutorialPotionBusyRef\.current/);
  assert.match(page, /onSettled: \(\) => \{ tutorialPotionBusyRef\.current = false; \}/);
  assert.match(page, /queryClient\.setQueryData<InventoryItem\[]>\(\["\/api\/inventory"\]/);
  assert.match(page, /hatchStartedAt: data\?\.hatchStartedAt/);
});
