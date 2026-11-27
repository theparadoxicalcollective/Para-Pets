import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HAUNTED_SOUL_EXCHANGE_STONE_NAME, resolveWorldSceneAction, resolveWorldSceneInteriorAction } from "../shared/worlds/worldSceneActions";

const world = "haunted_woods";
const stone = { worldId: world, kind: "decor", name: HAUNTED_SOUL_EXCHANGE_STONE_NAME };
const read = (path: string) => readFileSync(path, "utf8");

test("only the exact Haunted Woods interior stone opens the new Soul Exchange", () => {
  assert.equal(resolveWorldSceneInteriorAction(world, "decor", stone), "soul-exchange");
  assert.equal(resolveWorldSceneInteriorAction(world, "decor", { ...stone, name: " the soul exchange stone " }), "soul-exchange");
  for (const name of ["Soul Exchange", "The Soul Exchange Stone Sign", "Haunted Spin", "Fish Leaderboard"])
    assert.equal(resolveWorldSceneInteriorAction(world, "decor", { ...stone, name }), null);
  assert.equal(resolveWorldSceneInteriorAction("swamp", "decor", stone), null);
  assert.equal(resolveWorldSceneInteriorAction(world, "decor", { ...stone, worldId: "swamp" }), null);
  assert.equal(resolveWorldSceneInteriorAction(world, "decor", { ...stone, kind: "building" }), null);
  assert.equal(resolveWorldSceneInteriorAction(world, "effect", stone), null);
  assert.equal(resolveWorldSceneAction(world, "decor", stone), null, "outdoor decor stays unchanged");
});

test("new stone reuses the server's ownership checks and values without altering the transaction", () => {
  const server = read("server/soulExchange.ts");
  const page = read("client/src/pages/WorldScenePlayerPage.tsx");
  const tray = read("client/src/components/world/WorldSceneSoulExchange.tsx");
  assert.match(server, /ui\.pet_level "petLevel"/);
  assert.match(page, /resolveWorldSceneInteriorAction\(worldId, item\.kind, asset\)/);
  assert.match(page, /WorldSceneSoulExchange = lazy/);
  assert.match(tray, /fetch\("\/api\/soul-exchange\/pets"/);
  assert.match(tray, /state\?\.pets\.filter\(pet => pet\.eligible\)/);
  assert.match(tray, /pet\.petLevel/);
  assert.match(tray, /pet\.rarity/);
  assert.match(tray, /pet\.essenceValue/);
  assert.match(tray, /pet\.imageUrl/);
  assert.match(tray, /getBoundingClientRect\(\)/);
  assert.match(tray, /setPointerCapture/);
  assert.match(tray, /!cancelled[\s\S]*?isOverStone\(event\)/);
  assert.match(tray, /AlertDialog\.Root/);
  assert.match(tray, /petInventoryIds: \[pending\.pet\.inventoryId\], exchangeActionId: pending\.actionId/);
  assert.ok(tray.indexOf("if (!response.ok) throw", tray.indexOf("async function confirmExchange")) <
    tray.indexOf("setReward({ pet: pending.pet"), "reward and removal wait for server success");
  assert.match(tray, /receipt\.newEssenceBalance/);
  assert.match(tray, /receipt\.essenceAwarded/);
  assert.match(tray, /invalidatePlayerOwnershipState\(\)/);
});
