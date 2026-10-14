import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { usesDeviceGameplaySurface } from "../client/src/lib/stage";

const read = (path: string) => readFileSync(path, "utf8");
const audit = read("docs/root-stage-final-dependency-inventory.md");
const app = read("client/src/App.tsx");
const entry = read("client/src/RootEntry.tsx");
const viewport = read("client/src/lib/stageViewport.ts");

test("final audit tracks the legacy gameplay owner and migrated native entry shell", () => {
  for (const source of ["client/src/App.tsx", "client/src/RootEntry.tsx", "client/src/lib/stageViewport.ts", "client/src/lib/stage.ts", "client/src/tabletStageShell.css"]) {
    assert.ok(audit.includes(source), source);
  }
  assert.doesNotMatch(app, /expandedStage|layout\.coordinateOwner === "stage"/);
  assert.match(entry, /data-coordinate-owner="viewport"/);
  assert.doesNotMatch(entry, /root-stage-reference-plane/);
  assert.doesNotMatch(viewport, /shouldFitPortraitReference/);
  assert.match(viewport, /const viewportSurface = true/);
});

test("final audit separates migrated routes from still-unclassified routes", () => {
  for (const route of ["/", "/map", "/world/haunted-forest", "/pet-house", "/visit/123", "/cards", "/pet-care/123", "/pet-level-up/123", "/raid/battle"]) {
    assert.equal(usesDeviceGameplaySurface(route), true, route);
  }
  for (const route of ["/admin", "/privacy", "/forum", "/founders", "/reset-password/abc"]) {
    assert.equal(usesDeviceGameplaySurface(route), false, route);
  }
  assert.match(audit, /not proof of live legacy gameplay/);
});

test("final audit protects saved placements, portals and real-device verification", () => {
  for (const marker of ["admin oval placements", "World/map cameras", "Pet House decor", "Pet Care pointer gestures", "Quest spotlight", "ViewportScenePortal.tsx", "ViewportModalPortal.tsx", "real-device"]) {
    assert.ok(audit.includes(marker), marker);
  }
});
