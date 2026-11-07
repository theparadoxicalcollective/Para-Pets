# World Editor Foundation Audit — PRs 1–4

**Scope:** Verify the original four-PR plan and stabilize the admin-only World Editor.
**Baseline:** PR #1014 (drafts), #1015 (scene tools), #1016 (shared gardening).
**Non-goal:** Replacing currently playable worlds or publishing unfinished scenes.

## Implementation ledger

| Original requirement | Implementation verified in code | Notes |
| --- | --- | --- |
| A separate World Editor without changing Pet Park | `WorldSceneEditorPage`, `worldSceneContent.routes`, `worldSceneDraft.routes`, independent scene tables | Camera, visual, effect and image-hit helpers may be shared. No new Pet Park editor code path. |
| One editor for all eight registered worlds | `WORLD_DEFINITION_LIST`, `MapPage` New World Edit buttons, `/world-editor/:worldId` | The editor is shared, each world has its own world ID-scoped scene. |
| Admin-only private drafts, old worlds stay live | `App.tsx` client gate; `isAdmin` server middleware; separate storage with no publication switch | Do **not** substitute new scenes on existing `/world` player routes. |
| Per-world artwork, decoration and building catalogs | `world_scene_assets`; asset CRUD and cross-world reference FKs | `tapImageUrl` can be uploaded and previewed. Player tap-interactions are deferred until new world release. |
| Same basic placement tools as Pet Park | `WorldSceneControls`, `WorldTerrainBrush`, `WorldSceneEditorPage` | World-specific editor; supports select, drag, remove, resize, flip, painterly terrain, snapped diamond painting and erasing. |
| Scene effects and attached decor effects | `WorldDecorEffectEditor`, `WorldDecorEffects`, `ParkEffectVisual` | Pet-only sleep/interactive spots are intentionally rejected. |
| Buildings, interiors, shops | `world_scene_interior_items`, `WorldShopShelf`, world shop item catalog and placement endpoints | Includes interior artwork, decor/effects, shop stock and editable merchandise/tag placement. Actual player sales are **not** live yet. |
| Same seeds/tools/water across areas | `worldGarden.routes`, `worldGardenRefill.routes` consume and refill **existing** `user_inventory` rows | World plots have separate garden state, not separate player inventory. |
| Garden plots, growth and refills | `world_garden_player_plots`, action receipts and world plot/refill endpoints | Admins paint garden plot terrain only. The underlying shared gardening logic is retained for future player-world integration; no Test Gardening mode is shown in the editor. |
| No pet dragging, visitor pets or passive pet rewards | World Editor code excludes Pet Park pet placement and population mechanics | These are intentionally Pet Park-only. |
| Mobile/tablet/editor isolation regression checks | `worldEditorRegression.test.ts`, `worldGardenTransactions.test.ts`, `world-editor-smoke.mjs`, CI wiring | Browser smoke is emulated phone/tablet, **not physical device testing**. |

## PR 4 stabilization corrections

1. Make World Editor object and shop drag pointer capture tolerant of Safari/WebView losing pointer capture.
2. Preserve one-finger panning after pinch release and prevent a second pointer from replacing an active object drag.
3. Mount only visible world-scene art/effects, avoiding thousands of animated off-screen sprites on phones.
4. Keep camera position unchanged if an attempted ground resize fails.
5. Finish tapped-art preview and update obsolete PR 3 copy in the existing tools.
6. Add **actual World Editor** Playwright smoke to the existing browser workflow. Previous browser jobs focused on Pet Park / tutorials and did not directly exercise this editor.
7. Add explicit eight-world, world isolation, geometry, effects, viewport, and route-boundary regression assertions.

## Verification protocol

1. **Automated** — `npm run check`, `npm run check:tests`, `npm test`, `npm run build`, and browser smoke at 390×844 phone and 834×1194 tablet emulations. Watch GitHub CI; a passing build proves compilation, not real-device usability.
2. **World separation** — Open Haunted Woods, upload decor and paint terrain, switch to Elysian Bayou, verify asset/scene isolation, return to Haunted Woods and check saved positions. No edits should affect Pet Park or old map/world routes.
3. **Touch and scene** — Drag/resize/flip decor, zoom/pan, try two-finger pinch and resume one-finger pan, paint/erase paths, enter a building, move interior decor, adjust shop merchandise and price tags. Check both phone and tablet.
4. **Garden and inventory** — Verify Garden Plot terrain can be painted, saved, reloaded and erased in the editor without farming popups. Separately test server garden routes using isolated database fixtures: shared seeds/water, refills, harvest idempotency, and cross-world invalid plot/source IDs.
5. **Security** — Non-admin and moderator sessions must not see the editor button or read/write draft API routes. Verify a direct editor URL cannot expose state.
6. **Regression** — Pet Park editor/placement and rewards, existing world travel and map admin placements, inventory/marketplace, quest tutorials, phone/tablet viewport sizing.

## Intentionally not implemented in these four foundation PRs

- Publishing/rollback/version selection for player-facing worlds. Legacy worlds remain active. A separate per-world release plan must include safe backups and rollback.
- Binding legacy world NPCs, quests, clearings, fishing interactions, navigation markers, shops' **purchase transactions**, and world-specific gameplay to the new scenes. World Editor building/shop configuration is authoring-only until integration.
- Player-world pet team and PvP changes, multiplayer park pets, drag-to-place player pets, park passive pet rewards, and pet-only interactive effects.
- A PC game release. Mobile and tablet remain the supported target; the existing desktop-coming-soon behavior is not altered.

**Acceptance rule:** Treat PR 4 as completion of the **private World Editor foundation**, not completion of migrating the eight actual player worlds. Live rollout needs a separately reviewed, per-world plan and real-device validation.
