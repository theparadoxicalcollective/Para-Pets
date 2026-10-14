# Final root-stage dependency inventory (PR #802)

This inventory follows merged PR #801. It is a **source-grounded migration gate**, not a claim that all source files or live device flows have been verified. Do not delete root-stage geometry until the remaining consumers and saved-placement formats are checked.

## Runtime root owners

| Source | Current contract | Migration gate |
| --- | --- | --- |
| `client/src/App.tsx` | `GameStage` already has a native route branch via `usesDeviceGameplaySurface(location)`; the fallback branch still scales `#game-stage`, offsets `#game-stage-content`, and conditionally creates page/backdrop/scene portals with `--stage-reference-*` variables | Inventory remaining fallback routes; move them to native ownership without dropping modal/scene/HUD layers |
| `client/src/RootEntry.tsx` | `RootStage` calls `useStageViewportLayout()` with no pathname and can create `root-stage-reference-plane` | Make auth/loading entry route-aware and native; test keyboard, loading and verification states |
| `client/src/lib/stageViewport.ts` | PR #801 skips portrait fitting for `usesDeviceGameplaySurface(pathname)`; other routes still request legacy fitting | Remove fallback fitting only after all root owners migrate |
| `client/src/lib/stage.ts` | `DESIGN_W=390`, `DESIGN_H=844`, `calculateStageLayout`, `getStageScale`, `clientToStage`, `getStageSurface`, `getStagePortalTarget`, `calculateMiniGamePage` | Check every caller; distinguish viewport pixels from authored world units; retire only after consumers are migrated |
| `client/src/tabletStageShell.css` | Selectors explicitly match `#game-stage[data-coordinate-owner="stage"]`; old comments describe a 390×844 coordinate plane | Audit each selector after fallback owners disappear; remove dead compatibility rules |

## Portal and guide dependencies

- `ViewportHudPortal.tsx` mounts in `#game-viewport-hud`, a child of `#game-stage`; maintain its stacking order and pointer-event behavior when moving ownership.
- `ViewportModalPortal.tsx` mounts blocking overlays above persistent HUD; verify modal priority and drag interaction on touch devices.
- `ViewportScenePortal.tsx` still targets `#game-viewport-scene` on stage-owned layouts; establish a native scene owner or intentional inline fallback before removing that target.
- `questGuideViewport.ts` still uses `getStageSurface()` for non-expanded targets; preserve anchored and missing-anchor guide behavior, including Pet Menu and NPC quest steps.
- `StagePageSurface.tsx` and all 21 mounts in `App.tsx` use viewport layout. Do not re-migrate these wrappers.

## Route boundary (verified in current source)

`usesDeviceGameplaySurface` explicitly includes Home, Map, World routes, Pet House, Friends, Cards, Badges, Coins, Market, Bayou Clearing, Molten Blocks, Lava Crawl, Raid, PvP, Bag, Pets, Level Up, Pet Care, and Closet/Equip Accessories.

`shouldUseDocumentLayout` explicitly includes `/auth` and `/hub`. RootEntry currently calls `useStageViewportLayout()` **without** the pathname, so the entry shell must be handled independently even when the page's App shell is native.

Routes not explicitly in the native allowlist are **not proof of live legacy gameplay**. `App.tsx` routes such as `/reset-password/:token`, `/privacy`, `/forum`, `/founders`, `/admin`, and `/visit/:userId` require an ownership decision and regression coverage. Unknown URLs redirect; they should not automatically be converted into a new gameplay scene.

## Data contracts to preserve

- Existing admin oval placements for Active Pet, Power Up, Level Up and Closet.
- World/map cameras and authored NPC/object positions.
- Pet House decor, objects, and pet positions, including legacy-admin sizing where persisted values require it.
- Pet Care pointer gestures, drag ghosts, hit testing and particle layering.
- Quest spotlight and tutorial tap/drag behavior, especially Pet Menu and NPC discovery.

Do not reinterpret saved world/admin coordinates as viewport pixels. Historical 390/844 numbers in authored artwork or persisted data may be valid **data**, not a root viewport restriction.

## Follow-up PR gates

1. **#803 proposed:** route-aware native entry/auth/loading shell; preserve keyboard/orientation behavior.
2. **#804 proposed:** remove App fallback stage owner after classifying isolated routes and portal dependencies.
3. **#805 proposed:** lock saved-placement, guide, modal, camera and gesture contracts with targeted tests.
4. **#806 proposed:** remove dead stage helper consumers and stage-only CSS, including mini-game reference helpers if truly unused.
5. **#807 proposed:** remove obsolete root reference constants/fitting and replace legacy stage assertions.
6. **#808 proposed:** real-device iOS, Android, tablet, desktop gameplay QA and focused fixes.

## Release gates

CI success alone cannot verify rendered gameplay. Confirm account creation, viewport orientation/keyboard behavior, Active Pet and accessories, Home decor, world panning, tutorial spotlights, Pet Care gestures, modals and overlays on real devices before declaring the migration complete.
