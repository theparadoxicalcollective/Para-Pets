import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const moltenRoutes = readFileSync("server/routes/moltenBlocks.routes.ts", "utf8");

const expected = [
  "POST /api/games/molten-blocks/reward",
  "GET /api/games/molten-blocks/leaderboard",
  "POST /api/games/molten-blocks/score",
  "GET /api/admin/molten-blocks/items",
  "POST /api/admin/molten-blocks/items",
  "DELETE /api/admin/molten-blocks/items/:id",
  "PATCH /api/admin/molten-blocks/items/:id",
  "GET /api/games/molten-blocks/drop-items",
  "POST /api/games/molten-blocks/award-item",
].sort();

function moltenEndpoints(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
    .filter((route) => route.includes("molten-blocks"))
    .sort();
}

test("Molten Blocks routes are isolated and registered exactly once", () => {
  assert.match(
    legacyRoutes,
    /import \{ registerMoltenBlocksRoutes \} from "\.\/routes\/moltenBlocks\.routes"/,
  );
  assert.match(
    legacyRoutes,
    /registerMoltenBlocksRoutes\(app, \{ storage, isAuthenticated, isAdmin \}\)/,
  );
  assert.deepEqual(moltenEndpoints(moltenRoutes), expected);
  assert.deepEqual(moltenEndpoints(legacyRoutes), []);
});

test("Molten Blocks access rules remain unchanged", () => {
  assert.match(
    moltenRoutes,
    /app\.post\("\/api\/games\/molten-blocks\/reward", isAuthenticated/,
  );
  assert.match(
    moltenRoutes,
    /app\.post\("\/api\/games\/molten-blocks\/score", isAuthenticated/,
  );
  assert.match(
    moltenRoutes,
    /app\.post\("\/api\/games\/molten-blocks\/award-item", isAuthenticated/,
  );

  for (const method of ["get", "post", "delete", "patch"]) {
    assert.match(
      moltenRoutes,
      new RegExp(`app\\.${method}\\("\\/api\\/admin\\/molten-blocks\\/items`),
    );
  }
  assert.match(
    moltenRoutes,
    /app\.get\("\/api\/admin\/molten-blocks\/items", isAdmin/,
  );
  assert.match(
    moltenRoutes,
    /app\.post\("\/api\/admin\/molten-blocks\/items", isAdmin/,
  );
  assert.match(
    moltenRoutes,
    /app\.delete\("\/api\/admin\/molten-blocks\/items\/:id", isAdmin/,
  );
  assert.match(
    moltenRoutes,
    /app\.patch\("\/api\/admin\/molten-blocks\/items\/:id", isAdmin/,
  );

  assert.match(
    moltenRoutes,
    /app\.get\("\/api\/games\/molten-blocks\/leaderboard", async/,
  );
  assert.match(
    moltenRoutes,
    /app\.get\("\/api\/games\/molten-blocks\/drop-items", async/,
  );
});

test("Molten Blocks reward anti-abuse limits remain unchanged", () => {
  assert.match(moltenRoutes, /const MB_PER_CALL_CAP = 300/);
  assert.match(moltenRoutes, /const MB_DAILY_CAP = 500/);
  assert.match(moltenRoutes, /const MB_MIN_COOLDOWN_MS = 4_000/);
  assert.match(moltenRoutes, /Math\.min\(MB_PER_CALL_CAP, Math\.floor\(raw\)\)/);
  assert.match(moltenRoutes, /Math\.max\(0, MB_DAILY_CAP - fresh\.total\)/);
  assert.match(moltenRoutes, /now - fresh\.lastAt < MB_MIN_COOLDOWN_MS/);
  assert.match(moltenRoutes, /res\.status\(429\)/);
  assert.match(moltenRoutes, /dailyCapReached: true/);
});

test("Molten Blocks scoring and leaderboard contracts remain unchanged", () => {
  assert.match(moltenRoutes, /submitMoltenBlocksScore\(user\.id, Math\.floor\(score\)\)/);
  assert.match(moltenRoutes, /getMoltenBlocksLeaderboard\(viewerId\)/);
  assert.match(moltenRoutes, /getMoltenBlocksViewerRank\(viewerId\)/);
  assert.match(moltenRoutes, /return res\.json\(\{ top20, viewerRank \}\)/);
});

test("Molten Blocks drop configuration and award validation remain unchanged", () => {
  assert.match(moltenRoutes, /\["common","uncommon","rare"\]\.includes\(rarity\)/);
  assert.match(moltenRoutes, /getMoltenBlocksDropItems\(true\)/);
  assert.match(
    moltenRoutes,
    /dropItems\.some\(i => i\.shopItemId === shopItemId\)/,
  );
  assert.match(moltenRoutes, /Item not in active drop pool/);
  assert.match(moltenRoutes, /addToInventory\(user\.id, shopItemId\)/);
});
