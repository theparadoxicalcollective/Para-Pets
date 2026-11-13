import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parkGroundSize, parkExpandPoint, PET_PARK_GROUND_THEMES,
} from "../shared/petParkGround";
import { WORLD_GROUND_THEMES, isWorldGroundTheme } from "../shared/worlds/worldGroundTheme";
import { parseWorldSceneDraftSettings } from "../shared/worlds/worldSceneDraft";
import { PARK_GROUND_PALETTES } from "../client/src/lib/petParkGroundPalette";
import { worldGroundPalette, worldGroundRenderTheme } from "../client/src/lib/worldGroundPalette";
import { getWorldDefinition, WORLD_DEFINITION_LIST } from "../shared/worlds/worldRegistry";
import {
  isEditableWorldSceneId, defaultWorldSceneDraft,
} from "../shared/worlds/worldSceneDraft";
import {
  worldTerrainCell, validDecorEffects, validEffect, validShopIds,
} from "../shared/worlds/worldSceneContent";
import { parkCameraGeometry, parkClampCamera, parkZoomAnchorPan } from "../client/src/lib/petParkCamera";
import { WORLD_EDITOR_ZOOM_MIN, worldEditorMinZoom, worldEditorClampZoom, worldEditorCameraGeometry, worldEditorClampCamera, worldEditorZoomAnchorPan } from "../client/src/lib/worldEditorCamera";

test("Haunted Woods has a subtle purple world-only palette; City preserves original gray", () => {
  assert.equal(isWorldGroundTheme("city"), true);
  assert.equal(isWorldGroundTheme("haunted"), true);
  assert.equal(isWorldGroundTheme("nonexistent"), false);
  assert.ok(WORLD_GROUND_THEMES.some(theme => theme.type === "city" && theme.label === "City"));
  assert.equal(PET_PARK_GROUND_THEMES.some(theme => String(theme.type) === "city"), false,
    "City is a World Editor preset, not a new Pet Park mode");
  assert.deepEqual(worldGroundPalette("city"), PARK_GROUND_PALETTES.haunted,
    "City is visually identical to the preexisting gray Haunted palette");
  assert.equal(worldGroundRenderTheme("city"), "haunted");
  assert.notEqual(worldGroundPalette("haunted")?.base, PARK_GROUND_PALETTES.haunted.base,
    "world Haunted gets a distinct purple-tinted palette");
  const tinted = worldGroundPalette("haunted")!;
  assert.ok(tinted.rgb[2] > tinted.rgb[1] && tinted.rgb[0] > 0,
    "Haunted tint leans purple without introducing a different terrain system");
  assert.equal(worldGroundPalette("grass"), undefined,
    "normal biomes use existing Pet Park ground drawing untouched");
  assert.deepEqual(parseWorldSceneDraftSettings({ groundLevel: 2, groundTheme: "city" }),
    { groundLevel: 2, groundTheme: "city" });
  const storageMigration = readFileSync("server/startup/migrations/ensureWorldSceneDraftStorage.ts", "utf8");
  assert.match(storageMigration, /CHECK \(ground_theme IN \([^)]*'city'\)\)/);
  assert.match(storageMigration, /pg_get_constraintdef\(oid\) NOT LIKE '%city%'/,
    "existing world drafts must migrate their old five-theme DB constraint once");
  const editor = readFileSync("client/src/pages/WorldSceneEditorPage.tsx", "utf8");
  const brush = readFileSync("client/src/components/world-editor/WorldTerrainBrush.tsx", "utf8");
  assert.match(editor, /worldGroundPalette\(groundTheme\)/);
  assert.match(brush, /WORLD_GROUND_THEMES\.map/);
});

test("World Editor City constraint migration uses valid paired PostgreSQL dollar delimiters", () => {
  const migration = readFileSync("server/startup/migrations/ensureWorldSceneDraftStorage.ts", "utf8");
  assert.match(migration, /DO \$\$\s+BEGIN[\s\S]*?END \$\$;/,
    "DO blocks require matching $ delimiters or production boot can crash before /health listens");
  assert.doesNotMatch(migration, /\bDO \$(?!\$)/);
  assert.doesNotMatch(migration, /\bEND \$(?!\$)/);
});

