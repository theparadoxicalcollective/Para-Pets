# Root-stage coordinate migration audit (after PR #789)

## Verified scope
- All 21 `StagePageSurface` mounts in `client/src/App.tsx` use `layout="viewport"`; `StagePageSurface.tsx` no longer creates a reference plane.
- **The root shell still has a stage-owned branch.** `App.tsx` computes `expandedStage`, renders `game-stage-content`, applies `scale(layout.scale)`, and publishes `--stage-reference-*` variables. Removing the page wrapper did not remove this root behavior.
- `client/src/lib/stage.ts` still defines `DESIGN_W=390`, `DESIGN_H=844`, `calculateStageLayout`'s reference portrait branch, `getStageScale`, `clientToStage`, `getStagePortalTarget`, and `getStageSurface`.
- `client/src/lib/stageViewport.ts` still calls `shouldFitPortraitReference` and publishes stage-logical and viewport-surface CSS variables. This module must be migrated with the root shell, not removed independently.

## Inspected live dependencies (source verified)
| Consumer | Dependency | Risk / next action |
|---|---|---|
| `WalkAroundScene.tsx` | `getStageScale` | Convert pointer and joystick coordinates through the rendered scene rect; preserve world coordinates |
| `PvpBattlePage.tsx` | `getStagePortalTarget` | Check battle overlays/drag ghosts and modal stacking before switching portal target |
| `FeedingOverlay.tsx` | `DESIGN_H`, `getStageScale`, `clientToStage`, `getStagePortalTarget` | High risk: feeding gesture and particles; migrate separately with interaction tests |
| `questGuideViewport.ts` | `getStageScale`, `getStageSurface` | Spotlight and guided tap/drag target alignment across devices |
| `FloatingNav.tsx` | `getStageSurface` | Keep HUD pinned to viewport, not camera or authored world |
| `stageViewport.ts` | `shouldFitPortraitReference` | Eliminate portrait fit only after root shell and coordinate consumers are ready |
| `RaidBattlePage.tsx` | No direct stage conversion in inspected file | Potion ghost now uses viewport client coordinates, following PR #788 |
| `MiniGameFrame.tsx` | No direct legacy stage helper in inspected file | Existing device viewport scene portal |

## Safe migration sequence
1. Establish a **root viewport ownership contract** (including auth/loading/fallback paths), preserving browser keyboard and orientation behavior. Keep compatibility transforms only while real consumers remain.
2. Migrate scene pointer conversions (`WalkAroundScene`) to element-local rendered geometry and verify panning/joystick.
3. Migrate battle/feeding drag ghosts, tutorial spotlights, effects and floating HUD portal targets, each with targeted tests.
4. Audit saved admin oval/scene placements and their persisted coordinate formats; never reinterpret existing saved values as viewport pixels.
5. Only then delete `DESIGN_W/H`, reference fitting, stage-owned layout, CSS reference vars, and unused mini-game sizing helpers.
6. Run real iOS/Android/tablet/desktop gameplay QA. Static source tests alone do not demonstrate correct rendering or gestures.

## Guardrails
- No blanket search-and-replace of 390/844 values: artwork extents and historical persisted coordinates may legitimately use fixed dimensions.
- Never mix viewport client coordinates with scene/world positions or HUD positions.
- Do not remove legacy helpers merely because no source-code search result was returned; repository code-search indexing is incomplete. This audit examined the files named above, not every source file.
- Merge only after CI passes. The audit PR intentionally changes no runtime rendering or saved data.
