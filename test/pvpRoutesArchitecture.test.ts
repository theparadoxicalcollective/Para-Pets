import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const pvpRoutes = readFileSync("server/routes/pvp.routes.ts", "utf8");

const expected = [
  "GET /api/pvp/opponent",
  "POST /api/pvp/result",
  "POST /api/pvp/start",
  "GET /api/pvp/tickets",
  "GET /api/pvp/tickets/bundles",
  "POST /api/pvp/tickets/buy",
  "GET /api/pvp/history",
  "GET /api/pvp/leaderboard",
  "GET /api/pvp/battle-group",
  "POST /api/pvp/battle-group",
  "GET /api/pvp/opponents",
  "GET /api/pvp/opponent-pets/:userId",
].sort();

function pvpEndpoints(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
    .filter((route) => route.includes("/api/pvp/"))
    .sort();
}

test("PvP routes are isolated and registered exactly once", () => {
  assert.match(
    legacyRoutes,
    /import \{ registerPvpRoutes \} from "\.\/routes\/pvp\.routes"/,
  );
  assert.match(
    legacyRoutes,
    /registerPvpRoutes\(app, \{ storage, isAuthenticated, publicAccount, maybeAwardBrawlerBadges \}\)/,
  );
  assert.deepEqual(pvpEndpoints(pvpRoutes), expected);
  assert.deepEqual(pvpEndpoints(legacyRoutes), []);
});

test("all PvP endpoints keep authenticated access", () => {
  const registrations = Array.from(
    pvpRoutes.matchAll(/app\.(get|post)\(\s*["'`]\/api\/pvp\/[^"'`]+["'`]\s*,\s*isAuthenticated/g),
  );
  assert.equal(registrations.length, expected.length);
});

test("PvP battle-token, scoring, and passive defender safeguards remain unchanged", () => {
  assert.match(pvpRoutes, /consumePvpBattleToken\(user\.id, String\(battleToken \|\| ""\)\)/);
  assert.match(pvpRoutes, /Missing or invalid battle token/);
  assert.match(pvpRoutes, /myPower >= oppPower \* 1\.25/);
  assert.match(pvpRoutes, /myPower <= oppPower \* 0\.8/);
  assert.match(pvpRoutes, /difficulty === "easy" \? 4 : difficulty === "hard" \? 12 : 9/);
  assert.match(pvpRoutes, /const coinsEarned = 0/);
  assert.match(pvpRoutes, /battlePointsDelta: 5/);
  assert.match(
    pvpRoutes,
    /String\(opponentUserId\) !== String\(user\.id\)/,
  );
});

test("PvP ticket economy remains server-authoritative and atomic", () => {
  assert.match(pvpRoutes, /startPvpBattleAtomic\(user\.id\)/);
  assert.match(pvpRoutes, /"1":\s*\{ tickets: 1,\s*cost: 50 \}/);
  assert.match(pvpRoutes, /"3":\s*\{ tickets: 3,\s*cost: 250 \}/);
  assert.match(pvpRoutes, /"6":\s*\{ tickets: 6,\s*cost: 500 \}/);
  assert.match(pvpRoutes, /"15":\s*\{ tickets: 15,\s*cost: 1250 \}/);
  assert.match(pvpRoutes, /const PVP_TICKET_CAP = 100/);
  assert.match(pvpRoutes, /purchasePvpTicketBundleAtomic/);
});

test("PvP pet, leaderboard, and matchmaking rules remain unchanged", () => {
  assert.match(pvpRoutes, /petMood: newMood/);
  assert.match(pvpRoutes, /\(activePet\.petMood \?\? 100\) - 3/);
  assert.match(pvpRoutes, /const top = all\.slice\(0, 100\)/);
  assert.match(pvpRoutes, /hidden: true/);
  assert.match(pvpRoutes, /petInventoryIds\.slice\(0, 5\)/);
  assert.match(pvpRoutes, /inBand\(others, 0\.35\)/);
  assert.match(pvpRoutes, /inBand\(others, 0\.60\)/);
});

test("PvP win badges remain fire-and-forget", () => {
  assert.match(pvpRoutes, /storage\.countPvpWins\(user\.id\)/);
  assert.match(pvpRoutes, /maybeAwardBrawlerBadges\(user\.id, totalWins\)/);
  assert.match(pvpRoutes, /\.catch\(\(\) => \{\}\)/);
});