test("object editing defaults to compact movement controls, with details opened only on demand", () => {
  const source = readFileSync("client/src/components/world-editor/WorldSceneControls.tsx", "utf8");
  const compact = source.split('data-testid="world-scene-selected-controls"')[1]
    ?.split("    {expanded && panel === \"settings\"")[0];
  assert.ok(compact);
  assert.match(compact, /openCreator\("selected"\)/);
  assert.doesNotMatch(compact, /<WorldDecorEffectEditor|Replace Decoration Artwork/,
    "expensive previews should never block moving decorations on initial selection");
  assert.match(source, /data-testid="world-scene-details-panel"/);
  assert.match(source, /<WorldDecorEffectEditor/,
    "detailed effects editing is still available when explicitly opened");
});

test("one private editor covers every registered world without Pet Park becoming a world", () => {
  assert.equal(WORLD_DEFINITION_LIST.length, 8);
  for (const world of WORLD_DEFINITION_LIST) {
    assert.ok(getWorldDefinition(world.id));
    assert.equal(isEditableWorldSceneId(world.id), true);
    assert.equal(defaultWorldSceneDraft(world.id).hasSavedDraft, false);
  }
  assert.equal(isEditableWorldSceneId("pet_park"), false);
  assert.equal(isEditableWorldSceneId(""), false);
  assert.equal(isEditableWorldSceneId("../haunted_woods"), false);
});

test("world terrain grid keys remain valid when the author expands the ground", () => {
  for (const type of ["dirt_path", "stone_path", "water_path", "garden_plot"] as const) {
    const old = parkGroundSize(1);
    const starting = worldTerrainCell({ xPct: .51, yPct: .48 }, old, type, 150);
    assert.ok(starting);
    const grown = parkExpandPoint(starting, 1, 4);
    const resized = worldTerrainCell(grown, parkGroundSize(4), type, 150);
    assert.ok(resized);
    assert.equal(resized.key, starting.key, "saved tile address is consistent after expansion");
    assert.ok(Math.abs(resized.xPct - grown.xPct) < 1e-9);
    assert.ok(Math.abs(resized.yPct - grown.yPct) < 1e-9);
  }
});

