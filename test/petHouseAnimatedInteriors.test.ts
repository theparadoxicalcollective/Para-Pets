import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner Pet House building pets use static while dragging, sleep in Sleep Squares, and house idle otherwise", () => {
  const source = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(source, /mode=\{isActivelyDragging \? "static" : isSleeping \? "sleep" : "house"\}/);
  assert.match(source, /isHouseInteriorSleepPosition/);
  assert.match(source, /petInventoryId=\{pet\.inventoryId\}/);
  assert.match(source, /className=\{isActivelyDragging \? undefined : "pet-idle-squish"\}/);
});

test("visited Pet House building pets sleep in Sleep Squares and use house idle otherwise with legacy fallback", () => {
  const source = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");
  assert.match(source, /visit-pet-interior-/);
  assert.match(source, /pet\.petTemplateId \? \([\s\S]*mode=\{isSleeping \? "sleep" : "house"\}/);
  assert.match(source, /isHouseInteriorSleepPosition/);
  assert.match(source, /\) : \(pet\.hatchedImageUrl \|\| pet\.imageUrl\) \? \(/);
});
