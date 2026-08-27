import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const animator = readFileSync("client/src/components/PetAnimator.tsx", "utf8");
const animatorCore = readFileSync("client/src/components/PetAnimatorCore.tsx", "utf8");
const equipment = readFileSync("client/src/components/PetEquipAccessoriesPage.tsx", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");
const feeding = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");
const house = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
const world = readFileSync("client/src/pages/PetWorldPage.tsx", "utf8");
const walk = readFileSync("client/src/components/WalkAroundScene.tsx", "utf8");
const level = readFileSync("client/src/components/PetLevelUpPage.tsx", "utf8");
const power = readFileSync("client/src/components/PetPowerUpPage.tsx", "utf8");
const globalLevel = readFileSync("client/src/components/GlobalLevelUpOverlay.tsx", "utf8");

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
  assert.match(animator, /data-testid={`costume-anchor-\$\{placement\.anchorPart\}-\$\{placementInstance\}`}/);
  assert.match(animator, /animation: animName \? buildAnimation\(animName, duration, partDelay\) : undefined/);
  assert.match(animator, /transformOrigin: origin/);
  assert.match(animator, /const localLeft = \(\(position\.left - anchor\.posX\) \/ anchor\.width\) \* 100/);
  assert.match(animator, /transform: `rotate\(\$\{placement\.rotation \?\? 0\}deg\) scaleX\(\$\{placement\.flipX \? -1 : 1\}\)`/);
});

test("animated costume renderer draws every fitted duplicate for the current view and depth", () => {
  assert.match(animator, /costume\.placements\.filter\(item => item\.view === costumeView && item\.depth === depth\)/);
  assert.match(animator, /placements\.map\(\(placement\) =>/);
  assert.match(animator, /const placementInstance = placement\.instance \?\? 1/);
  assert.match(animator, /costume-piece-\$\{costume\.id\}-\$\{placementInstance\}/);
});

test("head-mounted costumes inherit the same head-group wrapper motion as the pet", () => {
  assert.match(animator, /function headGroupType/);
  assert.match(animator, /function getHeadWrapperMotion/);
  assert.match(animator, /animation = resolvedView === "back" \? "petIdleHeadSide" : "petIdleHead"/);
  assert.match(animator, /animation = "petIdleHeadSway"/);
  assert.match(animator, /animation = "petIdleHeadSwayAlt"/);
  assert.match(animator, /data-testid={`costume-head-group-\$\{groupType\}-\$\{placementInstance\}`}/);
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

test("owned-pet surfaces pass inventory identity explicitly without dressing unrelated renderers", () => {
  assert.match(animator, /const resolvedPetInventoryId = petInventoryId \?\? null/);
  assert.match(animator, /enabled: !!resolvedPetInventoryId/);
  assert.doesNotMatch(animator, /closest\(|querySelectorAll<HTMLElement>|activePetId/);
  assert.match(home, /petInventoryId=\{activePet\.inventoryId\}/);
  assert.match(equipment, /petInventoryId=\{petInventoryId\}/);
  assert.match(feeding, /petInventoryId=\{pet\.inventoryId\}/);
  assert.match(house, /petInventoryId=\{pet\.inventoryId\}/);
  assert.match(walk, /petInventoryId=\{activePetInventoryId \?\? undefined\}/);
  assert.match(world, /petInventoryId=\{pet\.userId === user\.id \? pet\.inventoryId : undefined\}/);
  assert.match(level, /petInventoryId=\{petInventoryId\}/);
  assert.match(power, /petInventoryId=\{petInventoryId\}/);
  assert.match(globalLevel, /petInventoryId=\{petInventoryId \?\? undefined\}/);
});

test("the equipment page uses only the shared animated renderer", () => {
  assert.doesNotMatch(equipment, /EquippedCostumePreview|depth="back"|depth="front"/);
  assert.match(equipment, /<PetAnimator[\s\S]*?petInventoryId=\{petInventoryId\}/);
});
