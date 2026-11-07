import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  animateParkOutdoorPet, PARK_OUTDOOR_PET_SIZE_RATIO,
  PARK_OUTDOOR_QUIET_ZOOM, parkOutdoorPetSize,
} from "../client/src/lib/petParkOutdoorPresentation";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("outdoor pets scale together without resizing indoor pets, slots or saved world placements", () => {
  assert.equal(PARK_OUTDOOR_PET_SIZE_RATIO, 0.8);
  for (const natural of [68, 120, 160, 200, 300]) {
    assert.equal(parkOutdoorPetSize(natural), natural * .8);
  }
  const outdoor = page.split("{outdoorPets.map(pet => {")[1]?.split("      </div>}")[0];
  assert.ok(outdoor, "outdoor pet scene exists");
  assert.match(outdoor, /const petSize = parkOutdoorPetSize\(parkPetSizeOnSleepSpot/);
  assert.match(page, /const size = parkOutdoorPetSize\(parkPetSizeOnSleepSpot/,
    "collision bounds use the same smaller pet size as rendering");
  assert.match(outdoor, /const petHeight = petSize \* 225 \/ 200/);
  assert.match(outdoor, /<PetParkRarityStars rarity=\{pet\.rarity\} petSize=\{petSize\}/);
  const indoor = page.split("indoorVisiblePets.map(pet => {")[1]?.split("{activeBuilding.isShop")[0];
  assert.ok(indoor);
  assert.match(indoor, /const petSize = parkIndoorPetSizeOnSleepSpot/);
  assert.doesNotMatch(indoor, /parkOutdoorPetSize/);
  assert.match(page, /petInventoryId=\{pet\.petInventoryId\} size=\{58\}/,
    "main equipped portraits retain their existing sizes");
});

test("zoomed-out visitor pets use existing static mode but owner pets and accessibility remain intact", () => {
  assert.equal(PARK_OUTDOOR_QUIET_ZOOM, 0.85);
  assert.equal(animateParkOutdoorPet(1, false, false), true);
  assert.equal(animateParkOutdoorPet(0.8, false, false), false);
  assert.equal(animateParkOutdoorPet(0.8, false, true), true);
  assert.equal(animateParkOutdoorPet(1, true, true), false);
  const outdoor = page.split("{outdoorPets.map(pet => {")[1]?.split("      </div>}")[0] ?? "";
  assert.match(outdoor, /const animateOutdoor = animateParkOutdoorPet\(zoom, reduceMotion, isMine\)/);
  assert.match(outdoor, /mode=\{!animateOutdoor \? "static" : sleeping \? "sleep" : "idle"\}/);
  assert.match(outdoor, /animated=\{animateOutdoor\}/);
  assert.match(outdoor, /isParkPetNearViewport/);
  assert.doesNotMatch(page, /PARK_PUBLIC_OUTDOOR_OWNER_BUDGET = 60/,
    "this PR keeps the 40 other-owner population cap until benchmarked");
});

test("the indoor tray uses accessible circular equipped-pet portraits and a matching drag ghost", () => {
  const tray = page.split('{equippedForInterior.map(pet =>')[1]?.split('{equippedForInterior.length === 0')[0] ?? "";
  assert.match(tray, /className="flex h-\[68px\] w-\[68px\].*overflow-hidden rounded-full/);
  assert.match(tray, /<PetParkPetPortrait petTemplateId=\{pet\.petTemplateId\}/);
  assert.match(tray, /hatchedImageUrl=\{pet\.hatchedImageUrl\} size=\{58\} reducedMotion/);
  assert.match(tray, /aria-label=\{\`Drag \$\{pet\.petNickname \|\| pet\.petName\} into the room\`\}/);
  assert.doesNotMatch(tray, /<span[^>]*>\{pet\.petNickname \|\| pet\.petName\}<\/span>/,
    "pet names are for accessibility, not visible tray text");
  assert.match(tray, /onPointerDown=\{event => startIndoorPetDrag\(event, pet\.id\)\}/);
  assert.match(tray, /onPointerMove=\{moveIndoorPetDrag\}/);
  assert.match(tray, /onPointerUp=\{endIndoorPetDrag\}/);
  assert.match(page, /data-testid="pet-park-indoor-portrait-ghost"/);
  assert.match(page, /petInventoryId=\{indoorGhostPet\.petInventoryId\}/);
  assert.doesNotMatch(page, /indoorDragGhost\.petId\)\?\.petName \?\? "Pet"/,
    "the ghost also uses the pet image rather than a fallback text name");
});

test("tapping the player's own pet offers only Return to idle, never a public profile popup", () => {
  assert.match(page, /const \[selectedOwnPetId, setSelectedOwnPetId\] = useState<string \| null>\(null\)/);
  assert.match(page, /const returnPetToIdle = \(depositId: string\) =>/);
  assert.match(page, /path: \`\/api\/pet-park\/deposits\/\$\{depositId\}\/display\`/);
  assert.match(page, /body: \{ display: "idle" \}/);
  assert.match(page, /if \(myDeposit\) toggleOwnPetAction\(pet\.petInventoryId\)/);
  assert.match(page, /else setInspectedPet\(pet\)/);
  assert.match(page, /if \(Date\.now\(\) >= suppressIndoorInspectUntil\.current\) toggleOwnPetAction\(pet\.petInventoryId\)/);
  assert.match(page, /!deposit && <button type="button" data-testid="pet-park-indoor-inspect"/);
  assert.match(page, /data-testid="pet-park-own-return-idle"/);
  assert.match(page, /Return to idle/);
  assert.match(page, /onClick=\{event => \{ event\.stopPropagation\(\); returnPetToIdle\(myDeposit\.id\); \}\}/);
  assert.match(page, /onClick=\{event => \{ event\.stopPropagation\(\); returnPetToIdle\(deposit\.id\); \}\}/);
  assert.match(page, /startOutdoorPetDrag\(event, myDeposit, position\)/);
  assert.match(page, /startPlacedIndoorPetDrag\(event, pet, deposit\.id, position\)/);
  const display = readFileSync("server/routes/petParkDisplay.routes.ts", "utf8");
  assert.match(display, /showInPark: false, buildingId: null, roomEffectId: null/,
    "Return to idle reuses owner-authorized display API, not withdrawal");
});
