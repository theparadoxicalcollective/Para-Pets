import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PLAYER_PET_TEAM_MAX, samePetTeam, eligiblePetIds,
  cleanPetTeam, togglePetTeamMember, playerPetTeamQueryKey,
} from "../client/src/lib/playerPetTeam";

const inventory = [
  { inventoryId: "cow", type: "pet", isHatched: true, isListed: false },
  { inventoryId: "deer", type: "pet", isHatched: true, isListed: false },
  { inventoryId: "mummy", type: "pet", isHatched: true, isListed: false },
  { inventoryId: "fox", type: "pet", isHatched: true, isListed: false },
  { inventoryId: "dog", type: "pet", isHatched: true, isListed: false },
  { inventoryId: "owl", type: "pet", isHatched: true, isListed: false },
  { inventoryId: "egg", type: "pet", isHatched: false, isListed: false },
  { inventoryId: "sold", type: "pet", isHatched: true, isListed: true },
  { inventoryId: "collar", type: "costume", isHatched: true, isListed: false },
];

test("companion-team picker only includes owned, hatched, unlisted pet rows", () => {
  assert.deepEqual(eligiblePetIds(inventory), ["cow", "deer", "mummy", "fox", "dog", "owl"]);
});

test("team selection can fill, remove and replace the first slot without an active-pet lock", () => {
  const allowed = eligiblePetIds(inventory);
  const one = togglePetTeamMember([], "cow", allowed);
  assert.deepEqual(one, ["cow"]);
  const two = togglePetTeamMember(one, "deer", allowed);
  assert.deepEqual(two, ["cow", "deer"]);
  assert.deepEqual(togglePetTeamMember(two, "cow", allowed), ["deer"]);
  assert.deepEqual(togglePetTeamMember(["deer"], "cow", allowed), ["deer", "cow"]);
});

test("duplicates and ghost rows cannot count toward the five-pet limit", () => {
  const allowed = eligiblePetIds(inventory);
  assert.equal(PLAYER_PET_TEAM_MAX, 5);
  assert.deepEqual(cleanPetTeam(["egg", "cow", "cow", "sold", "deer", "mummy"], allowed),
    ["cow", "deer", "mummy"]);
  const five = ["cow", "deer", "mummy", "fox", "dog"];
  assert.deepEqual(togglePetTeamMember(five, "owl", allowed), five);
  assert.deepEqual(togglePetTeamMember(five, "cow", allowed), ["deer", "mummy", "fox", "dog"]);
  assert.deepEqual(togglePetTeamMember(["cow", "egg"], "collar", allowed), ["cow"]);
});

test("client team cache is scoped to the authenticated user", () => {
  assert.deepEqual(playerPetTeamQueryKey("keeper-1"), ["/api/player/pet-team", "keeper-1"]);
  assert.notDeepEqual(playerPetTeamQueryKey("keeper-1"), playerPetTeamQueryKey("keeper-2"));
  assert.equal(samePetTeam(["a", "b"], ["a", "b"]), true);
  assert.equal(samePetTeam(["b", "a"], ["a", "b"]), false);
});

test("PvP and Raid share one server team and do not auto-lock the legacy active pet", () => {
  const pvp = readFileSync("client/src/pages/PvpArenaPage.tsx", "utf8");
  const raid = readFileSync("client/src/pages/RaidPage.tsx", "utf8");
  const hook = readFileSync("client/src/hooks/usePlayerPetTeam.ts", "utf8");

  assert.match(pvp, /usePlayerPetTeam\(me\?\.id\)/);
  assert.match(raid, /usePlayerPetTeam\(me\?\.id\)/);
  assert.match(pvp, /togglePetTeamMember\(selectedPetIds/);
  assert.match(raid, /togglePetTeamMember\(selectedPetIds/);
  assert.doesNotMatch(pvp, /activePetId|isActivePetHere|setSelectedPetIds/);
  assert.doesNotMatch(raid, /activePetId|isActivePetHere|raid:petIds:v1|setSelectedPetIds/);
  assert.match(hook, /scope: \{ id: "para-pets-player-team" \}/);
  assert.match(hook, /api\/player\/pet-team/);
  assert.match(hook, /queryClient\.setQueryData\(playerPetTeamQueryKey/);
});

test("Raid battle consumes a session snapshot of the confirmed shared team, not an old device roster", () => {
  const lobby = readFileSync("client/src/pages/RaidPage.tsx", "utf8");
  const battle = readFileSync("client/src/pages/RaidBattlePage.tsx", "utf8");
  assert.match(lobby, /getQueryData<PlayerPetTeam>\(playerPetTeamQueryKey\(me\?\.id\)\)/);
  assert.match(lobby, /raid:session-petIds:v2/);
  assert.match(battle, /raid:session-petIds:v2/);
  assert.match(battle, /localStorage\.removeItem\(RAID_SESSION_PETS_LS_KEY\)/);
  assert.doesNotMatch(battle, /raid:petIds:v1|hatched\.slice\(0, 5\)/);
  assert.match(lobby, /if \(!teamReady \|\| teamSaving\)/);
});
