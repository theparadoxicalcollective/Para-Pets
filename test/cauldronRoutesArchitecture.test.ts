import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const cauldronRoutes = readFileSync("server/routes/cauldron.routes.ts", "utf8");

const expected = [
  "GET /api/cauldron/layout",
  "PATCH /api/admin/cauldron/layout",
  "GET /api/cauldron/contents",
  "POST /api/cauldron/contents",
  "DELETE /api/cauldron/contents",
  "POST /api/cauldron/brew",
].sort();

function routesIn(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map(match => `${match[1].toUpperCase()} ${match[2]}`)
    .filter(route => route.includes("/cauldron/"))
    .sort();
}

test("Mixing Tree cauldron routes live in one dedicated module and remain registered once", () => {
  assert.match(legacyRoutes, /import \{ registerCauldronRoutes \} from "\.\/routes\/cauldron\.routes"/);
  assert.match(
    legacyRoutes,
    /registerCauldronRoutes\(app, \{ db, storage, isAuthenticated, isAdmin \}\)/,
  );
  assert.deepEqual(routesIn(cauldronRoutes), expected);
  assert.deepEqual(routesIn(legacyRoutes), []);
});

test("cauldron route authentication rules are unchanged", () => {
  assert.match(cauldronRoutes, /app\.get\("\/api\/cauldron\/layout", async/);
  assert.match(cauldronRoutes, /app\.patch\("\/api\/admin\/cauldron\/layout", isAdmin/);
  assert.match(cauldronRoutes, /app\.get\("\/api\/cauldron\/contents", isAuthenticated/);
  assert.match(cauldronRoutes, /app\.post\("\/api\/cauldron\/contents", isAuthenticated/);
  assert.match(cauldronRoutes, /app\.delete\("\/api\/cauldron\/contents", isAuthenticated/);
  assert.match(cauldronRoutes, /app\.post\("\/api\/cauldron\/brew", isAuthenticated/);
});

test("layout defaults and admin clamping remain unchanged", () => {
  assert.match(cauldronRoutes, /const CAULDRON_LAYOUT_KEY = "mixing_tree_cauldron_layout"/);
  assert.match(cauldronRoutes, /const DEFAULT_CAULDRON_LAYOUT = \{ x: 50, y: 8, size: 38 \}/);
  assert.match(cauldronRoutes, /x: Math\.max\(0, Math\.min\(100, x\)\)/);
  assert.match(cauldronRoutes, /y: Math\.max\(0, Math\.min\(100, y\)\)/);
  assert.match(cauldronRoutes, /size: Math\.max\(10, Math\.min\(90, size\)\)/);
});

test("ingredient ownership, type, capacity, and atomic consume guards are preserved", () => {
  assert.match(cauldronRoutes, /if \(!inv \|\| inv\.userId !== user\.id\)/);
  assert.match(cauldronRoutes, /shopItem\.type !== "ingredient"/);
  assert.match(cauldronRoutes, /const CAULDRON_CAPACITY = 2/);
  assert.match(cauldronRoutes, /existingTotal >= CAULDRON_CAPACITY/);
  assert.match(cauldronRoutes, /tryConsumeOneFromInventory\(inventoryId, user\.id\)/);
  assert.match(cauldronRoutes, /return res\.status\(409\)\.json\(\{ message: "Out of stock" \}\)/);
});

test("brew recipe matching, unlock requirement, price, award, and clear behavior remain unchanged", () => {
  assert.match(cauldronRoutes, /flatIds\.length !== 2/);
  assert.match(cauldronRoutes, /r\.ingredient1_id = \$\{id1\} AND r\.ingredient2_id = \$\{id2\}/);
  assert.match(cauldronRoutes, /r\.ingredient1_id = \$\{id2\} AND r\.ingredient2_id = \$\{id1\}/);
  assert.match(cauldronRoutes, /errorCode: "INCORRECT_RECIPE"/);
  assert.match(cauldronRoutes, /FROM player_unlocked_recipes/);
  assert.match(cauldronRoutes, /errorCode: "RECIPE_LOCKED"/);
  assert.match(cauldronRoutes, /const BREW_COST = 100/);
  assert.match(cauldronRoutes, /await storage\.addCoins\(userId, -BREW_COST\)/);
  assert.match(cauldronRoutes, /INSERT INTO user_inventory/);
  assert.match(cauldronRoutes, /cauldronContentsKey\(userId\), JSON\.stringify\(\[\]\)/);
});

test("clearing the cauldron still returns stored ingredients before emptying it", () => {
  const start = cauldronRoutes.indexOf('app.delete("/api/cauldron/contents"');
  const end = cauldronRoutes.indexOf('// ── Brew:', start);
  assert.ok(start >= 0 && end > start);
  const clearHandler = cauldronRoutes.slice(start, end);
  assert.match(clearHandler, /UPDATE user_inventory SET quantity = quantity \+ \$\{c\.quantity\}/);
  assert.match(clearHandler, /INSERT INTO user_inventory \(user_id, shop_item_id, quantity\)/);
  assert.match(clearHandler, /await storage\.setGameSetting\(cauldronContentsKey\(user\.id\), JSON\.stringify\(\[\]\)\)/);
});
