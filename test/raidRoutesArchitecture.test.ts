import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const raidRoutes = readFileSync("server/routes/raid.routes.ts", "utf8");

const expected = [
  "GET /api/raid-status",
  "POST /api/admin/raid-toggle",
  "GET /api/raid-boss",
  "GET /api/raid/leaderboard",
  "GET /api/raid/rewards",
  "POST /api/admin/raid-rewards",
  "POST /api/raid/start-battle",
  "POST /api/raid/deal-damage",
  "POST /api/admin/raid-boss",
  "POST /api/admin/raid-boss-hp",
  "POST /api/admin/raid-distribute-rewards",
  "GET /api/admin/templates-list",
  "GET /api/raid-icon-position",
  "PATCH /api/admin/raid-icon-position",
].sort();

function routesIn(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map(match => `${match[1].toUpperCase()} ${match[2]}`)
    .filter(route => route.includes("/raid") || route === "GET /api/admin/templates-list")
    .sort();
}

test("raid routes live in one dedicated module and remain registered once", () => {
  assert.match(legacyRoutes, /import \{ registerRaidRoutes \} from "\.\/routes\/raid\.routes"/);
  assert.match(legacyRoutes, /registerRaidRoutes\(app, \{ db, storage, isAuthenticated, isAdmin \}\)/);
  assert.deepEqual(routesIn(raidRoutes), expected);
  assert.deepEqual(routesIn(legacyRoutes), []);
});

test("raid route authentication rules are unchanged", () => {
  for (const route of [
    'app.post("/api/admin/raid-toggle", isAdmin',
    'app.post("/api/admin/raid-rewards", isAdmin',
    'app.post("/api/raid/start-battle", isAuthenticated',
    'app.post("/api/raid/deal-damage", isAuthenticated',
    'app.post("/api/admin/raid-boss", isAdmin',
    'app.post("/api/admin/raid-boss-hp", isAdmin',
    'app.post("/api/admin/raid-distribute-rewards", isAdmin',
    'app.get("/api/admin/templates-list", isAdmin',
    'app.patch("/api/admin/raid-icon-position", isAdmin',
  ]) assert.ok(raidRoutes.includes(route), `missing auth contract: ${route}`);
});

test("raid extraction keeps the existing cache, ticket, damage, and reward safeguards", () => {
  assert.match(raidRoutes, /now - _raidCache\.at < 60_000/);
  assert.match(raidRoutes, /now - _raidBossCache\.at < 5_000/);
  assert.match(raidRoutes, /RAID_TICKET_ITEM_ID = "a1b2c3d4-9002-4000-8000-000000000099"/);
  assert.match(raidRoutes, /damage > 50_000_000/);
  assert.match(raidRoutes, /GREATEST\(0, value::INTEGER - \$\{dmg\}\)/);
  assert.match(raidRoutes, /raid_defeat_lock_current/);
  assert.match(raidRoutes, /WHERE game_settings\.value = 'pending'/);
  assert.match(raidRoutes, /UPDATE users SET raid_total_damage = 0/);
  assert.match(raidRoutes, /createUserReward\(playerId, bundle\.id\)/);
});

test("raid boss selection remains delegated to the transactional raidBossAdmin helper", () => {
  assert.match(raidRoutes, /raidBossSelectionSchema\.safeParse\(req\.body\)/);
  assert.match(raidRoutes, /await saveRaidBoss\(db, parsed\.data\)/);
  assert.doesNotMatch(legacyRoutes, /raidBossSelectionSchema|saveRaidBoss/);
});
