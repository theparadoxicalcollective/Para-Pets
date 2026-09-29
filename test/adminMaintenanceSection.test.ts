import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminPage = readFileSync("client/src/pages/AdminPage.tsx", "utf8");
const maintenance = readFileSync("client/src/components/admin/MaintenanceSection.tsx", "utf8");

test("Administration Maintenance is isolated from the large AdminPage without changing its mount point", () => {
  assert.match(adminPage, /import MaintenanceSection from "@\/components\/admin\/MaintenanceSection"/);
  assert.match(adminPage, /activeSection === "maintenance"[\s\S]*<MaintenanceSection \/>/);
  assert.doesNotMatch(adminPage, /function MaintenanceSection\(/);
  assert.match(maintenance, /export default function MaintenanceSection\(/);
});

test("maintenance controls stay locked during initial diagnostics and later refetches", () => {
  assert.match(maintenance, /isLoading: maintenanceLoading/);
  assert.match(maintenance, /isFetching: maintenanceFetching/);
  assert.match(maintenance, /const maintenanceBusy = maintenanceLoading \|\| maintenanceFetching/);
  assert.match(
    maintenance,
    /data-testid="button-toggle-maintenance"[\s\S]*disabled=\{maintenanceBusy \|\| maintenanceUnavailable \|\| toggleMutation\.isPending\}/,
  );
  assert.match(
    maintenance,
    /data-testid="button-refresh-maintenance-health"[\s\S]*disabled=\{maintenanceBusy\}/,
  );
});

test("maintenance extraction preserves the existing server contracts and destructive confirmations", () => {
  for (const endpoint of [
    "/api/admin/maintenance/diagnostics",
    "/api/admin/maintenance",
    "/api/admin/client-errors",
    "/api/admin/cleanup-orphans",
  ]) {
    assert.ok(maintenance.includes(endpoint), `missing existing maintenance endpoint: ${endpoint}`);
  }

  assert.match(maintenance, /Clear all client errors from this server\? This cannot be undone\./);
  assert.match(maintenance, /Permanently remove orphaned database rows\?/);
  assert.match(maintenance, /queryClient\.setQueryData\(\["\/api\/maintenance-status"\]/);
});
