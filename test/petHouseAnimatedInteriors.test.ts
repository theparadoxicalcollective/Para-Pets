import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("owner Pet House building pets idle while resting and go static during drag", () => {
  const source = readFileSync("client/src/pages/PetHousePage.tsx", "utf8");
  assert.match(source, /mode=\{livePos \? "static" : "house"\}/);
  assert.match(source, /petInventoryId=\{pet\.inventoryId\}/);
  assert.match(source, /className=\{livePos \? undefined : "pet-idle-squish"\}/);
});

test("visited Pet House building pets use house idle animation with legacy fallback", () => {
  const source = readFileSync("client/src/pages/VisitPetHousePage.tsx", "utf8");
  assert.match(source, /visit-pet-interior-/);
  assert.match(source, /pet\.petTemplateId \? \([\s\S]*mode="house"/);
  assert.match(source, /\) : \(pet\.hatchedImageUrl \|\| pet\.imageUrl\) \? \(/);
});
