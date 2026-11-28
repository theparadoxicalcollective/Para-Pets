import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_DEFINITION_LIST } from "../shared/worlds/worldRegistry";
import { worldLockedForPlayer, defaultWorldLocked } from "../shared/worlds/worldAccess";
import {
  auditWorldActivation, resolveLegacyNpcLocation, retiredLocationKey, effectiveRetiredLocations, clampPlayerWorldZoom, isPublishedWorld, PLAYER_WORLD_ZOOM_MAX,
  PLAYER_WORLD_ZOOM_STEP, type WorldScenePublication,
} from "../shared/worlds/worldScenePublication";

const read = (path: string) => readFileSync(path, "utf8");

test("every registered world selects its new scene while the locks remain independent", () => {
  const statuses: WorldScenePublication[] = WORLD_DEFINITION_LIST.map(world => ({
    worldId: world.id, active: true, hasBeenLive: true, locked: defaultWorldLocked(world.id),
    updatedAt: null, firstEnabledAt: null,
  }));
  for (const world of WORLD_DEFINITION_LIST) assert.equal(isPublishedWorld(world.id, statuses), true);
  const first = statuses[0];
  const unlocked = statuses.map(status => status.worldId === first.worldId ? { ...status, locked: false } : status);
  assert.equal(worldLockedForPlayer(first.worldId, unlocked), false);
  for (const other of statuses.slice(1)) assert.equal(worldLockedForPlayer(other.worldId, unlocked), other.locked);
  assert.equal(isPublishedWorld("not_a_world", statuses), false);
});

test("player zoom ends below editor ceiling, clamps invalid and extreme pinch inputs", () => {
  assert.equal(PLAYER_WORLD_ZOOM_MAX, 1.4);
  assert.ok(PLAYER_WORLD_ZOOM_STEP <= .12);
  assert.equal(clampPlayerWorldZoom(5, .6), 1.4);
  assert.equal(clampPlayerWorldZoom(Infinity, .6), 1);
  assert.equal(clampPlayerWorldZoom(-999, .6), .6);
  assert.equal(clampPlayerWorldZoom(1.1, .7), 1.1);
});

