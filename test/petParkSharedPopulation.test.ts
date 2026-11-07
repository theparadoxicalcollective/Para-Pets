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

test("crowded park selects first outdoor pet per other owner without changing private or indoor pets", () => {
  const selection = readFileSync("server/petPark/publicOutdoorPopulation.ts", "utf8");
  assert.match(selection, /const firstOutdoor = alias\(petParkDeposits, "first_outdoor"\)/);
  assert.match(selection, /selectDistinctOn\(\[firstOutdoor\.userId\]/);
  assert.match(selection, /ne\(firstOutdoor\.userId, viewerId\)/);
  assert.match(selection, /isNull\(firstOutdoor\.withdrawnAt\)/);
  assert.match(selection, /eq\(firstOutdoor\.showInPark, true\)/);
  assert.match(selection, /isNull\(firstOutdoor\.buildingId\)/);
  assert.match(selection, /isNotNull\(firstOutdoor\.parkXPct\)/);
  assert.match(selection, /isNotNull\(firstOutdoor\.parkYPct\)/);
  assert.match(selection, /orderBy\(firstOutdoor\.userId, firstOutdoor\.slotNumber,/,
    "the lowest actually displayed slot wins for another owner");
  assert.match(selection, /count\(\*\) over \(\)/,
    "crowd detection considers the distinct other owners");
  assert.match(selection, /leftJoin\(petParkPresence/);
  assert.match(selection, /lte\(rankedOutdoorOwners\.ownerCount, PARK_PUBLIC_OUTDOOR_OWNER_BUDGET\)/);
  assert.match(selection, /gte\(rankedOutdoorOwners\.lastSeenAt, activeSince\)/);
  assert.match(selection, /\.limit\(PARK_PUBLIC_OUTDOOR_OWNER_BUDGET\)/);
  assert.match(selection, /export const PARK_PUBLIC_OUTDOOR_OWNER_BUDGET = 40/);
  assert.match(selection, /export const PARK_ACTIVE_PRESENCE_MS = 15 \* 60 \* 1000/);
  assert.match(server, /visibleOtherParkOutdoorIds\(db, userId, activeSince\)/);
  assert.match(server, /onConflictDoUpdate\(\{/);
  assert.match(server, /setWhere: lt\(petParkPresence\.lastSeenAt, refreshBefore\)/,
    "the 30-second refresh must not write presence every time");

  const roster = server.split("const sharedPets = await db.select")[1]?.split("return res.json")[0];
  assert.ok(roster);
  assert.match(roster, /or\(eq\(petParkDeposits\.userId, userId\),\s*inArray\(petParkDeposits\.id, visibleOtherOutdoorIds\)\)/,
    "the viewer retains all their own outdoor pets");
  assert.match(roster, /isNotNull\(petParkDeposits\.buildingId\)/,
    "indoor occupants are not capped by outdoor crowd control");
  assert.doesNotMatch(roster, /pausedAt|earnedDurationMs|coinsPerHour/,
    "public rows never expose owners' rewards or balances");
  const migration = readFileSync("server/startup/migrations/ensurePetParkStorage.ts", "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS pet_park_presence/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS pet_park_presence_recent_idx/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS pet_park_deposits_outdoor_first_active_idx/);
  const client = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");
  assert.match(client, /const deposits = scene\?\.deposits \?\? \[\]/);
  assert.match(client, /outdoorPets\.map\(pet =>/);
  assert.match(client, /indoorVisiblePets\.map\(pet =>/);
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
