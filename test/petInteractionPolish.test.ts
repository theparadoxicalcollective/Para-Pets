import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const petHouse = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
const feedingOverlay = readFileSync("client/src/features/pet-care/FeedingOverlay.tsx", "utf8");

test("outdoor removal control follows live drag coordinates and current pet data", () => {
  assert.match(petHouse, /const \[outdoorPopupPetId, setOutdoorPopupPetId\] = useState<string \| null>\(null\)/);
  assert.match(petHouse, /outdoorPets\.find\(pet => pet\.inventoryId === outdoorPopupPetId\)/);
  assert.match(petHouse, /outdoorPopupLivePosition\?\.xPct \?\? parsePetPct\(outdoorPopupPet\.posLeft\)/);
  assert.match(petHouse, /outdoorPopupLivePosition\?\.yPct \?\? parsePetPct\(outdoorPopupPet\.posTop\)/);
  assert.match(petHouse, /setPetDragLive\(finalPosition\)/);
  assert.match(petHouse, /updatePetPositionMutation\.mutateAsync\(finalPosition\)/);
});

test("indoor removal control follows live drag coordinates until its save settles", () => {
  assert.match(petHouse, /const \[popupPetId, setPopupPetId\] = useState<string \| null>\(null\)/);
  assert.match(petHouse, /placedPets\.find\(pet => pet\.inventoryId === popupPetId\)/);
  assert.match(petHouse, /popupPetLivePosition\?\.xPct \?\? parsePetPct\(popupPet\.posLeft\)/);
  assert.match(petHouse, /popupPetLivePosition\?\.yPct \?\? parsePetPct\(popupPet\.posTop\)/);
  assert.match(petHouse, /void onMovePet\(drag\.inventoryId, newXPct, newYPct\)/);
  assert.match(petHouse, /onMovePet: \(inventoryId: string, xPct: number, yPct: number\) => Promise<void>/);
});

test("settled drag cleanup cannot clear a newer live drag", () => {
  const guardedCleanup = /current\?\.inventoryId === finalPosition\.inventoryId &&\s*current\.xPct === finalPosition\.xPct &&\s*current\.yPct === finalPosition\.yPct \? null : current/g;
  assert.equal((petHouse.match(guardedCleanup) ?? []).length, 2);
});

test("Pet Care has no rectangular gold drag-target outline", () => {
  const marker = feedingOverlay.indexOf('data-testid="drop-zone-feed-pet"');
  const petTarget = marker >= 0 ? feedingOverlay.slice(Math.max(0, marker - 1800), marker + 200) : "";
  assert.doesNotMatch(petTarget, /outline:/);
  assert.doesNotMatch(petTarget, /outlineOffset:/);
  assert.doesNotMatch(feedingOverlay, /2px solid rgba\(255,215,0,0\.75\)/);
  assert.match(petTarget, /petGlow/);
  assert.match(feedingOverlay, /feed-sparkle/);
  assert.match(feedingOverlay, /feed-heart-rise/);
});
