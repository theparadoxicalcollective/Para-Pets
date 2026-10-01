import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isPrimaryQuestGuideActive,
  setPrimaryQuestGuideOwnerActive,
} from "../client/src/lib/questGuideOwnership";

const read = (path: string) => readFileSync(path, "utf8");

test("primary quest guide ownership remains exclusive across onboarding flows", () => {
  try {
    setPrimaryQuestGuideOwnerActive("begin-journey", true);
    assert.equal(isPrimaryQuestGuideActive(), true);

    setPrimaryQuestGuideOwnerActive("npc-discovery", true);
    setPrimaryQuestGuideOwnerActive("begin-journey", false);
    assert.equal(isPrimaryQuestGuideActive(), true);

    setPrimaryQuestGuideOwnerActive("npc-discovery", false);
    assert.equal(isPrimaryQuestGuideActive(), false);
  } finally {
    setPrimaryQuestGuideOwnerActive("begin-journey", false);
    setPrimaryQuestGuideOwnerActive("npc-discovery", false);
  }
});

test("Begin Journey and NPC discovery are the only primary blocking guides", () => {
  const beginJourney = read("client/src/components/BeginJourneyOverlay.tsx");
  const npcDiscovery = read("client/src/components/NpcQuestDiscoveryGuide.tsx");
  const lonelle = read("client/src/components/LonelleQuestOverlay.tsx");
  const ginny = read("client/src/components/GinnyQuestOverlay.tsx");

  assert.match(
    beginJourney,
    /usePrimaryQuestGuideOwner\("begin-journey", step !== null && step !== "done"\)/,
  );
  assert.match(
    npcDiscovery,
    /usePrimaryQuestGuideOwner\("npc-discovery", eligible && index < worlds\.length\)/,
  );
  assert.match(npcDiscovery, /const shouldLoadTour = eligible;/);
  assert.match(npcDiscovery, /blockingGuide/);

  assert.match(lonelle, /usePrimaryQuestGuideActive\(\)/);
  assert.match(lonelle, /!primaryGuideActive[\s\S]*?<QuestGuideSpotlight/);
  assert.match(lonelle, /blockingGuide=\{false\}/);

  assert.match(ginny, /usePrimaryQuestGuideActive\(\)/);
  assert.match(
    ginny,
    /target=\{!primaryGuideActive && guideActive && state\.canEquipNow \? guideTarget : null\}/,
  );
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
