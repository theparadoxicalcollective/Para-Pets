import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canEnterDuringMaintenance } from "../shared/maintenanceAccess";

const read = (path: string) => readFileSync(path, "utf8");

test("maintenance grants entry only to signed-in admins or moderators, not ordinary players", () => {
  assert.equal(canEnterDuringMaintenance({ isAdmin: true, isModerator: false }), true);
  assert.equal(canEnterDuringMaintenance({ isAdmin: false, isModerator: true }), true);
  assert.equal(canEnterDuringMaintenance({ isAdmin: true, isModerator: true }), true);
  assert.equal(canEnterDuringMaintenance({ isAdmin: false, isModerator: false }), false);
  assert.equal(canEnterDuringMaintenance({ isAdmin: false }), false);
  assert.equal(canEnterDuringMaintenance({ isModerator: false }), false);
  assert.equal(canEnterDuringMaintenance(null), false);
  assert.equal(canEnterDuringMaintenance(undefined), false);
  // Fail closed on malformed API/cache shapes rather than truthy "false".
  assert.equal(canEnterDuringMaintenance({ isAdmin: "true" as any }), false);
  assert.equal(canEnterDuringMaintenance({ isModerator: 1 as any }), false);
});

test("login checks the current stored role and blocks other players during maintenance", () => {
  const routes = read("server/routes.ts");
  const login = routes.slice(routes.indexOf('app.post("/api/auth/login"'),
    routes.indexOf('app.post("/api/auth/login"') + 2800);
  assert.match(login, /const freshUser = await storage\.getUser\(user\.id\)/);
  assert.match(login, /if \(!canEnterDuringMaintenance\(freshUser\)\)/);
  assert.match(login, /storage\.getGameSetting\("maintenance_mode"\)/);
  assert.match(login, /req\.logout\(\(\) => \{\}\)/);
  assert.match(login, /status\(503\)\.json\(\{ maintenance: true/);
  assert.match(login, /publicAccount\(freshUser \?\? user\)/);
});

test("signed-in moderator sees gameplay, but remains prohibited from admin APIs", () => {
  const app = read("client/src/App.tsx");
  const authPage = read("client/src/pages/AuthPage.tsx");
  const admin = read("server/auth.ts");
  const routes = read("server/routes/maintenance.routes.ts");
  assert.match(app, /maintenanceOn && user && !canEnterDuringMaintenance\(user\)/);
  assert.match(authPage, /Admin \/ Moderator Login/);
  assert.match(authPage, /Only admins and moderators may enter/);
  assert.match(authPage, /data-testid="button-admin-login-bypass"/);
  // The admin editor, maintenance toggling, diagnostics and cleanup stay admin-only.
  assert.match(admin, /!user\.isAdmin \|\| !user\.emailVerified/);
  assert.match(routes, /app\.post\("\/api\/admin\/maintenance", isAdmin/);
  assert.match(routes, /app\.get\("\/api\/admin\/maintenance\/diagnostics", isAdmin/);
  assert.match(routes, /app\.post\("\/api\/admin\/cleanup-orphans", isAdmin/);
  assert.doesNotMatch(admin, /isModerator/);
  assert.doesNotMatch(routes, /canEnterDuringMaintenance/);
});
