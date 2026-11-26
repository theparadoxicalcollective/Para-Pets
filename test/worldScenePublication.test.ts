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

test("all registered worlds start in original mode with independent admin switches", () => {
  assert.equal(WORLD_DEFINITION_LIST.length, 8);
  const server = read("server/routes/worldScenePublication.routes.ts");
  const migration = read("server/startup/migrations/ensureWorldSceneDraftStorage.ts");
  const schema = read("shared/schema.ts");
  assert.match(server, /WORLD_DEFINITION_LIST\.map\(world => inspect\(db, world\.id\)\)/);
  assert.match(schema, /worldScenePublications = pgTable\("world_scene_publications"/);
  assert.match(migration, /use_new_world boolean NOT NULL DEFAULT false/);
  assert.match(server, /app\.patch\("\/api\/admin\/world-editor\/:worldId\/player-view", isAdmin/);
  assert.match(server, /useNewWorld: false, updatedAt: new Date\(\)/);
  assert.doesNotMatch(schema, /snapshot: jsonb\("snapshot"\)/);
  assert.doesNotMatch(migration, /snapshot jsonb/);
  assert.doesNotMatch(server, /db\.delete\(|DROP TABLE|TRUNCATE/i);
});

test("Save & Set Live refuses an empty world or unlinked quest/shop/NPC", () => {
  const empty = auditWorldPublication("swamp", {
    hasWorld:false, placements:[], assets:[], npcs:[], locations:[],
  });
  assert.equal(empty.blockers.length, 2);
  const broken = auditWorldPublication("swamp", {
    hasWorld:true, placements:[{ ...placements[0], assetId:"missing", legacyLocationId:null },
      { ...placements[1], npcId:"missing" }], assets, npcs, locations:[shop, npcLocation],
  });
  assert.ok(broken.blockers.some(b => b.includes("artwork")));
  assert.ok(broken.blockers.some(b => b.includes("shop building")));
  assert.ok(broken.blockers.some(b => b.includes("NPC")));
  assert.ok(broken.blockers.some(b => b.includes("interactive location")));
});

test("existing original-world quest/shop connections are retained after activation", () => {
  const audit = auditWorldPublication("swamp", {
    hasWorld:true, placements, assets, npcs, locations:[shop, npcLocation],
  });
  assert.deepEqual(audit.blockers, []);
  assert.equal(audit.legacyLinkCount, 1);
  assert.ok(audit.warnings.some(w => w.includes("keep legacy")));
  const status = {
    worldId:"swamp", useNewWorld:false, hasSavedWorld:true,
    placementCount:2, legacyLinkCount:audit.legacyLinkCount,
    blockers:audit.blockers, warnings:audit.warnings, updatedAt:null,
  };
  assert.equal(canSwitchToNewWorld(status), true);
  assert.equal(canSwitchToNewWorld({ ...status, blockers:["Missing quest"] }), false);
  assert.equal(canSwitchToNewWorld({ ...status, placementCount:0 }), false);
  assert.equal(canSwitchToNewWorld({ ...status, hasSavedWorld:false }), false);
});

test("other worlds' locations cannot satisfy this world's readiness checks", () => {
  const audit = auditWorldPublication("haunted_woods", {
    hasWorld:true, placements, assets, npcs,
    locations:[shop, npcLocation, {
      id:"haunted-quest", worldId:"haunted_woods", name:"Haunted Quest",
      type:"quest", isShop:false,
    }],
  });
  assert.ok(audit.blockers.some(b => b.includes("1 original interactive")));
});

test("players load only current saved world data, never admin editing controls", () => {
  const routes = read("server/routes/worldScenePublication.routes.ts");
  const client = read("client/src/App.tsx");
  const player = read("client/src/pages/WorldScenePlayerPage.tsx");
  const legacy = read("client/src/pages/WorldPage.tsx");
  const map = read("client/src/pages/MapPage.tsx");
  const editor = read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(routes, /app\.get\("\/api\/world-scene\/:worldId\/player", requireAuthenticated/);
  assert.match(routes, /if \(!saved\?\.useNewWorld\) return null/);
  assert.match(routes, /tx\.select\(\)\.from\(worldScenePlacements\)/);
  assert.match(routes, /tx\.select\(\)\.from\(worldSceneAssets\)/);
  assert.match(routes, /tx\.select\(\)\.from\(worldSceneInteriorItems\)/);
  assert.match(routes, /WorldScenePlayerWorld/);
  assert.doesNotMatch(routes, /published\.snapshot|snapshot:|publishedAt/);
  assert.match(client, /publication\.data\?\.useNewWorld === true && !legacyLink/);
  assert.match(client, /<WorldScenePlayerPage worldId=\{worldId\}/);
  assert.match(client, /<WorldPage user=\{worldUser\}/);
  assert.match(player, /refetchInterval: 30_000/);
  assert.match(player, /refetchOnWindowFocus: "always"/);
  assert.match(player, /\?legacy=1&openLocation=/);
  assert.match(legacy, /legacyAutoOpened/);
  assert.match(legacy, /node\.click\(\)/);
  assert.doesNotMatch(player, /api\/admin\/world-editor|WorldSceneControls|isAdmin|db\.delete/);
  assert.match(map, /button-switch-player-world-/);
  assert.doesNotMatch(map, /Publish Changes|button-update-live-world-/);
  assert.match(map, /Switch to Old/);
  assert.match(map, /Switch to New/);
  assert.match(editor, /data-testid="button-world-save-live"/);
  assert.match(editor, /Save & Set Live/);
  assert.doesNotMatch(editor, /button-world-save-draft|Save Live Changes/);
});

test("one Save & Set Live action activates world; edits stay in saved tables", () => {
  const routes = read("server/routes/worldScenePublication.routes.ts");
  const editor = read("client/src/pages/WorldSceneEditorPage.tsx");
  assert.match(routes, /if \(!previous\?\.useNewWorld\)/);
  assert.match(routes, /if \(status\.blockers\.length\) throw new PublicationNotReady/);
  assert.match(routes, /set: \{ useNewWorld: true, updatedAt: new Date\(\) \}/);
  assert.match(editor, /apiRequest\("PUT", `\/api\/admin\/world-editor\/\$\{worldId\}\/draft`/);
  assert.match(editor, /apiRequest\("PATCH",\s*`\/api\/admin\/world-editor\/\$\{worldId\}\/player-view`/);
});
