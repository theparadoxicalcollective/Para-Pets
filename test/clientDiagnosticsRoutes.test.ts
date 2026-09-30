import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const legacyRoutes = readFileSync("server/routes.ts", "utf8");
const diagnosticsRoutes = readFileSync("server/routes/clientDiagnostics.routes.ts", "utf8");
const startup = readFileSync("server/startup/runStartup.ts", "utf8");
const errorStore = readFileSync("server/clientErrorStore.ts", "utf8");
const errorBoundary = readFileSync("client/src/components/ErrorBoundary.tsx", "utf8");

function clientErrorRoutes(source: string): string[] {
  return Array.from(source.matchAll(/app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g))
    .map(match => `${match[1].toUpperCase()} ${match[2]}`)
    .filter(route => route.includes("client-error"))
    .sort();
}

test("legacy client error routes are isolated and still registered from the main route registry", () => {
  assert.match(legacyRoutes, /import \{ registerClientErrorRoutes \} from "\.\/routes\/clientDiagnostics\.routes"/);
  assert.match(legacyRoutes, /registerClientErrorRoutes\(app, \{ isAdmin \}\)/);
  assert.deepEqual(clientErrorRoutes(diagnosticsRoutes), [
    "DELETE /api/admin/client-errors",
    "GET /api/admin/client-errors",
    "POST /api/client-error",
  ]);
  assert.deepEqual(clientErrorRoutes(legacyRoutes), []);
});

test("early startup diagnostics endpoint remains registered before the legacy route registry", () => {
  assert.match(diagnosticsRoutes, /export function registerClientDiagnosticsRoutes\(app: Express\)/);
  assert.match(diagnosticsRoutes, /app\.post\("\/api\/client-diagnostics"/);
  assert.match(startup, /registerClientDiagnosticsRoutes\(app\)/);
  assert.ok(
    startup.indexOf("registerClientDiagnosticsRoutes(app)") < startup.indexOf("await registerRoutes(httpServer, app)"),
    "startup diagnostics must remain available before the legacy route registry",
  );
});

test("crashed or logged-out clients can still report while admin log access stays protected", () => {
  assert.match(diagnosticsRoutes, /app\.post\("\/api\/client-error", \(req, res\) =>/);
  assert.match(diagnosticsRoutes, /app\.get\("\/api\/admin\/client-errors", isAdmin/);
  assert.match(diagnosticsRoutes, /app\.delete\("\/api\/admin\/client-errors", isAdmin/);
  assert.match(errorBoundary, /fetch\("\/api\/client-error"/);
});

test("legacy client-error sanitizing and bounded in-memory behavior are preserved", () => {
  assert.match(diagnosticsRoutes, /msg: String\(msg \?\? ""\)\.slice\(0, 800\)/);
  assert.match(diagnosticsRoutes, /source: String\(source \?\? ""\)\.slice\(0, 600\)/);
  assert.match(diagnosticsRoutes, /url: String\(url \?\? ""\)\.slice\(0, 300\)/);
  assert.match(diagnosticsRoutes, /ua: String\(ua \?\? ""\)\.slice\(0, 200\)/);
  assert.match(errorStore, /export const CLIENT_ERROR_LIMIT = 100/);
  assert.match(errorStore, /entries\.unshift/);
  assert.match(errorStore, /if \(entries\.length > CLIENT_ERROR_LIMIT\) entries\.pop\(\)/);
  assert.match(errorStore, /entries\.length = 0/);
  assert.match(errorStore, /sequence = 0/);
});

test("startup diagnostics retains its privacy bounds and safe path handling", () => {
  assert.match(diagnosticsRoutes, /const MAX_MESSAGE = 500/);
  assert.match(diagnosticsRoutes, /const MAX_SOURCE = 200/);
  assert.match(diagnosticsRoutes, /const MAX_PATH = 160/);
  assert.match(diagnosticsRoutes, /return path\.split\(\/\[\?#\]\/, 1\)\[0\] \?\? null/);
  assert.match(diagnosticsRoutes, /console\.warn\("\[client-diagnostic\]"/);
  assert.match(diagnosticsRoutes, /return res\.status\(204\)\.end\(\)/);
});
