import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const maintenanceRoutes = readFileSync("server/routes/maintenance.routes.ts", "utf8");

const expected = [
  "GET /api/maintenance-status",
  "POST /api/admin/maintenance",
  "GET /api/admin/maintenance/diagnostics",
  "POST /api/admin/cleanup-orphans",
].sort();

function routesIn(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map(match => `${match[1].toUpperCase()} ${match[2]}`)
    .filter(route => route.includes("/maintenance") || route.includes("/cleanup-orphans"))
    .sort();
}

test("maintenance server routes live in one dedicated module and remain registered once", () => {
  assert.match(legacyRoutes, /import \{ registerMaintenanceRoutes \} from "\.\/routes\/maintenance\.routes"/);
  assert.match(legacyRoutes, /registerMaintenanceRoutes\(app, \{ db, storage, isAdmin \}\)/);
  assert.deepEqual(routesIn(maintenanceRoutes), expected);
  assert.deepEqual(routesIn(legacyRoutes), []);
});

test("maintenance route authentication and public status access are unchanged", () => {
  assert.match(maintenanceRoutes, /app\.get\("\/api\/maintenance-status", async/);
  assert.match(maintenanceRoutes, /app\.post\("\/api\/admin\/maintenance", isAdmin/);
  assert.match(maintenanceRoutes, /app\.get\("\/api\/admin\/maintenance\/diagnostics", isAdmin/);
  assert.match(maintenanceRoutes, /app\.post\("\/api\/admin\/cleanup-orphans", isAdmin/);
});

test("maintenance cache, authoritative health check, and response shape are preserved", () => {
  assert.match(maintenanceRoutes, /now - maintenanceCache\.at < 60_000/);
  assert.match(maintenanceRoutes, /storage\.getGameSetting\("maintenance_mode"\)/);
  assert.match(maintenanceRoutes, /db\.execute\(sql`SELECT 1`\)/);
  assert.match(maintenanceRoutes, /uptimeSeconds: Math\.floor\(process\.uptime\(\)\)/);
  assert.match(maintenanceRoutes, /clientErrors: getClientErrorCount\(\)/);
  assert.match(maintenanceRoutes, /clientErrorLimit: CLIENT_ERROR_LIMIT/);
  assert.match(maintenanceRoutes, /return res\.status\(503\)\.json\(\{ message: "Maintenance diagnostics are unavailable" \}\)/);
});

test("orphan cleanup keeps the existing destructive operations and summary contract", () => {
  for (const fragment of [
    "DELETE FROM user_house_bundles WHERE bundle_id NOT IN",
    "DELETE FROM user_inventory WHERE shop_item_id NOT IN",
    "DELETE FROM pond_fish WHERE shop_item_id NOT IN",
    "UPDATE player_fishing_equipment SET pole_inventory_id = NULL",
    "DELETE FROM enemy_drops WHERE enemy_id NOT IN",
    "DELETE FROM user_badges WHERE badge_id NOT IN",
    "DELETE FROM location_home_decor WHERE decor_id NOT IN",
    "DELETE FROM pet_template_parts WHERE template_id NOT IN",
    "UPDATE shop_items SET pet_template_id = NULL",
    "UPDATE shop_items SET world_id = NULL",
    "UPDATE shop_items SET location_id = NULL",
  ]) {
    assert.ok(maintenanceRoutes.includes(fragment), `missing cleanup operation: ${fragment}`);
  }
  assert.match(maintenanceRoutes, /summary, cleaned: steps\.length, totalRows, ranAt: new Date\(\)\.toISOString\(\)/);
});
