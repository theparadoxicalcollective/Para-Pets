import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("active animated pet has a responsive slab baseline and eggs retain the home flow", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.match(
    page,
    /className="relative flex items-center justify-center"/,
  );
  assert.match(page, /min\(88vw, 38dvh, 520px\)/);
  assert.match(page, /activePetGroundViewport\.y - activePetContentRect\.top/);
  assert.match(page, /activePetGroundViewport\.x - activePetContentRect\.left/);
  assert.doesNotMatch(page, /top: "calc\(72\*var\(--vh\)\)"/);
  assert.match(page, /transform: "translate\(-50%, -100%\)"/);
  assert.match(page, /size=\{activePetSceneRect\.width \|\| 200\} fillContainer/);
  assert.doesNotMatch(page, /size=\{390\} fillContainer/);
  assert.doesNotMatch(page, /className="home-active-pet-stage"/);
});

test("Active Pet keeps the enlarged egg within its artwork stage", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.match(page, /width: "75%"/);
  assert.match(page, /maxHeight: "75%"/);
  assert.doesNotMatch(page, /max-h-\[calc\(55\*var\(--vh\)\)\]/);
});

test("Home excludes raid chrome and normal hatch cinematic remains available", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.doesNotMatch(page, /raidBossData/);
  assert.doesNotMatch(page, /data-testid="display-raid-boss"/);
  assert.doesNotMatch(page, /tutorialStep === 5|tutorialStep === 6/);
  assert.match(page, /setHatchRevealing\(true\)/);
});

test("normal potion progress reconciles inventory without legacy tutorial special handling", () => {
  const page = readFileSync("client/src/pages/HomePage.tsx", "utf8");

  assert.doesNotMatch(page, /tutorialPotionBusyRef|bj_step5_use_potion/);
  assert.match(page, /queryClient\.setQueryData<InventoryItem\[]>\(\["\/api\/inventory"\]/);
  assert.match(page, /hatchStartedAt: data\?\.hatchStartedAt/);
});
