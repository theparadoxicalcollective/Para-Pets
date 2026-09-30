import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const cauldronRoutes = readFileSync("server/routes/cauldron.routes.ts", "utf8");
const cauldronTransactions = readFileSync("server/cauldron/transactions.ts", "utf8");

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

test("Mixing Tree cauldron routes remain isolated and registered exactly once", () => {
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

test("value-moving cauldron routes delegate to the transactional service", () => {
  assert.match(cauldronRoutes, /addCauldronIngredient\(db, \{ userId: user\.id, inventoryId \}\)/);
  assert.match(cauldronRoutes, /clearCauldronContents\(db, user\.id\)/);
  assert.match(cauldronRoutes, /brewCauldron\(db, userId\)/);
  assert.doesNotMatch(cauldronRoutes, /db\.execute\(/);
  assert.doesNotMatch(cauldronRoutes, /storage\.addCoins\(/);
  assert.doesNotMatch(cauldronRoutes, /storage\.tryConsumeOneFromInventory\(/);
});

test("existing ingredient and brew contracts remain in the transaction service", () => {
  assert.match(cauldronTransactions, /const CAULDRON_CAPACITY = 2/);
  assert.match(cauldronTransactions, /const BREW_COST = 100/);
  assert.match(cauldronTransactions, /item\.userId !== input\.userId/);
  assert.match(cauldronTransactions, /item\.itemType !== "ingredient"/);
  assert.match(cauldronTransactions, /return fail\(409, "Cauldron is full"\)/);
  assert.match(cauldronTransactions, /return fail\(409, "Out of stock"\)/);
  assert.match(cauldronTransactions, /return fail\(404, "Incorrect Recipe", "INCORRECT_RECIPE"\)/);
  assert.match(cauldronTransactions, /return fail\(403, "Find Recipe", "RECIPE_LOCKED"\)/);
  assert.match(
    cauldronTransactions,
    /return fail\(402, "Not enough coins to brew \(costs 100 coins\)", "INSUFFICIENT_COINS"\)/,
  );
});
