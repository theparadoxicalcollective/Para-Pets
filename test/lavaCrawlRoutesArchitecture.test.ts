import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const lavaRoutes = readFileSync("server/routes/lavaCrawl.routes.ts", "utf8");

const expected = [
  "POST /api/lava-crawl/complete",
  "POST /api/lava-crawl/gain-exp",
  "GET /api/lava-crawl/my-best",
  "GET /api/lava-crawl/leaderboard",
].sort();

function lavaEndpoints(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
    .filter((route) => route.includes("/api/lava-crawl/"))
    .sort();
}

test("Lava Crawl routes are isolated and registered exactly once", () => {
  assert.match(
    legacyRoutes,
    /import \{ registerLavaCrawlRoutes \} from "\.\/routes\/lavaCrawl\.routes"/,
  );
  assert.match(
    legacyRoutes,
    /registerLavaCrawlRoutes\(app, \{ storage, db, isAuthenticated, applyPetXp \}\)/,
  );
  assert.deepEqual(lavaEndpoints(lavaRoutes), expected);
  assert.deepEqual(lavaEndpoints(legacyRoutes), []);
});

test("all Lava Crawl endpoints remain authenticated", () => {
  const registrations = Array.from(
    lavaRoutes.matchAll(
      /app\.(get|post)\(\s*["'`]\/api\/lava-crawl\/[^"'`]+["'`]\s*,\s*isAuthenticated/g,
    ),
  );
  assert.equal(registrations.length, expected.length);
});

test("completed-run score and coin caps remain unchanged", () => {
  assert.match(
    lavaRoutes,
    /Math\.max\(0, Math\.min\(999999, Math\.floor\(score\)\)\)/,
  );
  assert.match(
    lavaRoutes,
    /Math\.max\(0, Math\.min\(500, Math\.floor\(coinsCollected\)\)\)/,
  );
  assert.match(lavaRoutes, /INSERT INTO lava_crawl_scores/);
  assert.match(lavaRoutes, /storage\.addCoins\(user\.id, safeCoins\)/);
  assert.match(lavaRoutes, /return res\.json\(\{ ok: true, isNewBest, newCoins: updatedUser\?\.coins \}\)/);
});

test("Lava Crawl XP stays on the shared pet-leveling curve", () => {
  assert.match(
    lavaRoutes,
    /const EXP_PER_KILL = Math\.floor\(8 \* \(1 \+ \(prevLevel - 1\) \* 0\.1\)\)/,
  );
  assert.match(
    lavaRoutes,
    /applyPetXp\(prevLevel, petInv\.petLevelPoints \|\| 0, EXP_PER_KILL\)/,
  );
  assert.match(lavaRoutes, /storage\.updateInventoryItem\(petInv\.id, updates\)/);
  assert.match(lavaRoutes, /xpGranted: EXP_PER_KILL/);
});

test("personal-best and top-ten leaderboard contracts remain unchanged", () => {
  assert.match(lavaRoutes, /SELECT MAX\(score\) AS best, MAX\(coins_collected\) AS best_coins/);
  assert.match(lavaRoutes, /return res\.json\(\{ best: r\.best \?\? 0, bestCoins: r\.best_coins \?\? 0 \}\)/);
  assert.match(lavaRoutes, /GROUP BY u\.id, u\.username, u\.profile_image/);
  assert.match(lavaRoutes, /ORDER BY best_score DESC/);
  assert.match(lavaRoutes, /LIMIT 10/);
});

test("Lava Crawl remains separate from client lifecycle cleanup", () => {
  const clientLifecycle = readFileSync("test/lavaCrawlLifecycle.test.ts", "utf8");
  assert.match(clientLifecycle, /removes the same keyboard listeners that it registers/);
});