test("World Editor Fit covers the viewport at Pet Park-safe zoom on phones and tablets", () => {
  assert.equal(WORLD_EDITOR_ZOOM_MIN, 0.6);
  const viewports = [
    [320, 768], [360, 800], [390, 844], [430, 932],
    [768, 1024], [834, 1194], [900, 1300], [1440, 900],
  ] as const;
  for (const [width, height] of viewports) {
    for (const groundLevel of [1, 2, 4]) {
      const minimum = worldEditorMinZoom(width, height, groundLevel);
      assert.ok(minimum >= .6 && minimum <= 1,
        "World Editor should not zoom out past Pet Park's minimum");
      assert.equal(worldEditorClampZoom(-10, width, height, groundLevel), minimum);
      assert.equal(worldEditorClampZoom(Number.NaN, width, height, groundLevel), 1);
      const fitted = worldEditorCameraGeometry(width, height, groundLevel, minimum);
      assert.ok(fitted.sceneWidth >= width - .001 && fitted.sceneHeight >= height - .001,
        "ground must COVER the viewport on " + width + "×" + height + ", level " + groundLevel);
      assert.equal(fitted.worldWidth, parkGroundSize(groundLevel).width);
      assert.equal(fitted.worldHeight, parkGroundSize(groundLevel).height);
      // The camera never reveals beyond any of the four terrain edges.
      const topLeft = worldEditorClampCamera({ x: 100000, y: 100000 }, fitted, { width, height });
      const bottomRight = worldEditorClampCamera({ x: -100000, y: -100000 }, fitted, { width, height });
      assert.deepEqual(topLeft, { x: 0, y: 0 });
      assert.deepEqual(bottomRight, { x: -fitted.limitX, y: -fitted.limitY });
      const prior = worldEditorCameraGeometry(width, height, groundLevel, 1);
      const anchor = { x: width / 2, y: height / 2 };
      const focal = worldEditorZoomAnchorPan(
        worldEditorClampCamera({ x: -prior.limitX / 2, y: -prior.limitY / 2 }, prior, { width, height }),
        prior.scale, fitted.scale, anchor, fitted, { width, height },
      );
      const clamped = worldEditorClampCamera(focal, fitted, { width, height });
      assert.deepEqual(clamped, focal);
      assert.ok(focal.x <= 0 && focal.x >= -fitted.limitX);
      assert.ok(focal.y <= 0 && focal.y >= -fitted.limitY);
    }
  }
  // Pet Park is not modified by this World Editor-only restriction.
  assert.equal(parkCameraGeometry(390, 844, 1, 0.1).scale,
    parkCameraGeometry(390, 844, 1, 0.6).scale);
  const page = readFileSync("client/src/pages/WorldSceneEditorPage.tsx", "utf8");
  assert.match(page, /worldEditorClampZoom\(pinch\.current\.zoom/);
  assert.match(page, /worldEditorCameraGeometry\(size\.width, size\.height, groundLevel, nextZoom\)/);
  assert.match(page, /worldEditorZoomAnchorPan/);
  assert.match(page, /backgroundColor: groundBackdrop/);
});

test("camera zoom stays bounded on phone and tablet without a 390 by 844 reference stage", () => {
  for (const [width, height] of [[390, 844], [834, 1194], [768, 1024]]) {
    const current = parkCameraGeometry(width, height, 3, 1);
    const pan = parkClampCamera({ x: -current.limitX / 2, y: -current.limitY / 2 }, current);
    const larger = parkCameraGeometry(width, height, 3, 1.15);
    const next = parkZoomAnchorPan(pan, current.scale, larger.scale,
      { x: width / 2, y: height / 2 }, larger);
    const oldCenter = (width / 2 - pan.x) / current.scale;
    const newCenter = (width / 2 - next.x) / larger.scale;
    assert.ok(Math.abs(oldCenter - newCenter) < 1e-8);
  }
});

test("world effects exclude pet sleep spots; decoration and shop validations stay strict", () => {
  assert.equal(validEffect("sleep"), false);
  assert.equal(validEffect("waterfall_mist"), true);
  assert.equal(validDecorEffects([{ id: "pet-only", type: "sleep", x: .5, y: .5, size: 40 }]), false);
  assert.equal(validShopIds(["not-a-uuid"]), false);
  const item = "00000000-0000-4000-8000-000000000001";
  assert.equal(validShopIds([item]), true);
  assert.equal(validShopIds([item, item]), false);
});

test("new editor is isolated from the legacy worlds, Pet Park, pet rewards and public purchases", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  const map = readFileSync("client/src/pages/MapPage.tsx", "utf8");
  const editor = readFileSync("client/src/pages/WorldSceneEditorPage.tsx", "utf8");
  const sceneRoutes = readFileSync("server/routes/worldSceneContent.routes.ts", "utf8");
  const gardenRoutes = readFileSync("server/routes/worldGarden.routes.ts", "utf8");
  const refillRoutes = readFileSync("server/routes/worldGardenRefill.routes.ts", "utf8");
  const sceneTables = readFileSync("server/startup/migrations/ensureWorldSceneContentStorage.ts", "utf8");
  const gardenTables = readFileSync("server/startup/migrations/ensureWorldGardenStorage.ts", "utf8");
  assert.match(app, /location\.startsWith\("\/world-editor\/"\) && user\.isAdmin/);
  assert.match(map, /button-new-world-edit-/);
  assert.match(editor, /<WorldSceneControls/);
  assert.doesNotMatch(editor, /<WorldGardenPreview|Test Gardening|previewGarden/,
    "the world creator should only author garden plots, not test player farming");
  const brush = readFileSync("client/src/components/world-editor/WorldTerrainBrush.tsx", "utf8");
  assert.match(brush, /garden_plot/);
  assert.match(editor, /<WorldTerrainBrush/);
  assert.match(editor, /safeSetPointerCapture/);
  assert.match(sceneRoutes, /registerWorldSceneContentRoutes/);
  assert.match(gardenRoutes, /worldGardenPlayerPlots/);
  assert.match(refillRoutes, /worldScenePlacements/);
  assert.match(sceneTables, /world_scene_placements/);
  assert.match(gardenTables, /world_garden_player_plots/);
  for (const source of [sceneRoutes, gardenRoutes, refillRoutes]) {
    assert.doesNotMatch(source, /\/api\/admin\/pet-park\//,
      "new worlds must not write to Pet Park admin endpoints");
    assert.doesNotMatch(source, /\/api\/world\//,
      "new worlds remain unpublished; player world routes are untouched");
  }
  assert.doesNotMatch(editor, /<PetAnimator|<PetParkPage/);
  assert.doesNotMatch(editor, /390\s*[*x×]\s*844/);
});

