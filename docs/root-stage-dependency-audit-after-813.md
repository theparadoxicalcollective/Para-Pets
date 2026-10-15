# Root stage dependency audit — after PR #813

## Verified status (2026-10-14)

PR #813 removed the scaled root renderer from `client/src/App.tsx`. PR #812 made `client/src/lib/stageViewport.ts` use a native viewport for all root routes. The old 390×844 stage is **not required to render the root**, but helper functions and test contracts remain in `stage.ts`. This audit is a focused dependency inventory, **not** a claim that every source-file caller has been reviewed.

### Current production implementation

| File | Confirmed observation | Decision |
| --- | --- | --- |
| `client/src/App.tsx` | Native gameplay/document shells and viewport portal hosts; no `expandedStage` branch | Preserve native portal hosts and HUD stacking |
| `client/src/lib/stageViewport.ts` | Root controller no longer calls `shouldFitPortraitReference` | Preserve keyboard and orientation handling |
| `client/src/lib/stage.ts` | `DESIGN_W=390`, `DESIGN_H=844`; `calculateStageLayout` still supports `coordinateOwner: "stage"`, `referencePortrait`, stage scaling, and fit option | Audit all callers and tests before simplifying; never silently change stored coordinates |
| `client/src/lib/stage.ts` | `getStageScale`, `clientToStage`, `getStageSurface`, `getStageTransform`, `getStagePortalTarget`, `clientToStagePortal` remain exported | Determine whether each export has live consumers before deletion; preserve portal positioning |
| `client/src/lib/stage.ts` | `usesNativeMiniGamePage`, `calculateMiniGameScale`, `calculateMiniGamePage` retain fixed design-size logic | Verify mini-game behavior independently from root viewport |
| `client/src/lib/questGuideViewport.ts` | Native HUD route and a `getStageSurface()` fallback coexist | Keep guide spotlight/tap/drag alignment stable until fallback callers are known |
| `client/src/features/pet-care/FeedingOverlay.tsx` | Uses `clientPointInRenderedElement`, `ViewportModalPortal`, `ViewportScenePortal`; **no** `getStageScale`, `clientToStage`, or `DESIGN_H` import | Do not repeat the old feeding migration; regression-test gestures/effects |
| `client/src/components/WalkAroundScene.tsx` | Uses actual viewport state for world and pet sizing; no `getStageScale` import | Preserve camera/pan and authored world coordinates |
| `client/src/tabletStageShell.css` | Still contains comments describing a 390px stage and legacy strip behavior | Review selectors against native route ownership; remove only dead rules |

### Planned focused PRs

1. **#815 — Verify and retire unconsumed stage-only helpers.** Search actual import/re-export consumers and distinguish obsolete root scaling from independent authored asset/world coordinate systems. Do not remove `getStagePortalTarget` or `getStageSurface` while any overlay or guide uses them.
2. **#816 — Finish native overlay/guide contract audit.** Cover quest guide fallbacks, modal/HUD portals, effects, and feeding pointer interactions across screen sizes; migrate any *confirmed* stage-coordinate consumer.
3. **#817 — Simplify stage layout and tests.** Only after #815/#816, remove unused stage-owned layout and 390×844 portrait-fitting branches; retain any constants demonstrably needed by mini-games or asset art.
4. **#818 — Cross-device regression gate.** CI contract tests plus manual iOS Safari/PWA, Android Chrome/PWA, tablet and desktop checks: Active Pet, Level Up, Closet, Pet Care, admin oval placement, house decor, maps/panning, quests, spotlight/drag, account creation, popups and navigation.

### Invariants

- Admin oval placement is scene-relative; pet, stars, name/level and power-up nodes should follow their intended pet/scene anchors.
- World camera/scene coordinates and saved house/decor placement must not be converted to screen coordinates.
- HUD, overlays and modals should use their actual viewport owner; avoid introducing new 390×844 compatibility wrappers.
- CI passing is necessary but does not establish that touch input, z-index or placement is correct on physical devices.
