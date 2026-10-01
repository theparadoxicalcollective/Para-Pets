import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const recipeRoutes = readFileSync("server/routes/mixingTreeRecipe.routes.ts", "utf8");

function routesIn(source: string): string[] {
  return Array.from(
    source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g),
  )
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
    .filter((route) => route.includes("/api/recipes") || route.includes("/api/admin/recipes"))
    .sort();
}

const expected = [
  "GET /api/recipes",
  "GET /api/recipes/unlocked",
  "POST /api/recipes/unlock",
  "POST /api/admin/recipes",
  "PATCH /api/admin/recipes/:id",
  "DELETE /api/admin/recipes/:id",
].sort();

test("Mixing Tree recipe routes are isolated and registered exactly once", () => {
  assert.match(
    legacyRoutes,
    /import \{ registerMixingTreeRecipeRoutes \} from "\.\/routes\/mixingTreeRecipe\.routes"/,
  );
  assert.match(
    legacyRoutes,
    /registerMixingTreeRecipeRoutes\(app, \{ db, isAuthenticated, isAdmin \}\)/,
  );
  assert.deepEqual(routesIn(recipeRoutes), expected);
  assert.deepEqual(routesIn(legacyRoutes), []);
});

test("recipe route authentication boundaries are unchanged", () => {
  assert.match(recipeRoutes, /app\.get\("\/api\/recipes", isAuthenticated/);
  assert.match(recipeRoutes, /app\.get\("\/api\/recipes\/unlocked", isAuthenticated/);
  assert.match(recipeRoutes, /app\.post\("\/api\/recipes\/unlock", isAuthenticated/);
  assert.match(recipeRoutes, /app\.post\("\/api\/admin\/recipes", isAdmin/);
  assert.match(recipeRoutes, /app\.patch\("\/api\/admin\/recipes\/:id", isAdmin/);
  assert.match(recipeRoutes, /app\.delete\("\/api\/admin\/recipes\/:id", isAdmin/);
});

test("player recipe catalog and unlock contracts remain unchanged", () => {
  for (const marker of [
    "FROM mixing_tree_recipes r",
    "SELECT recipe_id FROM player_unlocked_recipes",
    "inventoryId required",
    "Item not found",
    "No recipe found for this scroll",
    "Already unlocked",
    "ALREADY_UNLOCKED",
    "INSERT INTO player_unlocked_recipes",
    "DELETE FROM user_inventory",
    "Failed to unlock recipe",
  ]) {
    assert.equal(recipeRoutes.includes(marker), true, marker);
  }
});

test("admin recipe CRUD keeps its existing validation and scroll behavior", () => {
  for (const marker of [
    "ingredient1Id, ingredient2Id, resultId and resultType are required",
    "resultType must be item, fish, or pet",
    "Unknown",
    " Recipe Scroll",
    "'recipe', 'mixing_tree', '/recipe-scroll.png'",
    "INSERT INTO mixing_tree_recipes",
    "INSERT INTO user_inventory",
    "Recipe not found",
    "UPDATE mixing_tree_recipes SET",
    "UPDATE shop_items SET name",
    "DELETE FROM mixing_tree_recipes",
  ]) {
    assert.equal(recipeRoutes.includes(marker), true, marker);
  }
});
