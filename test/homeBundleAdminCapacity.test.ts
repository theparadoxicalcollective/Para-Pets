import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BUILDING_SIZE_CAPACITY,
  DEFAULT_OUTDOOR_DECOR_LIMIT,
  DEFAULT_OUTDOOR_PET_LIMIT,
} from "../shared/housing";

const read = (path: string) => readFileSync(path, "utf8");

test("home capacity defaults and building size limits match the admin contract", () => {
  assert.equal(DEFAULT_OUTDOOR_PET_LIMIT, 6);
  assert.equal(DEFAULT_OUTDOOR_DECOR_LIMIT, 8);
  assert.deepEqual(BUILDING_SIZE_CAPACITY, {
    small: { pets: 3, decor: 5 },
    medium: { pets: 10, decor: 15 },
    large: { pets: 15, decor: 25 },
  });
});

test("home bundle admin exposes outdoor limits and explicit building/mailbox types", () => {
  const source = read("client/src/components/HomeBundleSection.tsx");

  assert.match(source, /input-bundle-max-outdoor-pets/);
  assert.match(source, /input-bundle-max-outdoor-decor/);
  assert.match(source, /button-new-object-type-/);
  assert.match(source, /button-change-object-type-/);
  assert.match(source, /buildingType: newBuildingType/);
  assert.match(source, /newBuildingType === "building"/);
  assert.match(source, /Math\.min\(600, b\.width \+ 20\)/);

  assert.doesNotMatch(source, /button-grant-bundle-everyone/);
  assert.doesNotMatch(source, /grantEveryoneMutation/);
});

test("player and visitor homes use explicit mailbox metadata while retaining legacy fallback", () => {
  const owner = read("client/src/pages/PetHousePage.tsx");
  const visitor = read("client/src/pages/VisitPetHousePage.tsx");

  assert.match(owner, /building\.buildingType === "mailbox"/);
  assert.match(owner, /!building\.buildingType && building\.name\.toLowerCase\(\)\.includes\("mailbox"\)/);
  assert.match(owner, /const isMailbox = isMailboxBuilding\(b\)/);
  assert.match(visitor, /b\.buildingType === "mailbox"/);
  assert.match(visitor, /!b\.buildingType/);
});

test("Pet House placement UI uses shared capacity resolvers and preserves per-building overrides", () => {
  const source = read("client/src/pages/PetHousePage.tsx");
  const shared = read("shared/housing.ts");

  assert.match(source, /getHouseOutdoorPetLimit\(activeBundle\)/);
  assert.match(source, /getHouseOutdoorDecorLimit\(activeBundle\)/);
  assert.match(source, /getHouseBuildingPetLimit\(building\)/);
  assert.match(source, /getHouseBuildingDecorLimit\(building\)/);
  assert.match(shared, /getHouseBuildingPetLimit/);
  assert.match(shared, /building\?\.maxPets/);
});
