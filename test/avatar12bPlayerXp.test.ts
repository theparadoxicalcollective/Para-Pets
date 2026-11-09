import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { playerXpDayKey } from "../server/playerXpDayKey";
import {
  PLAYER_XP_REWARDS,
  PLAYER_MAX_LEVEL,
  levelForPlayerTotalXp,
  playerProgressionResponse,
  totalXpRequiredForPlayerLevel,
} from "../shared/playerProgression";

const read = (path: string) => readFileSync(path, "utf8");

test("player XP is primarily quest-based, account-owned, and monotonically leveled", () => {
  assert.equal(PLAYER_XP_REWARDS.storyQuest, 120);
  assert.equal(PLAYER_XP_REWARDS.dailyQuest, 30);
  assert.ok(PLAYER_XP_REWARDS.storyQuest > PLAYER_XP_REWARDS.dailyQuest);
  for (const source of [
    "clearingVictory", "clearingBoss", "pvpWin",
    "newBadge", "minigameBest", "fishingDailyCatch",
  ] as const) {
    assert.ok(PLAYER_XP_REWARDS[source] < PLAYER_XP_REWARDS.dailyQuest, source);
  }
  assert.equal(levelForPlayerTotalXp(0), 1);
  for (let level = 2; level <= PLAYER_MAX_LEVEL; level++) {
    const threshold = totalXpRequiredForPlayerLevel(level);
    assert.equal(levelForPlayerTotalXp(threshold - 1), level - 1);
    assert.equal(levelForPlayerTotalXp(threshold), level);
  }
  assert.deepEqual(playerProgressionResponse({ level: 1, totalXp: 120 }), {
    level: 2, totalXp: 120, nextLevelTotalXp: 240, xpToNextLevel: 120,
  });
});

test("daily mini-game and fishing receipts use Central calendar boundaries", () => {
  assert.equal(playerXpDayKey(new Date("2026-11-09T05:59:00Z")), "2026-11-08");
  assert.equal(playerXpDayKey(new Date("2026-11-09T06:01:00Z")), "2026-11-09");
  assert.equal(playerXpDayKey(new Date("2026-07-09T04:59:00Z")), "2026-07-08");
  assert.equal(playerXpDayKey(new Date("2026-07-09T05:01:00Z")), "2026-07-09");
});

test("story and daily claims grant XP in the same transaction as existing rewards", () => {
  for (const path of [
    "server/routes/ginnyQuest.routes.ts",
    "server/routes/jansonQuest.routes.ts",
    "server/routes/lonelleQuest.routes.ts",
    "server/routes/quest.routes.ts",
  ]) {
    const source = read(path);
    assert.match(source, /db\.transaction\(async/);
    assert.match(source, /awardPlayerXpInTransaction\(tx,/);
    assert.doesNotMatch(source, /\/api\/player\/xp\/award/);
  }
  const janson = read("server/routes/jansonQuest.routes.ts");
  assert.match(janson, /repeatable \? PLAYER_XP_REWARDS\.dailyQuest : PLAYER_XP_REWARDS\.storyQuest/);
});

test("Clearing victories use trusted defeat receipt and keep pet XP separate", () => {
  const clearing = read("server/routes/elysianClearingCombat.routes.ts");
  assert.match(clearing, /INSERT INTO game_settings/);
  assert.match(clearing, /if \(!inserted\.rows\.length\) return null/);
  assert.match(clearing, /awardPlayerXpInTransaction\(tx, userId/);
  assert.match(clearing, /eventId: enemyInstanceId/);
  assert.match(clearing, /pet_level_points/);
});

test("small PvP, badge, fishing, and mini-game XP only attaches to saved events", () => {
  const pvp = read("server/routes/pvp.routes.ts");
  assert.match(pvp, /consumePvpBattleToken/);
  assert.match(pvp, /source: "pvp_win", eventId: String\(battle\.id\)/);
  const badges = read("server/routes.ts");
  assert.match(badges, /previouslyOwned/);
  assert.match(badges, /await maybeAwardBrawlerBadges\(row\.user_id, row\.win_count, false\)/);
  assert.match(badges, /await maybeAwardFisherBadges\(row\.id, row\.total_fish_caught, false\)/);
  assert.match(badges, /source: "gameplay_badge"/);
  const fishing = read("server/routes/fishing.routes.ts");
  assert.match(fishing, /result\.caught && !result\.replayed/);
  assert.match(fishing, /source: "fishing_catch", eventId: playerXpDayKey\(\)/);
  for (const path of ["server/routes/lavaCrawl.routes.ts", "server/routes/moltenBlocks.routes.ts"]) {
    const source = read(path);
    assert.match(source, /source: "minigame_best"/);
    assert.match(source, /PLAYER_XP_REWARDS\.minigameBest/);
    assert.match(source, /playerXpDayKey\(\)/);
    assert.match(source, /FOR UPDATE/);
  }
});

test("Lava Crawl displays owned eight-part player character instead of selected pet", () => {
  const lava = read("client/src/pages/LavaCrawlPage.tsx");
  assert.match(lava, /fetchPlayerAvatar/);
  assert.match(lava, /playerAvatarQueryKey/);
  assert.match(lava, /wardrobeLayers/);
  assert.match(lava, /<PlayerCharacterRenderer parts=\{avatar\.base\.parts\}/);
  assert.match(lava, /data-testid="lava-player-avatar"/);
  assert.doesNotMatch(lava, /petImgRef|petLevelRef|activePetId|gainExpRef/);
  const server = read("server/routes/lavaCrawl.routes.ts");
  assert.doesNotMatch(server, /updateInventoryItem|userInventory/);
  assert.match(server, /status\(410\)/);
  const progressionRoutes = read("server/routes/playerProgression.routes.ts");
  assert.doesNotMatch(progressionRoutes, /app\.(post|put|patch|delete)\(/);
});
