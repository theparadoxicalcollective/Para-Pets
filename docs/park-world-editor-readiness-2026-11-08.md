# Pet Park + World Editor — stabilization and readiness audit (2026-11-08)

**Scope:** Current editor feature paths, their shared renderer/clock/data dependencies, and regression coverage. This is an implementation review, **not** a real-device visual signoff or a production publishing decision. See PR #1027 for the narrow corrections made in response.

## Current accepted lighting schedule

| Event | Auto-mode local clock | Behavior |
| --- | --- | --- |
| Outdoor lamps start activating | 18:00 | Existing dusk fade, neutral scene-mask illumination |
| Optional nighttime room image | 19:00 | Immediate image switch; one existing interior darkness slider |
| Fireflies start appearing | 19:30 | Individual fluttering lights begin their existing fade-in |
| Outdoor lamps and fireflies finish turning off | 06:00 | Scene-only light strength reaches zero |
| Daytime room image returns | 06:30 | Immediate image switch |
| Outdoor background reaches full daytime | 07:30 | Preserve the existing gradual scene-brightness transition |

The clocks use **device-local time** in `client/src/lib/homeOutdoorLighting.ts`; both editors consume `useHomeOutdoorLighting("auto")`. Day/night **interior preview buttons** override only the preview. The existing Pet Home night-transition calculation is **not changed**. Clock updates are aligned to wall-clock 30-second boundaries and resync when a backgrounded page resumes; platform timer delays are still possible.

## Implementation walkthrough

| Feature / requirement | Evidence and current assessment |
| --- | --- |
| Native viewport and pan/zoom | `PetParkPage.tsx`, `WorldSceneEditorPage.tsx`, `petParkCamera.ts`, `worldEditorCamera.ts`: native viewport, world/scene-relative placements, clamped camera and pinch zoom. World now coalesces pointer camera updates per animation frame like Pet Park. |
| Direct manipulation and precise hit areas | `petParkAdminSelection.ts` and `petParkImageHit.ts`: alpha-aware selection for overlapping decoration/building artwork; centered handles for transparent effects; depth-based hit testing. World and Park support selection and double-tap-to-move, independent of camera pan. |
| Isometric terrain and snapping | `PetParkTerrain.tsx`, `PetParkTerrainBrush.tsx`, `WorldTerrainBrush.tsx`, shared terrain helpers: canvas-rendered grass and ground variants, snapped dirt/stone/water paths and garden plots. Terrain clear lives in the relevant admin controls. |
| Depth and presentation | `petParkDepth.ts` and scene placement layers: ground-relative art ordering; standalone glow layers separate from buildings; `PetParkGroundShadow` adds ambient shadow only to pets, not buildings/decor. |
| Lamps, fireflies and other effects | Shared `petParkAtmosphere.ts`, `ParkEffectVisual.tsx`, `ParkFireflySwarm.tsx`, `HomeOutdoorAtmosphere.tsx`, `parkSceneLighting.ts`: scaled neutral cutouts instead of yellow daylight washes; attached and standalone effect support; each active firefly animates its visible core and matching small mask area. Water and other existing effects remain available. |
| Building interiors | `PetParkInteriorRoom.tsx`, `PetParkBuildingDetails.tsx`, `WorldSceneEditorPage.tsx`, `WorldSceneControls.tsx`: single room-darkness mask, optional alternate night artwork, immediate clock-driven image swaps, Day/Night/Live author previews. Interior decorations and pets remain on the same image coordinate surface. |
| Uploaded artwork, duplicates and shops | Both editors support image uploads, exterior/indoor assets, lamp color edits, decor effects, size/flip, building shops and catalog selection. World copies share library artwork but keep independent transforms. Server routes validate world/park scope and image sizes. |
| Pet Park interactive gameplay | Slot/unlock, rewards/deposits, capacity, idle display, shop and water/garden features are separate from the admin editor, with independent route and test coverage. Do not equate admin-preview access with publication to players. |
| Persistence and access boundaries | `server/routes/petParkAdmin.routes.ts` and `worldSceneContent.routes.ts`: scoped authenticated mutations, validated transforms/effects/capacity, additive migrations; no destructive schema changes in PR #1027. |

## Corrections in PR #1027

1. Clock outputs are decoupled: outdoor scene brightness keeps its smooth dawn; lamps and fireflies finish turning off by 06:00; room images switch at 19:00/06:30; fireflies begin at 19:30.
2. Clock refreshes align to real :00/:30 boundaries, avoiding a full 30-second drift after the author opens the page.
3. World camera pan/pinch updates are coalesced to one `requestAnimationFrame` commit per frame; scene-relative saved positions remain unchanged.
4. After creating a Pet Park building, clear the previously selected night-interior image in the creator state so it cannot silently carry into another building.
5. Boundary and wiring tests cover the new schedule, scene lamp cutoff, single-mask illumination, and camera batching.

## Important scope limits / carry-forward items

- **World publishing is still separate.** `WorldSceneEditorPage.tsx` and `worldSceneContent.routes.ts` work on **private admin drafts**. Player-world consumption/publishing is not completed by this editor; don't describe it as live across player worlds. A future publishing/cutover PR must explicitly trace the player world scenes and game map navigation.
- **Firefly mobile density ceiling:** `shared/petParkAtmosphere.ts` limits active visible swarms to `PARK_MAX_VISIBLE_FIREFLY_FIELDS = 8`. More authored swarms remain stored but may be skipped visually. This prevents unbounded mobile SVG animation work, yet needs a clearly communicated admin limit or a deliberate density policy before large-scale decoration.
- **Shared-effect-editor duplication:** `PetParkDecorEffectEditor.tsx` and `world-editor/WorldDecorEffectEditor.tsx` are nearly identical, but have different effect sets, copy semantics and test IDs. Likewise two small attached-effect wrappers are near-identical. Consolidate only with full behavior/UI test coverage; avoid introducing a new rendering system solely to remove similar lines.
- **Legacy nullable night-darkness fields:** Old `interiorNightDarkness` storage/route validation remains in schema for compatibility, but current UI and rendering use one darkness setting and optional night imagery. Do not drop/rename the database column in a quick cleanup PR.
- **Visual-device acceptance still required:** CI and Playwright smoke tests cannot certify the perceived brightness, light falloff, image quality, iOS touch latency or dense firefly animation in the live game. Test at least an iPhone and tablet after merge with real uploaded assets, especially 18:00/19:00/19:30 and 06:00/06:30 transitions, normal and expanded interiors, overlapping buildings, and repeated drag/save.

## Regression checks to use

- `npm run check`, `npm run check:tests`, `npm test`, `npm run build`.
- `test/nightInteriorArtworkClock.test.ts`, `test/parkWorldFireflies.test.ts`, `test/parkWorldFireflyIllumination.test.ts`, `test/parkWorldEditorFinalAudit.test.ts`.
- `test/worldEditorRegression.test.ts`, `test/petParkAdminVisibleArtworkSelection.test.ts`, `test/petParkTerrainBrush.test.ts`, `test/petParkPersistence.test.ts`, `test/petParkShopBuilding.test.ts`.
- `script/world-editor-smoke.mjs`, `script/pet-park-interior-dimming-smoke.mjs`, `script/pet-park-placement-smoke.mjs`, and the project's usual phone/tablet public-route smoke workflows.

**Decision boundary:** Once checks and real-device validation pass, Pet Park / admin World Editor *authoring* can be treated as stabilized enough to begin the next independently scoped feature. Publishing those worlds to players and addressing high-density visual limits remain tracked decisions, not automatically complete.
