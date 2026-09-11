import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("admin metrics distinguish unique players, sign-ins, and new accounts", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const metricsStart = routes.indexOf('app.get("/api/admin/metrics"');
  const metricsEnd = routes.indexOf('app.patch("/api/admin/milestone-rewards', metricsStart);
  const metricsRoute = routes.slice(metricsStart, metricsEnd);

  assert.ok(metricsStart >= 0, "metrics route should exist");
  assert.match(metricsRoute, /count\(DISTINCT user_id\)::int AS "uniquePlayers"/);
  assert.match(metricsRoute, /AS "activePlayers"/);
  assert.match(metricsRoute, /AS "newPlayers"/);
  assert.match(metricsRoute, /dailySignups/);
  assert.match(metricsRoute, /topPlayers/);
});

test("online today uses an admin-local calendar window instead of long-lived sessions", () => {
  const routes = readFileSync("server/routes.ts", "utf8");
  const adminPage = readFileSync("client/src/pages/AdminPage.tsx", "utf8");

  assert.match(routes, /app\.get\("\/api\/admin\/online-today", isAdmin/);
  assert.match(routes, /e\.created_at >= \$\{since\}/);
  assert.match(routes, /e\.created_at < \$\{until\}/);
  assert.match(routes, /rangeMs > 36 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(routes, /app\.get\("\/api\/admin\/online-players"/);

  assert.match(adminPage, /label: "Online Today"/);
  assert.match(adminPage, /todayStart\.setHours\(0, 0, 0, 0\)/);
  assert.match(adminPage, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(adminPage, /Unique players who signed in during this calendar day/);
});
