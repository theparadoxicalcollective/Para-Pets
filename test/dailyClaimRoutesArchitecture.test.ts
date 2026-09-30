import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const startup = readFileSync("server/startup/runStartup.ts", "utf8");
const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const dailyClaimRoutes = readFileSync("server/routes/dailyClaim.routes.ts", "utf8");

function dailyClaimEndpoints(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map(match => `${match[1].toUpperCase()} ${match[2]}`)
    .filter(route => route.includes("/daily-claim"))
    .sort();
}

test("Daily Claim routes have one authoritative owner", () => {
  assert.deepEqual(dailyClaimEndpoints(dailyClaimRoutes), [
    "GET /api/daily-claim/config",
    "GET /api/daily-claim/status",
    "POST /api/daily-claim",
    "PUT /api/admin/daily-claim/config",
  ].sort());

  assert.deepEqual(dailyClaimEndpoints(legacyRoutes), []);
});

test("focused Daily Claim routes stay registered before the legacy registrar", () => {
  const dailyClaimRegistration = startup.indexOf("registerDailyClaimRoutes(app);");
  const legacyRegistration = startup.indexOf("await registerRoutes(httpServer, app);");

  assert.ok(dailyClaimRegistration >= 0, "Daily Claim registrar must remain wired into startup");
  assert.ok(legacyRegistration >= 0, "legacy route registrar must remain wired into startup");
  assert.ok(
    dailyClaimRegistration < legacyRegistration,
    "Daily Claim routes must register before the legacy route registrar",
  );
});

test("Daily Claim authentication, timing, and transaction safeguards remain unchanged", () => {
  assert.match(dailyClaimRoutes, /app\.get\("\/api\/daily-claim\/status", requireAuthenticated/);
  assert.match(dailyClaimRoutes, /app\.post\("\/api\/daily-claim", requireAuthenticated/);
  assert.match(dailyClaimRoutes, /app\.put\("\/api\/admin\/daily-claim\/config", requireAdmin/);
  assert.match(dailyClaimRoutes, /INTERVAL '24 hours'/);
  assert.match(dailyClaimRoutes, /db\.transaction\(async \(tx\) =>/);
  assert.match(dailyClaimRoutes, /SELECT id FROM users WHERE id = \$\{user\.id\} FOR UPDATE/);
});

test("Daily Claim keeps configurable rewards and existing ticket caps", () => {
  assert.match(dailyClaimRoutes, /config\.coinAmount/);
  assert.match(dailyClaimRoutes, /config\.essenceAmount/);
  assert.match(dailyClaimRoutes, /config\.itemIds/);
  assert.match(dailyClaimRoutes, /const DAILY_PVP_TICKETS = 5/);
  assert.match(dailyClaimRoutes, /const DAILY_RAID_TICKETS = 5/);
  assert.match(dailyClaimRoutes, /const PVP_TICKET_CAP = 100/);
  assert.match(dailyClaimRoutes, /const RAID_TICKET_CAP = 25/);
});
