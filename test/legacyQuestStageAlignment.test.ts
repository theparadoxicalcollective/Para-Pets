import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Begin Journey portals into the shared quest-guide surface and converts live target bounds", () => {
  const source = read("client/src/components/BeginJourneyOverlay.tsx");

  assert.match(source, /getQuestGuideSurface/);
  assert.match(source, /guideBoundsInSurface/);
  assert.match(source, /const surface = getQuestGuideSurface\(\)/);
  assert.match(source, /targetGuideRect = targetRect \? guideBoundsInSurface\(targetRect, surface\) : null/);
  assert.match(source, /potionGuideRect = potionRect \? guideBoundsInSurface\(potionRect, surface\) : null/);
  assert.match(source, /eggGuideRect = eggOnHomeRect \? guideBoundsInSurface\(eggOnHomeRect, surface\) : null/);
  assert.match(source, /right:\s+Math\.min\(surface\.width/);
  assert.match(source, /bottom: Math\.min\(surface\.height/);
  assert.match(source, /surface\.target,\s*\n\s*\);/);
  assert.doesNotMatch(source, /window\.innerWidth|window\.innerHeight/);
  assert.doesNotMatch(source, /document\.body,\s*\n\s*\);/);
});

test("Begin Journey drag preview converts client pixels before rendering in a scaled stage", () => {
  const source = read("client/src/components/BeginJourneyOverlay.tsx");

  assert.match(source, /dragPreviewPoint = dragPotionPreview \? \{/);
  assert.match(source, /\(dragPotionPreview\.x - surface\.left\) \/ surface\.scale/);
  assert.match(source, /\(dragPotionPreview\.y - surface\.top\) \/ surface\.scale/);
  assert.match(source, /left: dragPreviewPoint\?\.x \?\? dragPotionPreview\.x/);
  assert.match(source, /top: dragPreviewPoint\?\.y \?\? dragPotionPreview\.y/);
});

test("Ginny highlights notices and dialog use the authoritative game surface", () => {
  const source = read("client/src/components/GinnyQuestOverlay.tsx");

  assert.match(source, /getQuestGuideSurface/);
  assert.match(source, /guideBoundsInSurface\(rect, surface\)/);
  assert.match(source, /surface\.width - left - 6/);
  assert.match(source, /surface\.height - 82/);
  assert.match(source, /position = surface\.inStage \? "absolute" : "fixed"/);
  assert.match(source, /surface\.target/);
  assert.match(source, /dialogWidth = Math\.min\(430/);
  assert.match(source, /guideDialogMaxHeight\(surface\.height, 48\)/);
  assert.doesNotMatch(source, /window\.innerWidth|window\.innerHeight/);
});

test("Janson's global dialog no longer expands across the physical desktop viewport", () => {
  const source = read("client/src/components/JansonQuestOverlay.tsx");

  assert.match(source, /getQuestGuideSurface/);
  assert.match(source, /overlayPosition = surface\.inStage \? "absolute" : "fixed"/);
  assert.match(source, /dialogWidth = Math\.min\(410/);
  assert.match(source, /dialogOpen && inBayou && createPortal/);
  assert.match(source, /surface\.target/);
  assert.doesNotMatch(source, /width: "min\(94vw,410px\)"/);
});

test("the iPhone 12 path remains native because shared quest overlays still target body for viewport-owned stages", () => {
  const guide = read("client/src/lib/questGuideViewport.ts");
  const stage = read("client/src/lib/stage.ts");

  assert.match(guide, /const surface = getStageSurface\(\)/);
  assert.match(guide, /inStage: !surface\.viewportOwned/);
  assert.match(stage, /if \(target === document\.body\)/);
  assert.match(stage, /viewportOwned: true/);
});
