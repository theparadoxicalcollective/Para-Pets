import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const jobs = readFileSync("server/veridianWatcher/backgroundJobs.ts", "utf8");

test("Veridian Watcher scheduled jobs are isolated from the legacy route registry", () => {
  assert.match(
    legacyRoutes,
    /import \{ startVeridianWatcherBackgroundJobs \} from "\.\/veridianWatcher\/backgroundJobs"/,
  );
  assert.match(
    legacyRoutes,
    /startVeridianWatcherBackgroundJobs\(\{ db, storage, postWatcherMessage \}\)/,
  );

  assert.doesNotMatch(legacyRoutes, /VW_QUOTE_INTERVAL_MS/);
  assert.doesNotMatch(legacyRoutes, /LEADERBOARD_CHECK_MS/);
  assert.doesNotMatch(legacyRoutes, /pvpMonitorRunning/);
  assert.doesNotMatch(legacyRoutes, /checkLeaderboardRanks/);
});

test("Watcher polling cadence and startup priming remain unchanged", () => {
  assert.match(jobs, /const VW_QUOTE_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(jobs, /const LEADERBOARD_CHECK_MS = 10 \* 60 \* 1000/);
  assert.match(jobs, /const PVP_LEADERBOARD_CHECK_MS = 5 \* 60 \* 1000/);
  assert.match(jobs, /void checkLeaderboardRanks\(\);/);
  assert.match(jobs, /getPvpLeaderboard\(20\)/);
});

test("Watcher leaderboard sources and shoutout rules are preserved", () => {
  for (const source of [
    "coin_purchases",
    "fishing_leaderboard",
    "molten_blocks_high_score",
    "lava_crawl_scores",
  ]) {
    assert.match(jobs, new RegExp(source));
  }

  assert.match(jobs, /if \(entry\.rank > 3\) continue/);
  assert.match(jobs, /SELECT watcher_shoutouts_enabled FROM users WHERE id/);
  assert.match(jobs, /if \(newRank > 10\) continue/);
  assert.match(jobs, /fullUser\?\.watcherShoutoutsEnabled === false/);
  assert.match(jobs, /A new champion rises!/);
  assert.match(jobs, /A formidable challenger emerges!/);
});

test("slow leaderboard ticks cannot overlap", () => {
  assert.match(jobs, /let leaderboardMonitorRunning = false/);
  assert.match(jobs, /if \(leaderboardMonitorRunning\) return/);
  assert.match(jobs, /leaderboardMonitorRunning = true/);
  assert.match(jobs, /finally \{\s*leaderboardMonitorRunning = false;/);

  assert.match(jobs, /let pvpMonitorRunning = false/);
  assert.match(jobs, /if \(pvpMonitorRunning\) return/);
  assert.match(jobs, /pvpMonitorRunning = true/);
  assert.match(jobs, /finally \{\s*pvpMonitorRunning = false;/);
});

test("quote schedule and Watcher posting remain behaviorally unchanged", () => {
  assert.match(jobs, /storage\.getVWQuotes\(\)/);
  assert.match(jobs, /Math\.floor\(Math\.random\(\) \* quotes\.length\)/);
  assert.match(jobs, /postWatcherMessage\(`𖢻 \$\{pick\.message\}`\)/);
  assert.match(legacyRoutes, /userId: VERIDIAN_WATCHER_ID/);
  assert.match(legacyRoutes, /username: "Veridian Watcher"/);
  assert.match(legacyRoutes, /isBot: true/);
});
