import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  parkPetWouldObscureAnother, parkProjectedPetBounds, parkVisiblePetArtworkBounds,
} from "../client/src/lib/petParkVisibleOverlap";

const page = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
const portrait = readFileSync("client/src/components/PetParkPetPortrait.tsx", "utf8");
const stars = readFileSync("client/src/components/PetParkRarityStars.tsx", "utf8");
const routes = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const home = readFileSync("client/src/pages/HomePage.tsx", "utf8");

test("visitor building taps are controls rather than camera pointer-capture targets", () => {
  assert.match(page, /const isControl = !!\(e\.target as HTMLElement\)\.closest\("button, input, select, textarea, a"\)/);
  assert.match(page, /!draggableArtwork \|\| !scene\?\.canEditPark/);
  assert.match(page, /if \(!e\.isPrimary \|\| isControl \|\| pinch\.current\) return/);
  assert.match(page, /parkImageHitAt\(e\.currentTarget\.querySelector\("img"\)!/);
});

test("indoor pets are movable on their actual artwork through the existing owner-only API", () => {
  assert.match(page, /data-testid="pet-park-indoor-pet-drag"/);
  assert.match(page, /startPlacedIndoorPetDrag\(event, pet, deposit\.id, position\)/);
  assert.match(page, /onPointerMove=\{movePlacedIndoorPet\}/);
  assert.match(page, /onPointerUp=\{endPlacedIndoorPet\}/);
  assert.match(page, /setIndoorPetDraft\(\{ petInventoryId: drag\.petInventoryId/);
  assert.match(page, /commitIndoorPetPosition\(drag\.depositId, drag\.petInventoryId/);
  assert.match(page, /action\.mutate\(\{ method: "PATCH", path: `\/api\/pet-park\/deposits\/\$\{depositId\}\/placement`/);
  assert.match(page, /const deposit = deposits\.find\(item => item\.petInventoryId === pet\.petInventoryId\)/);
  assert.match(page, /\{deposit && <button/);
  assert.match(page, /safeSetPointerCapture\(event\.currentTarget, event\.pointerId\)/);
  assert.match(page, /onPointerCancel=\{cancelPlacedIndoorPet\}/);
  assert.match(page, /outdoorOverlapsAnotherPet\(drag\.petInventoryId/);
  assert.match(page, /data-park-world-artwork/);
  assert.match(page, /data-park-pet-artwork/);
  assert.match(page, /data-testid=\{myDeposit \? "pet-park-outdoor-drag" : "pet-park-outdoor-inspect"\}/);
  assert.doesNotMatch(page, /hit\?\.closest\('button, \[data-testid="pet-park-interior-slots"\]'\)/);
});

test("room sleep squares trigger the existing PetAnimator sleep mode, not a duplicate animator", () => {
  assert.match(page, /isParkIndoorSleepPosition\(position, effects, dimensions\)/);
  assert.match(page, /mode=\{sleeping \? "sleep" : "static"\}/);
  assert.match(portrait, /mode=\{reducedMotion \? "static" : mode\}/);
  assert.match(portrait, /mode === "sleep" && !reducedMotion \? "pet-park-rest" : ""/);
  assert.match(portrait, /IntersectionObserver\(entries =>/);
  assert.match(page, /pose: isParkIndoorSleepPosition/);
  assert.match(routes, /\["idle", "sit", "sleep"\]\.includes\(pose\)/);
});

test("curved rarity stars reuse the Active Pet star asset and hide scene nameplates", () => {
  assert.match(stars, /@assets\/uploads\/CardStar\.png/);
  assert.match(home, /const curveY = -\(1 - t \* t\) \* 12/);
  assert.match(stars, /const curveY = -\(1 - t \* t\) \* starSize \* 0\.28/);
  assert.match(page, /<PetParkRarityStars rarity=\{pet\.rarity\}/);
  assert.match(routes, /rarity: shopItems\.rarity,/);
  const room = page.slice(page.indexOf('data-park-pet={pet.petInventoryId}'), page.indexOf('</PetParkInteriorRoom>'));
  assert.doesNotMatch(room, /<span[^>]+bg-black\/65[^>]*>\s*\{pet\.petNickname/);
  assert.match(room, /aria-label=\{`Move \$\{pet\.petNickname/);
});

test("transparent fallback pet artwork is analyzed once using existing bounded alpha cache", () => {
  assert.match(portrait, /getAlphaBounds\(hatchedImageUrl, event\.currentTarget\)/);
  assert.match(page, /getAlphaBounds\(pet\.hatchedImageUrl, event\.currentTarget\)/);
  const alpha = readFileSync("client/src/lib/alphaBounds.ts", "utf8");
  assert.match(alpha, /MAX_CONCURRENT_SCANS = 2/);
  assert.match(alpha, /const cached = cache\.get\(url\)/);
});

test("overlap checks permit side touches but reject complete visual covering", () => {
  const stationary = { left: 120, right: 180, top: 90, bottom: 160 };
  assert.equal(parkPetWouldObscureAnother(stationary, stationary), true);
  assert.equal(parkPetWouldObscureAnother(stationary, { left: 148, right: 208, top: 90, bottom: 160 }), false);
  assert.equal(parkPetWouldObscureAnother(stationary, { left: 134, right: 192, top: 93, bottom: 162 }), true);
  assert.equal(parkPetWouldObscureAnother(stationary, { left: 190, right: 244, top: 90, bottom: 160 }), false);
  assert.equal(parkPetWouldObscureAnother(stationary, { left: 120, right: 120, top: 90, bottom: 160 }), false);
});

test("drop projection uses visible artwork, not an entire square sprite frame", () => {
  const room = { left: -280, right: 920, top: 50, bottom: 850 };
  const proposal = parkProjectedPetBounds({ x: .5, y: .6 }, 100, room);
  assert.deepEqual(proposal, { left: 286, right: 354, top: 450, bottom: 518 });
  const frame = { left: 50, right: 150, top: 40, bottom: 140, width: 100, height: 100 };
  const element = {
    getBoundingClientRect: () => frame,
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
  const visible = parkVisiblePetArtworkBounds(element);
  assert.deepEqual(visible, { left: 67, right: 133, top: 48, bottom: 130 });
  const moved = parkProjectedPetBounds({ x: .5, y: .6 }, 100, room, { element, currentSize: 100 });
  assert.deepEqual(moved, { left: 287, right: 353, top: 450, bottom: 532 });
});

test("image-space placement and artwork collision do not depend on iPhone reference dimensions", () => {
  const petPaths = [
    "client/src/pages/PetParkPage.tsx",
    "client/src/components/PetParkInteriorRoom.tsx",
    "client/src/lib/petParkVisibleOverlap.ts",
    "client/src/lib/petParkInteriorDrop.ts",
  ];
  for (const path of petPaths) {
    const code = readFileSync(path, "utf8");
    assert.doesNotMatch(code, /DESIGN_W|DESIGN_H|390\s*[*×x]\s*844|referenceStage/);
  }
});
