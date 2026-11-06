import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isPrimaryQuestGuideActive,
  setPrimaryQuestGuideOwnerActive,
} from "../client/src/lib/questGuideOwnership";

const read = (path: string) => readFileSync(path, "utf8");

test("retired primary onboarding does not block independent NPC quest spotlights", () => {
  const app = read("client/src/App.tsx");
  const lonelle = read("client/src/components/LonelleQuestOverlay.tsx");
  const ginny = read("client/src/components/GinnyQuestOverlay.tsx");
  assert.doesNotMatch(app, /BeginJourneyOverlay|NpcQuestDiscoveryGuide/);
  assert.equal(isPrimaryQuestGuideActive(), false);
  assert.match(lonelle, /usePrimaryQuestGuideActive\(\)/);
  assert.match(lonelle, /!primaryGuideActive[\s\S]*?<QuestGuideSpotlight/);
  assert.match(ginny, /usePrimaryQuestGuideActive\(\)/);
  assert.match(ginny, /target=\{!primaryGuideActive && guideActive && state\.canEquipNow \? guideTarget : null\}/);
});

test("shared quest spotlight cannot darken or trap players unless explicitly blocking", () => {
  const spotlight = read("client/src/components/QuestGuideSpotlight.tsx");

  assert.match(spotlight, /blockingGuide = false/);
  assert.match(
    spotlight,
    /if \(!selector \|\| mode === "tour" \|\| !blockingGuide\) return;/,
  );
  assert.match(
    spotlight,
    /const background = !blockingGuide[\s\S]*?\? "transparent"/,
  );
  assert.match(
    spotlight,
    /blockingGuide && panDestination && panNodePrefix/,
  );
});
