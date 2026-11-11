import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  FISHING_CATCH_XP_BY_RARITY, FISHING_XP_DAILY_CAP,
  fishingCatchXpForRarity, INITIAL_PLAYER_PROGRESSION,
  playerProgressionResponse, planSeerElevation,
  totalXpRequiredForPlayerLevel,
} from "../shared/playerProgression";

const read = (file: string) => readFileSync(file, "utf8");

test("fishing XP scales by authoritative fish rarity with a modest daily ceiling", () => {
  assert.deepEqual(FISHING_CATCH_XP_BY_RARITY, { 1: 2, 2: 3, 3: 5, 4: 10, 5: 25 });
  for (const [rarity, amount] of Object.entries(FISHING_CATCH_XP_BY_RARITY)) {
    assert.equal(fishingCatchXpForRarity(Number(rarity)), amount);
  }
  assert.equal(fishingCatchXpForRarity(0), 2);
  assert.equal(fishingCatchXpForRarity(99), 25);
  assert.equal(fishingCatchXpForRarity(Number.NaN), 2);
  assert.equal(FISHING_XP_DAILY_CAP, 50);
  assert.ok(FISHING_XP_DAILY_CAP <= 2 * fishingCatchXpForRarity(5));
});

test("successful catches, not misses or replays, award rarity XP through owned one-use attempt IDs", () => {
  const route = read("server/routes/fishing.routes.ts");
  const attempt = read("server/fishingAttempt.ts");
  const storage = read("server/playerProgressionStorage.ts");
  assert.match(route, /if \(result\.caught && !result\.replayed\)/);
  assert.match(route, /\(result\.item as any\)\?\.starRarity/);
  assert.match(route, /awardPlayerFishingCatchXp\(/);
  assert.doesNotMatch(route, /eventId: playerXpDayKey\(\)/);
  assert.match(attempt, /if \(attempt\.status === "completed" && attempt\.result_json\)/);
  assert.match(attempt, /replayed: true/);
  assert.match(attempt, /SELECT \* FROM shop_items WHERE id = \$\{attempt\.selected_fish_id\}/);
  assert.match(storage, /eventId = `\$\{dayKey\}:\$\{attemptId\}`/);
  assert.match(storage, /\.for\("update"\)/);
  assert.match(storage, /FISHING_XP_DAILY_CAP - Number\(daily\?\.amount \?\? 0\)/);
  assert.match(storage, /like\(playerXpReceipts\.eventId, `\$\{dayKey\}%`\)/);
  assert.match(storage, /awardPlayerXpInTransaction\(tx, userId/);
});

test("all accounts start with one star, including legacy zero-star progression", () => {
  assert.equal(INITIAL_PLAYER_PROGRESSION.stars, 1);
  assert.equal(playerProgressionResponse(null).stars, 1);
  assert.equal(playerProgressionResponse({ level: 4, totalXp: 330, stars: 0 }).stars, 1);
  assert.equal(playerProgressionResponse({ level: 4, totalXp: 330, stars: 3 }).stars, 3);
  assert.equal(playerProgressionResponse({ level: 100, totalXp: 1_000_000, stars: 5 }).canElevate, false);
  const migration = read("server/startup/migrations/ensurePlayerProgressionStorage.ts");
  const schema = read("shared/schema.ts");
  assert.match(migration, /UPDATE player_progression SET stars = 1 WHERE stars = 0/);
  assert.match(migration, /ALTER COLUMN stars SET DEFAULT 1/);
  assert.match(schema, /stars: integer\("stars"\)\.notNull\(\)\.default\(1\)/);
  assert.equal(planSeerElevation({level: 100,totalXp: 200_000,stars: 0,cycleStartXp:0})?.stars,2);
});

test("moderate level curve grows every level without hard high-level cliffs", () => {
  const increments = [];
  for (let level = 1; level < 100; level++) {
    increments.push(totalXpRequiredForPlayerLevel(level+1)-totalXpRequiredForPlayerLevel(level));
  }
  assert.equal(increments[0],80);
  assert.equal(increments[1],110);
  assert.equal(increments[2],140);
  assert.equal(increments[9],350);
  for (let i=1; i<increments.length; i++)
    assert.equal(increments[i]-increments[i-1],30,"increase each level by a steady 30 XP");
});
