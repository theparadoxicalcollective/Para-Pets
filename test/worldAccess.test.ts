import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerWorldScenePublicationRoutes } from "../server/routes/worldScenePublication.routes";
import { gameSettings, worldSceneAssets } from "../shared/schema";
import { WORLD_DEFINITION_LIST, WORLD_IDS } from "../shared/worlds/worldRegistry";
import {
  canPreviewLockedWorld, hasRetainedLegacyWorld, effectiveWorldLocked, defaultWorldLocked, worldLockedForPlayer, worldLockKey, shouldUseLegacyWorld,
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

test("only admins can preview locked worlds; moderator role never bypasses a lock", () => {
  for (const viewer of [undefined, {}, {isAdmin:false}, {isModerator:true}, {isAdmin:false,isModerator:true}]) {
    assert.equal(canPreviewLockedWorld(viewer), false);
    assert.equal(shouldUseLegacyWorld("swamp", new URLSearchParams("legacyView=1"), canPreviewLockedWorld(viewer)), false);
  }
  assert.equal(canPreviewLockedWorld({isAdmin:true}), true);
  assert.equal(canPreviewLockedWorld({isAdmin:true,isModerator:true}), true);
});

test("actual player-scene endpoint rejects a locked scene before reading its art for players and moderators", async () => {
  type Role = { isAdmin?: boolean; isModerator?: boolean };
  for (const viewer of [{}, {isModerator:true}, {isAdmin:true}] as Role[]) {
    for (const locked of [true,false]) {
      const queried: unknown[] = [];
      let handler: ((req: any,res: any) => Promise<unknown>) | undefined;
      const app = {
        get(path: string, _auth: unknown, fn: typeof handler) { if (path.endsWith("/player-scene")) handler = fn; },
        put() {},
      };
      const db = { select: () => {
        let table: unknown;
        const query = {
          from(value: unknown) { table = value; queried.push(value); return this; },
          where() { return this; }, orderBy() { return this; }, limit() { return this; },
          then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(table === gameSettings ? [{value:String(locked)}] : []).then(resolve); },
        };
        return query;
      }};
      registerWorldScenePublicationRoutes(app as any, {db: db as any, isAuthenticated: () => {}, isAdmin: () => {}});
      let status = 200, payload: any;
      const res = {status(code: number) { status=code; return this; }, set() { return this; }, json(body: unknown) { payload=body; }};
      assert.ok(handler);
      await handler({params:{worldId:"swamp"},user:viewer},res);
      const denied = locked && !viewer.isAdmin;
      assert.equal(status, denied ? 403 : 200);
      assert.equal(queried.includes(worldSceneAssets), !denied);
      if (denied) { assert.deepEqual(payload,{message:"Coming Soon"}); assert.deepEqual(queried,[gameSettings]); }
      else assert.equal(payload.worldId,"swamp");
    }
  }
});

test("only three old maps remain available to admins, not the general public", () => {
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
  assert.match(api, /if \(!canPreviewLockedWorld\(viewer\)\)/);
  assert.match(map, /!canPreviewLockedWorld\(currentUser\)/);
  assert.match(gate, /const admin = canPreviewLockedWorld\(user\)/);
  assert.doesNotMatch(gate, /isModerator: true/);
  assert.match(read("server/worldGardenAccess.ts"), /if \(canPreviewLockedWorld\(player\)\)/);
  assert.match(map, /worldLockedForPlayer\(w.id, worldPublications\)/);
  assert.match(map, /modal-world-coming-soon/);
  assert.match(map, /world-locked-\$\{w.id\}/);
  assert.match(gate, /worldLockedForPlayer\(worldId, publications \?\? \[\]\)/);
  assert.match(gate, /shouldUseLegacyWorld\(worldId, params, admin\)/);
  assert.match(admin, /role="switch"/);
  assert.match(admin, /hasRetainedLegacyWorld\(world.id\)/);
  assert.match(read("client/src/pages/AdminPage.tsx"), /activeSection === "worlds" && <WorldAccessPanel/);
  assert.doesNotMatch(player, /player-new-world-original-locations/);
  assert.match(player, /legacyLocationId=\$\{encodeURIComponent\(linkedPage.id\)\}/);
  assert.match(api, /defaultWorldSceneDraft\(worldId\)/);
  assert.doesNotMatch(api, /delete\(worldLocations\)|delete\(worldSceneDrafts\)/);
});