test("new worlds are the default and saved changes require no publication", () => {
  const routes = read("server/routes/worldScenePublication.routes.ts");
  const editor = read("client/src/pages/WorldSceneEditorPage.tsx");
  const controls = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const map = read("client/src/pages/MapPage.tsx");
  const player = read("client/src/pages/WorldScenePlayerPage.tsx");
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensureWorldScenePublicationStorage.ts");
  assert.match(routes, /app\.put\("\/api\/admin\/world-editor\/:worldId\/publication", isAdmin/);
  assert.match(routes, /app\.get\("\/api\/worlds\/:worldId\/player-scene", isAuthenticated/);
  assert.match(routes, /worldId: world.id, active: true, hasBeenLive: true/);
  assert.match(routes, /draft\[0\] \?\? defaultWorldSceneDraft\(worldId\)/);
  assert.match(routes, /db\.select\(\)\.from\(worldScenePlacements\)/,
    "Players read saved placements rather than an independent snapshot");
  assert.doesNotMatch(schema, /snapshot: jsonb\("snapshot"\)/);
  assert.doesNotMatch(migration, /snapshot jsonb/);
  assert.doesNotMatch(controls, /button-save-and-set-world-live|onSaveAndSetLive/);
  assert.doesNotMatch(editor, /saveAndSetLive/);
  assert.doesNotMatch(map, /button-switch-world-|button-new-world-edit-/);
  assert.match(map, /navigate\(`\/world-editor\/\$\{w.id\}/);
  assert.match(player, /refetchInterval: 20_000/);
  assert.match(player, /const viewportReady = viewport.width > 1 && viewport.height > 1/);
  assert.doesNotMatch(player, /width: 390, height: 844/,
    "player scenes must wait for measured phone/tablet dimensions");
  assert.match(player, /activeAsset\?\.interiorImageUrl \?\? linkedPage\?\.bgUrl/,
    "newly saved room artwork takes precedence over a legacy fallback");
  assert.doesNotMatch(player, /WorldSceneControls|world-scene-controls|\/api\/admin\/world-editor/);
});

test("old worlds and game progress remain untouched; database change is additive", () => {
  const setup = read("server/startup/migrations/ensureWorldScenePublicationStorage.ts");
  const routes = read("server/routes/worldScenePublication.routes.ts");
  assert.match(setup, /CREATE TABLE IF NOT EXISTS world_scene_publications/);
  assert.doesNotMatch(setup, /DROP TABLE|TRUNCATE|DELETE FROM/);
  assert.doesNotMatch(routes, /delete\(worldLocations\)|delete\(worldSceneDrafts\)/);
  const app = read("client/src/App.tsx");
  assert.match(app, /<WorldScenePlayerPage/);
  assert.match(app, /<WorldPage[^>]*user=\{user\}/);
  assert.match(app, /legacyLocationId/);
});


const original = [
  { id: "shop", worldId: "swamp", name: "Potion Shop", type: "shop", isShop: true },
  { id: "fish", worldId: "swamp", name: "Fishing Hole", type: "fishing", isShop: false },
  { id: "arena", worldId: "swamp", name: "Clearing", type: "explore", isShop: false },
  { id: "janson", worldId: "swamp", name: "Janson", type: "npc", isShop: false },
  { id: "other", worldId: "haunted_woods", name: "Casino", type: "scenic", isShop: false },
];
const assets = [{ id: "building", kind: "building", worldId: "swamp", name: "Building", imageUrl: "art" }];
const npcs = [{ id: "npc", name: "Janson", imageUrl: "art" }];
const basePlacement = { kind: "building", assetId: "building", npcId: null, isShop: false };
const ready: Parameters<typeof auditWorldActivation>[1]["placements"] = [
  { ...basePlacement, id: "new-shop", legacyLocationId: "shop", isShop: true },
  { ...basePlacement, id: "new-fish", legacyLocationId: "fish" },
  { ...basePlacement, id: "new-arena", legacyLocationId: "arena" },
  { ...basePlacement, id: "cross-world", legacyLocationId: "other" },
  { ...basePlacement, id: "new-npc", kind: "npc", assetId: null, npcId: "npc", legacyLocationId: null },
];
function audit(placements: Parameters<typeof auditWorldActivation>[1]["placements"] = ready,
  overrides: Partial<Parameters<typeof auditWorldActivation>[1]> = {}) {
  return auditWorldActivation("swamp", { hasGround: true, placements, assets, npcs, locations: original, ...overrides });
}
test("activation allows incremental migration, including no legacy entrances or buildings yet", () => {
  assert.deepEqual(audit(), []);
  assert.deepEqual(audit([ready[0]]), [], "other old locations need not be migrated");
  assert.deepEqual(audit([{ ...ready[0], legacyLocationId: null }]), [], "an unfinished shop need not be linked");
  assert.deepEqual(audit([{ ...ready[0], legacyLocationId: "arena" }]), [], "a shop need not rely on an original shop");
  assert.deepEqual(audit([{ ...ready[2], legacyLocationId: null }]), [], "buildings do not need old pages or room interiors");
  assert.deepEqual(audit([ready[3]]), [], "valid cross-world links still work");
  assert.deepEqual(audit([], { assets: [], npcs: [] }), [], "saved ground alone is a renderable scene");
});
test("activation still checks saved-scene integrity and protects existing links", () => {
  assert.ok(audit(ready, { hasGround: false }).some(blocker => blocker.includes("ground")));
  assert.ok(audit([], { hasGround: false }).some(blocker => blocker.includes("ground")));
  assert.ok(audit(ready, { assets: [] }).some(blocker => blocker.includes("artwork")));
  assert.ok(audit(ready, { assets: [{ ...assets[0], kind: "decor" }] }).some(blocker => blocker.includes("artwork")));
  assert.ok(audit([{ ...ready[0], legacyLocationId: "missing" }]).some(blocker => blocker.includes("invalid original location")));
  assert.ok(audit([{ ...ready[0], legacyLocationId: "janson" }]).some(blocker => blocker.includes("invalid original location")));
  assert.ok(audit(Array.from({ length: 4501 }, (_, i) => ({ ...ready[2], id: "building-" + i, legacyLocationId: null })))
    .some(blocker => blocker.includes("limits")));
  assert.ok(audit(ready, { npcs: [] }).some(blocker => blocker.includes("NPC")));
  assert.ok(audit([...ready, { ...ready[1], id: "duplicate-fish" }]).some(blocker => blocker.includes("more than once")));
  assert.ok(audit(ready, { interiorItems: [{ kind: "decor", assetId: "missing", buildingId: "new-shop" }] }).some(blocker => blocker.includes("room decoration")));
  assert.ok(audit(ready, { interiorItems: [{ kind: "effect", assetId: null, buildingId: "missing" }] }).some(blocker => blocker.includes("parent building")));
});
test("NPC lookup is scoped to the original world, tolerates names with titles, and rejects ambiguity", () => {
  assert.equal(resolveLegacyNpcLocation("swamp", " Janson  ", original)?.id, "janson");
  assert.equal(resolveLegacyNpcLocation("swamp", "Janson the Fisher", original)?.id, "janson");
  assert.equal(resolveLegacyNpcLocation("haunted_woods", "Janson", original), undefined);
  assert.equal(resolveLegacyNpcLocation("swamp", "Janson", [...original,
    { ...original[3], id: "duplicate" }]), undefined);
});
test("unlocking checks scene integrity without requiring saved ground or a separate publication", () => {
  const routes = read("server/routes/worldScenePublication.routes.ts");
  assert.match(routes, /if \(!locked\)/);
  assert.match(routes, /hasGround: true, placements/);
  assert.match(routes, /auditWorldActivation\(worldId/);
  assert.match(routes, /resolveLegacyNpcLocation\(worldId, npc\.name, localNpcLocations\)/);
  assert.match(routes, /npcLocationIds\.has\(loc.id\)/);
});

test("retirement only hides a linked building's original same-world hotspot while New is live", () => {
  const links = [
    { id: "building-a", kind: "building", legacyLocationId: "shop", legacyWorldId: "swamp" },
    { id: "building-b", kind: "building", legacyLocationId: "other", legacyWorldId: "haunted_woods" },
  ];
  const settings = [
    { key: retiredLocationKey("swamp", "shop"), value: "building-a" },
    { key: retiredLocationKey("swamp", "other"), value: "building-b" },
  ];
  assert.deepEqual(effectiveRetiredLocations("swamp", true, links, settings), ["shop"]);
  assert.deepEqual(effectiveRetiredLocations("swamp", false, links, settings), []);
  assert.deepEqual(effectiveRetiredLocations("swamp", true, links.slice(1), settings), []);
  assert.deepEqual(effectiveRetiredLocations("swamp", true, [{ ...links[0], id: "new-building" }], settings), []);
});

test("retirement hides presentation, not underlying location records or original handlers", () => {
  const routes = read("server/routes/worldScenePublication.routes.ts");
  const legacy = read("client/src/components/world/WorldLocations.tsx");
  const app = read("client/src/App.tsx");
  assert.match(routes, /placements\/:placementId\/retirement", isAdmin/);
  assert.match(routes, /db\.insert\(gameSettings\)/);
  assert.match(legacy, /locations\.filter\(loc => !hiddenLocationIds\.includes\(loc\.id\)\)/);
  assert.match(legacy, /locations\.find\(row => row\.id === linkedLocationId/);
  assert.match(app, /const search = useSearch\(\)/);
  assert.match(app, /button-show-retired-locations/);
  assert.match(read("server/routes.ts"), /This location supports a new-world building/);
});