test("world creator keeps Pet Park-style one-step forms without a mandatory asset library", () => {
  const form = readFileSync("client/src/components/world-editor/WorldSceneCreateForm.tsx", "utf8");
  const controls = readFileSync("client/src/components/world-editor/WorldSceneControls.tsx", "utf8");
  const routes = readFileSync("server/routes/worldSceneContent.routes.ts", "utf8");
  assert.match(form, /Building Name/);
  assert.match(form, /Starting building size/);
  assert.match(form, /Is Shop/);
  assert.match(form, /Interior Background \(optional\)/);
  assert.match(form, /WorldDecorEffectEditor/);
  assert.match(form, /Tap Image/);
  assert.match(form, /Starting size/);
  assert.match(form, /testId="world-create-decor-behavior"/);
  assert.match(readFileSync("client/src/components/DecorSurfaceSelector.tsx", "utf8"), /value: "water", label: "Water Source"/);
  assert.match(form, /\/assets/);
  assert.match(form, /\/placements/);
  assert.match(controls, /<WorldSceneCreateForm/);
  assert.doesNotMatch(controls, /Artwork Library|Save to This World's Library/,
    "creating a world decoration should not require a separate library workflow");
  assert.match(controls, /Duplicate world decoration/);
  assert.match(controls, /Replace Decoration Artwork/);
  assert.match(controls, /Edit decoration Tap Image/);
  assert.match(routes, /eq\(worldScenePlacements\.worldId, worldId\)/);
  assert.match(routes, /saved\.kind === "decor" && saved\.assetId &&/);
  assert.match(routes, /"decorEffects" in changes \|\| "decorSurface" in changes \|\| "isWaterSource" in changes/,
    "linked World decoration types share effects and behavior");
});

test("browser CI includes an actual world editor phone/tablet fixture", () => {
  const workflow = readFileSync(".github/workflows/browser-smoke-pilot.yml", "utf8");
  const smoke = readFileSync("script/world-editor-smoke.mjs", "utf8");
  assert.match(workflow, /node script\/world-editor-smoke\.mjs/);
  assert.match(workflow, /client\/src\/components\/world-editor\/\*\*/);
  assert.match(smoke, /\["phone", 390, 844\]/);
  assert.match(smoke, /\["tablet", 834, 1194\]/);
  assert.match(smoke, /petParkRequests/);
  assert.match(smoke, /publicWorldRequests/);
});

test("one tap selects only visible world artwork; dragging the scene never moves the selected object", () => {
  const editor = readFileSync("client/src/pages/WorldSceneEditorPage.tsx", "utf8");
  const controls = readFileSync("client/src/components/world-editor/WorldSceneControls.tsx", "utf8");
  const picker = readFileSync("client/src/lib/petParkAdminSelection.ts", "utf8");
  const hit = readFileSync("client/src/lib/petParkImageHit.ts", "utf8");
  assert.match(editor, /const pendingObjectTap = useRef/);
  assert.match(editor, /pickParkAdminArtwork\(art, event\.clientX, event\.clientY/);
  assert.match(editor, /pendingObjectTap\.current = item \?/);
  assert.match(editor, /Math\.hypot\(event\.clientX - tap\.x, event\.clientY - tap\.y\) < 7/);
  assert.match(editor, /setSelectedId\(tap\.id\)/);
  assert.match(editor, /kind === "outdoor" && selectedId !== item\.id\) return false/);
  assert.match(editor, /startCamera\(event\)/);
  assert.match(editor, /Math\.hypot\(event\.clientX - drag\.clientX, event\.clientY - drag\.clientY\) < 7/);
  assert.match(editor, /if \(pinch\.current\) return/);
  assert.match(editor, /onPointerUpCapture=\{event => \{[\s\S]*?if \(paintMode \|\| activeBuilding\) return/);
  assert.match(editor, /onPointerCancelCapture=\{event => \{[\s\S]*?if \(paintMode \|\| activeBuilding\) return/);
  assert.match(editor, /onPointerMoveCapture=\{event => \{[\s\S]*?if \(paintMode \|\| activeBuilding\) return/);
  assert.doesNotMatch(editor, /doubleTap|lastObjectTap|moveArmedId/);
  assert.match(controls, /Drag selected artwork to move · swipe background to pan/);
  assert.doesNotMatch(controls, /Double-tap artwork to move/);
  assert.match(picker, /!image \|\| !parkImageHitAt\(image, clientX, clientY, object\.flipped\)/);
  assert.match(hit, /mask\[pixelY \* MASK_SIZE \+ pixelX\] > ALPHA_THRESHOLD/);
  assert.match(editor, /if \(event\.detail === 0\) setSelectedId\(p\.id\)/);
  assert.match(editor, /drop-shadow\(1px 0 0 #efca79\)/,
    "selection outline follows the visible art rather than the PNG bounds");
});
