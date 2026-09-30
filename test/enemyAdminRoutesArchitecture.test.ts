import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const enemyRoutes = readFileSync("server/routes/enemyAdmin.routes.ts", "utf8");

const expected = [
  "GET /api/admin/enemies",
  "POST /api/admin/enemies",
  "PATCH /api/admin/enemies/:id",
  "DELETE /api/admin/enemies/:id",
  "GET /api/admin/enemy-parts/:enemyId",
  "POST /api/admin/enemy-parts/:enemyId",
  "PATCH /api/admin/enemy-parts/:partId",
  "DELETE /api/admin/enemy-parts/:partId",
].sort();

function enemyAdminEndpoints(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`)
    .filter((route) =>
      route.includes("/api/admin/enemies")
      || route.includes("/api/admin/enemy-parts"),
    )
    .sort();
}

test("Enemy Database and Enemy Parts routes are isolated and registered exactly once", () => {
  assert.match(
    legacyRoutes,
    /import \{ registerEnemyAdminRoutes \} from "\.\/routes\/enemyAdmin\.routes"/,
  );
  assert.match(
    legacyRoutes,
    /registerEnemyAdminRoutes\(app, \{ storage, isAdmin \}\)/,
  );
  assert.deepEqual(enemyAdminEndpoints(enemyRoutes), expected);
  assert.deepEqual(enemyAdminEndpoints(legacyRoutes), []);
});

test("all Enemy Database and Enemy Parts routes remain admin-only", () => {
  const registrations = Array.from(
    enemyRoutes.matchAll(
      /app\.(get|post|patch|delete)\(\s*["'`]\/api\/admin\/(?:enemies|enemy-parts)[^"'`]*["'`]\s*,\s*isAdmin/g,
    ),
  );
  assert.equal(registrations.length, expected.length);
});

test("enemy defaults remain unchanged", () => {
  assert.match(enemyRoutes, /atk: atk \?\? 10/);
  assert.match(enemyRoutes, /health: health \?\? 100/);
  assert.match(enemyRoutes, /isBoss: isBoss \?\? false/);
  assert.match(enemyRoutes, /special1: special1 \?\? null/);
  assert.match(enemyRoutes, /special2: special2 \?\? null/);
  assert.match(enemyRoutes, /special3: special3 \?\? null/);
});

test("enemy image processing remains 400 by 400 PNG without enlargement", () => {
  const matches = Array.from(
    enemyRoutes.matchAll(
      /\.resize\(400, 400, \{ fit: "inside", withoutEnlargement: true \}\)\s*\.png\(\)\s*\.toBuffer\(\)/g,
    ),
  );
  assert.equal(matches.length, 2);
});

test("enemy-part image processing and placement defaults remain unchanged", () => {
  assert.match(
    enemyRoutes,
    /\.resize\(600, 600, \{ fit: "inside", withoutEnlargement: true \}\)\s*\.png\(\)\s*\.toBuffer\(\)/,
  );
  assert.match(enemyRoutes, /posX: posX \?\? 100/);
  assert.match(enemyRoutes, /posY: posY \?\? 100/);
  assert.match(enemyRoutes, /width: width \?\? 200/);
  assert.match(enemyRoutes, /height: height \?\? 200/);
  assert.match(enemyRoutes, /zIndex: zIndex \?\? 1/);
});

test("enemy and enemy-part storage operations remain unchanged", () => {
  for (const operation of [
    "getAllEnemies",
    "createEnemy",
    "updateEnemy",
    "deleteEnemy",
    "getEnemyParts",
    "createEnemyPart",
    "updateEnemyPart",
    "deleteEnemyPart",
  ]) {
    assert.match(enemyRoutes, new RegExp(`storage\\.${operation}\\(`));
  }
});
