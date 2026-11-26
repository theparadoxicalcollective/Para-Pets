import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_DEFINITION_LIST } from "../shared/worlds/worldRegistry";
import {
  clampPlayerWorldZoom, isPublishedWorld, PLAYER_WORLD_ZOOM_MAX,
  PLAYER_WORLD_ZOOM_STEP, type WorldScenePublication,
} from "../shared/worlds/worldScenePublication";

const read = (path: string) => readFileSync(path, "utf8");

test("each world starts in old mode and can switch independently", () => {
  const statuses: WorldScenePublication[] = WORLD_DEFINITION_LIST.map(world => ({
    worldId: world.id, active: false, hasBeenLive: false,
    updatedAt: null, firstEnabledAt: null,
  }));
  for (const world of WORLD_DEFINITION_LIST) {
    assert.equal(isPublishedWorld(world.id, statuses), false);
  }
  const first = statuses[0];
  const switched = statuses.map(status => status.worldId === first.worldId
    ? { ...status, active: true, hasBeenLive: true } : status);
  assert.equal(isPublishedWorld(first.worldId, switched), true);
  for (const other of statuses.slice(1))
    assert.equal(isPublishedWorld(other.worldId, switched), false);
  assert.equal(isPublishedWorld("not_a_world", switched), false);
});

test("player zoom ends below editor ceiling, clamps invalid and extreme pinch inputs", () => {
  assert.equal(PLAYER_WORLD_ZOOM_MAX, 1.4);
  assert.ok(PLAYER_WORLD_ZOOM_STEP <= .12);
  assert.equal(clampPlayerWorldZoom(5, .6), 1.4);
  assert.equal(clampPlayerWorldZoom(Infinity, .6), 1);
  assert.equal(clampPlayerWorldZoom(-999, .6), .6);
  assert.equal(clampPlayerWorldZoom(1.1, .7), 1.1);
});

test("Save & Set Live is a per-world admin action, no second draft publication", () => {
  const routes = read("server/routes/worldScenePublication.routes.ts");
  const editor = read("client/src/pages/WorldSceneEditorPage.tsx");
  const controls = read("client/src/components/world-editor/WorldSceneControls.tsx");
  const map = read("client/src/pages/MapPage.tsx");
  const player = read("client/src/pages/WorldScenePlayerPage.tsx");
  const schema = read("shared/schema.ts");
  const migration = read("server/startup/migrations/ensureWorldScenePublicationStorage.ts");
  assert.match(routes, /app\.put\("\/api\/admin\/world-editor\/:worldId\/publication", isAdmin/);
  assert.match(routes, /app\.get\("\/api\/worlds\/:worldId\/player-scene", isAuthenticated/);
  assert.match(routes, /if \(active && !saveAndSetLive && !existing\?\.firstEnabledAt\)/);
  assert.match(routes, /if \(!publication\?\.active\)/);
  assert.match(routes, /db\.select\(\)\.from\(worldScenePlacements\)/,
    "Players read saved placements rather than an independent snapshot");
  assert.doesNotMatch(schema, /snapshot: jsonb\("snapshot"\)/);
  assert.doesNotMatch(migration, /snapshot jsonb/);
  assert.match(controls, /data-testid="button-save-and-set-world-live"/);
  assert.match(editor, /saveAndSetLive: true/);
  assert.match(editor, /onSaveAndSetLive=\{\(\) => saveAndSetLive\.mutate\(\)\}/);
  assert.match(map, /button-switch-world-/);
  assert.match(map, /!newActive && !hasBeenLive/);
  assert.match(player, /refetchInterval: 20_000/);
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
  assert.match(app, /<WorldPage user=\{worldUser\}/);
  assert.match(app, /legacyLocationId/);
});
