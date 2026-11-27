import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_DEFINITION_LIST, WORLD_IDS } from "../shared/worlds/worldRegistry";
import {
  hasRetainedLegacyWorld, effectiveWorldLocked, defaultWorldLocked, worldLockedForPlayer, worldLockKey, shouldUseLegacyWorld,
} from "../shared/worlds/worldAccess";

const retained = [WORLD_IDS.elysianBayou, WORLD_IDS.hauntedWoods, WORLD_IDS.volcanic];

test("preserve initial released worlds, save independent lock/unlock preferences for all eight", () => {
  assert.equal(new Set(WORLD_DEFINITION_LIST.map(w => worldLockKey(w.id))).size, 8);
  for (const { id } of WORLD_DEFINITION_LIST) {
    assert.equal(defaultWorldLocked(id), !retained.some(world => world === id));
    assert.equal(effectiveWorldLocked(id, undefined), defaultWorldLocked(id));
    assert.equal(effectiveWorldLocked(id, "true"), true);
    assert.equal(effectiveWorldLocked(id, "false"), false);
    assert.equal(effectiveWorldLocked(id, "invalid"), defaultWorldLocked(id));
    assert.equal(worldLockedForPlayer(id, [{ worldId: id, locked: true }]), true);
    assert.equal(worldLockedForPlayer(id, [{ worldId: id, locked: false }]), false);
  }
  assert.equal(effectiveWorldLocked("unknown", "false"), true);
});

test("only three old maps remain available to staff, not the general public", () => {
  for (const { id } of WORLD_DEFINITION_LIST) {
    const keep = retained.some(world => world === id);
    assert.equal(hasRetainedLegacyWorld(id), keep);
    assert.equal(shouldUseLegacyWorld(id, new URLSearchParams(), false), false);
    assert.equal(shouldUseLegacyWorld(id, new URLSearchParams(), true), false);
    assert.equal(shouldUseLegacyWorld(id, new URLSearchParams("legacyView=1"), false), false);
    assert.equal(shouldUseLegacyWorld(id, new URLSearchParams("legacyView=1"), true), keep);
    assert.equal(shouldUseLegacyWorld(id, new URLSearchParams("legacyLocationId=old-building"), false), keep);
    assert.equal(shouldUseLegacyWorld(id, new URLSearchParams("questNpc=old-npc"), false), keep);
  }
  for (const hint of ["fishHint", "shopHint", "moltenHint", "openFishMarket", "jansonHint"]) {
    assert.equal(shouldUseLegacyWorld("swamp", new URLSearchParams(hint + "=1"), false), true);
  }
});

test("map, direct route, and scene API share the persisted lock and admin-only mutation", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const api = read("server/routes/worldScenePublication.routes.ts");
  const map = read("client/src/pages/MapPage.tsx");
  const gate = read("client/src/App.tsx");
  const admin = read("client/src/components/admin/WorldAccessPanel.tsx");
  const player = read("client/src/pages/WorldScenePlayerPage.tsx");
  assert.match(api, /app\.put\("\/api\/admin\/worlds\/:worldId\/lock", isAdmin/);
  assert.match(api, /typeof req.body\?\.locked !== "boolean"/);
  assert.match(api, /worldLockKey\(worldId\)/);
  assert.match(api, /effectiveWorldLocked\(worldId, lock\?\.value\)/);
  assert.match(api, /status\(403\)\.json\(\{ message: "Coming Soon"/);
  assert.match(map, /worldLockedForPlayer\(w.id, worldPublications\)/);
  assert.match(map, /modal-world-coming-soon/);
  assert.match(map, /world-locked-\$\{w.id\}/);
  assert.match(gate, /worldLockedForPlayer\(worldId, publications \?\? \[\]\)/);
  assert.match(gate, /shouldUseLegacyWorld\(worldId, params, staff\)/);
  assert.match(admin, /role="switch"/);
  assert.match(admin, /hasRetainedLegacyWorld\(world.id\)/);
  assert.match(read("client/src/pages/AdminPage.tsx"), /activeSection === "worlds" && <WorldAccessPanel/);
  assert.doesNotMatch(player, /player-new-world-original-locations/);
  assert.match(player, /legacyLocationId=\$\{encodeURIComponent\(linkedPage.id\)\}/);
  assert.match(api, /defaultWorldSceneDraft\(worldId\)/);
  assert.doesNotMatch(api, /delete\(worldLocations\)|delete\(worldSceneDrafts\)/);
});
