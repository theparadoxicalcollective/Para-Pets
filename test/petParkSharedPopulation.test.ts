import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const client = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("park scene shares publicly displayed pets, preserving idle private deposits and reward records", () => {
  assert.match(server, /const sharedPets = await db\.select/);
  assert.match(server, /eq\(petParkDeposits\.showInPark, true\), isNull\(petParkDeposits\.buildingId\)/);
  assert.match(server, /isNotNull\(petParkDeposits\.parkXPct\)/);
  assert.match(server, /items, deposits, sharedPets, unlockedSlots/);
  assert.match(server, /eq\(petParkDeposits\.userId, userId\)/);
  assert.match(server, /if \(!canEnterPark\)/);
  assert.doesNotMatch(server.split("const sharedPets = await db.select")[1].split("}).from(petParkDeposits)")[0], /coins|essence|checkpointAt|pausedDurationMs/);
});

test("shared pet scene has stable placement, public cosmetics, pet inspection and refresh", () => {
  assert.match(client, /parkPositions\.get\(pet\.petInventoryId\)/);
  assert.match(client, /isParkPetNearViewport\(/);
  assert.match(client, /arrangeParkVisitors\(/);
  assert.match(client, /costumeAccess=\{isMine \? "owner" : "public"\}/);
  assert.match(client, /Keeper: \{inspectedPet\.ownerName\}/);
  assert.match(client, /refetchInterval: 30_000/);
  assert.match(client, /const outdoorPets = scene\?\.sharedPets \?\? \[\]/);
  assert.match(client, /outdoorPets\.map/);
  assert.doesNotMatch(client, /indoorVisiblePets\.map\(pet =>/);
  assert.match(client, /data-testid="pet-park-outdoor-drag"/);
  assert.match(client, /\(scene\?\.sharedPets \?\? \[\]\)\.length/);
  assert.match(client, /scene && !activeBuilding && <div/);
});
