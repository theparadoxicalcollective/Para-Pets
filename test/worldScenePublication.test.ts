import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_DEFINITION_LIST } from "../shared/worlds/worldRegistry";
import { auditWorldPublication, canSwitchToNewWorld } from "../shared/worlds/worldScenePublication";

const read = (name: string) => readFileSync(name, "utf8");
const shop = { id:"shop-legacy", worldId:"swamp", name:"Bayou Market", type:"shop", isShop:true };
const npcLocation = { id:"npc-legacy", worldId:"swamp", name:"Lonelle", type:"npc", isShop:false };
const assets = [{ id:"art", imageUrl:"ready" }];
const npcs = [{ id:"npc", name:"Lonelle", imageUrl:"ready" }];
const placements = [
  { id:"building", kind:"building", assetId:"art", npcId:null,
    legacyLocationId:"shop-legacy", isShop:true },
  { id:"npc-place", kind:"npc", assetId:null, npcId:"npc",
    legacyLocationId:null, isShop:false },
];

test("all eight registered worlds have their own independent switch and start on legacy", () => {
  assert.equal(WORLD_DEFINITION_LIST.length, 8);
  const server = read("server/routes/worldScenePublication.routes.ts");
  const migration = read("server/startup/migrations/ensureWorldSceneDraftStorage.ts");
  const schema = read("shared/schema.ts");
  assert.match(server, /WORLD_DEFINITION_LIST\.map\(world => inspect\(db, world\.id\)\)/);
  assert.match(schema, /worldScenePublications = pgTable\("world_scene_publications"/);
  assert.match(migration, /use_new_world boolean NOT NULL DEFAULT false/);
  assert.match(server, /app\.patch\("\/api\/admin\/world-editor\/:worldId\/player-view", isAdmin/);
  assert.match(server, /onConflictDoUpdate/);
  assert.match(server, /useNewWorld: false, updatedAt: new Date\(\)/);
  assert.doesNotMatch(server, /db\.delete\(|DROP TABLE|TRUNCATE/i);
});

test("cannot turn on an empty draft or expose missing assets, shops or NPCs", () => {
  const empty = auditWorldPublication("swamp", {
    hasDraft:false, placements:[], assets:[], npcs:[], locations:[],
  });
  assert.equal(empty.blockers.length, 2);
  const broken = auditWorldPublication("swamp", {
    hasDraft:true,
    placements:[{ ...placements[0], assetId:"missing", legacyLocationId:null },
      { ...placements[1], npcId:"missing" }],
    assets, npcs, locations:[shop, npcLocation],
  });
  assert.ok(broken.blockers.some(b => b.includes("artwork")));
  assert.ok(broken.blockers.some(b => b.includes("shop building")));
  assert.ok(broken.blockers.some(b => b.includes("NPC")));
  assert.ok(broken.blockers.some(b => b.includes("interactive location")));
});

test("matching every old interactive hotspot allows staged publication but warns against deletion", () => {
  const audit = auditWorldPublication("swamp", {
    hasDraft:true, placements, assets, npcs, locations:[shop, npcLocation],
  });
  assert.deepEqual(audit.blockers, []);
  assert.equal(audit.legacyLinkCount, 1);
  assert.ok(audit.warnings.some(w => w.includes("keep legacy")));
  const status = {
    worldId:"swamp", useNewWorld:false, hasPublishedSnapshot:false, hasSavedDraft:true,
    placementCount:2, legacyLinkCount:audit.legacyLinkCount,
    blockers:audit.blockers, warnings:audit.warnings, updatedAt:null,
  };
  assert.equal(canSwitchToNewWorld(status), true);
  assert.equal(canSwitchToNewWorld({ ...status, blockers:["Missing quest"] }), false);
  assert.equal(canSwitchToNewWorld({ ...status, placementCount:0 }), false);
  assert.equal(canSwitchToNewWorld({ ...status, hasSavedDraft:false }), false);
});

test("world-specific legacy links never satisfy another world's required locations", () => {
  const audit = auditWorldPublication("haunted_woods", {
    hasDraft:true, placements, assets, npcs,
    locations:[shop, npcLocation, {
      id:"haunted-quest", worldId:"haunted_woods", name:"Haunted Quest", type:"quest", isShop:false,
    }],
  });
  assert.ok(audit.blockers.some(b => b.includes("1 original interactive")));
});

test("player routes consume only snapshots and restore legacy via the same world link", () => {
  const routes = read("server/routes/worldScenePublication.routes.ts");
  const client = read("client/src/App.tsx");
  const player = read("client/src/pages/WorldScenePlayerPage.tsx");
  const old = read("client/src/pages/WorldPage.tsx");
  const map = read("client/src/pages/MapPage.tsx");
  assert.match(routes, /app\.get\("\/api\/world-scene\/:worldId\/player", requireAuthenticated/);
  assert.match(routes, /!published\?\.useNewWorld \|\| !published\.snapshot/);
  assert.match(routes, /await db\.transaction\(async tx =>/);
  assert.match(routes, /snapshot: WorldScenePlayerSnapshot/);
  assert.match(client, /publication\.data\?\.useNewWorld === true && !legacyLink/);
  assert.match(client, /<WorldScenePlayerPage worldId=\{worldId\}/);
  assert.match(client, /<WorldPage user=\{worldUser\}/);
  assert.match(player, /\?legacy=1&openLocation=/);
  assert.match(old, /legacyAutoOpened/);
  assert.match(old, /node\.click\(\)/);
  assert.match(map, /button-switch-player-world-/);
  assert.match(map, /button-update-live-world-/);
  assert.match(map, /Switch to Old/);
  assert.match(map, /Switch to New/);
  assert.doesNotMatch(player, /api\/admin\/world-editor|db\.delete/);
});
