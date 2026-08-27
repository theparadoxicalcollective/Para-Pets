import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const animator = readFileSync("client/src/components/PetAnimator.tsx", "utf8");
const animatorCore = readFileSync("client/src/components/PetAnimatorCore.tsx", "utf8");
const equipment = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("costume rendering is centralized around the existing pet animator", () => {
  assert.match(animator, /import PetAnimatorCore from "@\/components\/PetAnimatorCore"/);
  assert.match(animator, /getCostumeCanvasPosition/);
  assert.match(animator, /\/api\/pet\/\$\{resolvedPetInventoryId\}\/costumes/);
  assert.match(animator, /data-testid={`pet-animator-costumes-\$\{depth\}`}/);
  assert.match(animator, /<PetAnimatorCore/);
  assert.match(animatorCore, /export default function PetAnimator/);
});

test("costume artwork inherits its configured pet-part motion instead of using a static page overlay", () => {
  assert.match(animator, /const anchor = sortedParts\.find\(part => part\.partType === placement\.anchorPart\)/);
  assert.match(animator, /data-testid={`costume-anchor-\$\{placement\.anchorPart\}`}/);
  assert.match(animator, /animation: animName \? buildAnimation\(animName, duration, partDelay\) : undefined/);
  assert.match(animator, /transformOrigin: origin/);
  assert.match(animator, /const localLeft = \(\(position\.left - anchor\.posX\) \/ anchor\.width\) \* 100/);
  assert.match(animator, /transform: `rotate\(\$\{placement\.rotation \?\? 0\}deg\)`/);
});

test("head-mounted costumes inherit the same head-group wrapper motion as the pet", () => {
  assert.match(animator, /function headGroupType/);
  assert.match(animator, /function getHeadWrapperMotion/);
  assert.match(animator, /animation = resolvedView === "back" \? "petIdleHeadSide" : "petIdleHead"/);
  assert.match(animator, /animation = "petIdleHeadSway"/);
  assert.match(animator, /animation = "petIdleHeadSwayAlt"/);
  assert.match(animator, /data-testid={`costume-head-group-\$\{groupType\}`}/);
  assert.match(animator, /"--pet-head-bob": headBob/);
});

test("above-head pet layers always render over costume pieces", () => {
  assert.match(animator, /basePartType\(part\.partType\) === "above_head"/);
  assert.match(animator, /function AboveHeadTopLayer/);
  assert.match(animator, /data-testid="pet-animator-above-head-top"/);
  assert.match(animator, /zIndex: 3/);
  assert.match(animator, /renderCostumes && costumeLayer\("front"\)/);
  assert.match(animator, /renderCostumes && hasAboveHead/);
  assert.match(animator, /data-testid={`above-head-top-\$\{part\.partType\}`}/);
  assert.match(animator, /name === "petAboveHeadBounce"\) name = "petAboveHeadBounceMarionette"/);
});

test("active-pet and equipment surfaces resolve the owned pet without dressing unrelated renderers", () => {
  assert.match(home, /data-testid="display-active-pet"/);
  assert.match(animator, /closest\("\[data-testid='display-active-pet'\]"\)/);
  assert.match(animator, /querySelectorAll<HTMLElement>\(":scope > \[data-testid\^='costume-preview-'\]"\)/);
  assert.match(animator, /resolvedPetInventoryId = petInventoryId \?\? \(ownedPetSurface \? authUser\?\.activePetId/);
  assert.match(animator, /enabled: !!resolvedPetInventoryId/);
  assert.match(equipment, /<EquippedCostumePreview petInventoryId=\{petInventoryId\} depth="back" \/>/);
  assert.match(equipment, /<EquippedCostumePreview petInventoryId=\{petInventoryId\} depth="front" \/>/);
});

test("legacy equipment overlays are hidden before paint so costumes are drawn only once", () => {
  assert.match(animator, /equipmentPreviews\.forEach\(node => \{ node\.style\.display = "none"; \}\)/);
  assert.match(animator, /previousDisplays/);
});
