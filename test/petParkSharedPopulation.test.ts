import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const client = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("park scene shares publicly displayed pets, preserving idle private deposits and reward records", () => {
  assert.match(server, /const sharedPets = await db\.select/);
  assert.match(server, /eq\(petParkDeposits\.showInPark, true\), isNull\(petParkDeposits\.buildingId\)/);
  assert.match(server, /isNotNull\(petParkDeposits\.buildingId\)/);
  assert.match(server, /isNotNull\(petParkDeposits\.parkXPct\)/);
  assert.match(server, /items, deposits, sharedPets, unlockedSlots/);
  assert.match(server, /eq\(petParkDeposits\.userId, userId\)/);
  assert.match(server, /if \(!canEnterPark\)/);
  assert.doesNotMatch(server.split("const sharedPets = await db.select")[1].split("}).from(petParkDeposits)")[0], /coins|essence|checkpointAt|pausedDurationMs/);
});

test("public outdoor roster publishes only the lowest displayed slot per other owner", () => {
  // Filter in the server's SQL query, not after downloading all three pets to
  // every phone. The local owner still sees and can move all three.
  assert.match(server, /const firstOutdoor = alias\(petParkDeposits, "first_outdoor"\)/);
  const selector = server.split('const firstPublicOutdoorId =')[1]?.split('// Public park roster')[0];
  assert.ok(selector, "first-public-pet database subquery exists");
  assert.match(selector, /selectDistinctOn\(\[firstOutdoor\.userId\]/);
  assert.match(selector, /isNull\(firstOutdoor\.withdrawnAt\)/);
  assert.match(selector, /eq\(firstOutdoor\.showInPark, true\)/);
  assert.match(selector, /isNull\(firstOutdoor\.buildingId\)/);
  assert.match(selector, /isNotNull\(firstOutdoor\.parkXPct\)/);
  assert.match(selector, /isNotNull\(firstOutdoor\.parkYPct\)/);
  assert.match(selector, /orderBy\(firstOutdoor\.userId, firstOutdoor\.slotNumber,/,
    "lowest publicly placed slot wins, not necessarily slot 1 if idle/indoors");
  const roster = server.split("const sharedPets = await db.select")[1]?.split("return res.json")[0];
  assert.ok(roster);
  assert.match(roster, /or\(eq\(petParkDeposits\.userId, userId\),\s*inArray\(petParkDeposits\.id, firstPublicOutdoorId\)\)/,
    "owner's own displayed pets stay visible, others one per owner");
  assert.match(roster, /isNotNull\(petParkDeposits\.buildingId\)/,
    "indoor pets are untouched");
  assert.doesNotMatch(roster, /\.limit\(/, "do not introduce an arbitrary global limit that removes owners");
  assert.doesNotMatch(roster, /pausedAt|earnedDurationMs|coinsPerHour/,
    "public data must remain free of reward and private wallet fields");
  const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS pet_park_deposits_outdoor_first_active_idx/);
  assert.match(migration, /ON pet_park_deposits \(user_id, slot_number, created_at, id\)/);
  assert.match(migration, /WHERE withdrawn_at IS NULL AND show_in_park = true/,
    "partial index supports the exact eligible first-outdoor selection");
  const client = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(client, /outdoorPets\.map\(pet =>/);
  assert.match(client, /const isMine = !!myDeposit/);
  assert.match(client, /indoorVisiblePets\.map\(pet =>/,
    "interior rooms retain original occupant rendering");
  assert.match(client, /const deposits = scene\?\.deposits \?\? \[\]/,
    "three owner slots still come from the independent deposit query");
});

test("shared pet scene has stable placement, public cosmetics, pet inspection and refresh", () => {
  assert.match(client, /parkPositions\.get\(pet\.petInventoryId\)/);
  assert.match(client, /isParkPetNearViewport\(/);
  assert.match(client, /arrangeParkVisitors\(/);
  assert.match(client, /costumeAccess=\{isMine \? "owner" : "public"\}/);
  assert.match(client, /<PlayerDetailPanel userId=\{inspectedPet\.ownerId\}/);
  assert.match(client, /refetchInterval: 30_000/);
  assert.match(client, /const outdoorPets = \(scene\?\.sharedPets \?\? \[\]\)\.filter\(pet => !pet\.buildingId\)/);
  assert.match(client, /outdoorPets\.map/);
  assert.match(client, /indoorVisiblePets\.map\(pet =>/);
  assert.match(client, /data-testid=\{myDeposit \? "pet-park-outdoor-drag" : "pet-park-outdoor-inspect"\}/);
  assert.match(client, /\(scene\?\.sharedPets \?\? \[\]\)\.length/);
  assert.match(client, /scene && !activeBuilding && <div/);
});
