import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync("server/routes/petParkPlayer.routes.ts", "utf8");
const client = readFileSync("client/src/pages/PetParkPage.tsx", "utf8");

test("park scene shares active pets across owners while preserving private deposit actions", () => {
  assert.match(server, /const sharedPets = await db\.select/);
  assert.match(server, /\.where\(isNull\(petParkDeposits\.withdrawnAt\)\)/);
  assert.match(server, /items, deposits, sharedPets, unlockedSlots/);
  assert.match(server, /eq\(petParkDeposits\.userId, userId\)/);
  assert.match(server, /!settings\?\.enabledForPlayers && !player\?\.isAdmin/);
  assert.doesNotMatch(server.split("const sharedPets = await db.select")[1].split("}).from(petParkDeposits)")[0], /coins|essence|checkpointAt|pausedDurationMs/);
});

test("shared pet scene has stable placement, public cosmetics, pet inspection and refresh", () => {
  assert.match(client, /sharedPetPosition\(index, all\.length\)/);
  assert.match(client, /costumeAccess=\{isMine \? "owner" : "public"\}/);
  assert.match(client, /Keeper: \{inspectedPet\.ownerName\}/);
  assert.match(client, /refetchInterval: 30_000/);
  assert.match(client, /\(scene\.sharedPets \?\? \[\]\)\.map/);
  assert.match(client, /\(scene\.sharedPets \?\? \[\]\)\.length/);
  assert.match(client, /scene && <div/);
});
