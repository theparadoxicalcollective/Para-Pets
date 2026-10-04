import assert from "node:assert/strict";
import test from "node:test";
import {
  getHouseBuildingDecorLimit,
  getHouseBuildingPetLimit,
  getHouseOutdoorPetLimit,
} from "../shared/housing";
import { getPetHomeOverflowInventoryIds } from "../server/housing/petCapacity";

test("legacy building maxPets overrides size capacity", () => {
  assert.equal(
    getHouseBuildingPetLimit({ size: "medium", maxPets: 3 }),
    3,
  );
  assert.equal(
    getHouseBuildingDecorLimit({ size: "small" }),
    5,
  );
});

test("unset capacity fields fall back instead of being treated as zero", () => {
  assert.equal(
    getHouseBuildingPetLimit({ size: "small", maxPets: null }),
    3,
  );
  assert.equal(
    getHouseOutdoorPetLimit({ maxOutdoorPets: null }),
    6,
  );
});

test("bundle outdoor pet capacity supports ten pets and overflows the eleventh", () => {
  const positions = Array.from({ length: 11 }, (_, index) => ({
    inventoryId: `pet-${index + 1}`,
    location: "outside",
  }));

  const overflow = getPetHomeOverflowInventoryIds(positions, {
    maxOutdoorPets: 10,
    buildings: [],
  });

  assert.deepEqual(overflow, ["pet-11"]);
  assert.equal(getHouseOutdoorPetLimit({ maxOutdoorPets: 10 }), 10);
});

test("interior reconciliation keeps the oldest allowed pets and returns overflow", () => {
  const positions = [
    { inventoryId: "pet-a", location: "building-1" },
    { inventoryId: "pet-b", location: "building-1" },
    { inventoryId: "pet-c", location: "building-1" },
    { inventoryId: "pet-d", location: "building-1" },
  ];

  const overflow = getPetHomeOverflowInventoryIds(positions, {
    maxOutdoorPets: 10,
    buildings: [{
      id: "building-1",
      size: "medium",
      maxPets: 3,
      buildingType: "building",
    }],
  });

  assert.deepEqual(overflow, ["pet-d"]);
});

test("positions targeting missing buildings or mailboxes are returned to inventory", () => {
  const overflow = getPetHomeOverflowInventoryIds(
    [
      { inventoryId: "missing", location: "old-building" },
      { inventoryId: "mail", location: "mailbox-1" },
    ],
    {
      maxOutdoorPets: 10,
      buildings: [{
        id: "mailbox-1",
        size: "small",
        maxPets: 3,
        buildingType: "mailbox",
      }],
    },
  );

  assert.deepEqual(overflow, ["missing", "mail"]);
});
