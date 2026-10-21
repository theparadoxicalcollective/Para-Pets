# Cross-device viewport ownership audit — Phase 1

## Scope and verified code paths

- `client/src/App.tsx` and `client/src/RootEntry.tsx` consume `useStageViewportLayout` from `client/src/lib/stageViewport.ts`; they do not independently calculate a legacy reference-stage layout.
- `readStageViewportLayout` passes `{ viewportSurface: true }` to `calculateStageLayout`, keeping root gameplay viewport-owned. `stageViewport.ts` owns browser resize/orientation/visual-viewport lifecycle and publishes CSS variables.
- `desktopPortraitGameplayLayout` applies only to non-touch wide gameplay routes. It uses actual pixels, a height-derived width and scale 1; touch-first phones/tablets and document routes are excluded.
- `StagePageSurface`, `ViewportScenePortal`, `ViewportHudPortal`, `ViewportBackdropPortal`, and `ViewportModalPortal` exist as dedicated presentation/portal components. Their individual consumers require further audit before any consolidation.
- `client/src/lib/stage.ts` **still contains** `DESIGN_W=390`, `DESIGN_H=844`, `calculateMiniGamePage`, `fitPortraitReference`, and stage-coordinate compatibility helpers. Their presence is not evidence the root renderer still uses a reference stage. Do not delete these without tracing every remaining caller, including mini-games and admin editing.

## Risks and follow-up investigations

1. Enumerate imports/call sites of reference helpers and classify each as active mini-game, admin-authored coordinate system, dormant compatibility, or obsolete code. Replace only after runtime-equivalent tests.
2. Inspect portal target ownership and CSS containing blocks for modal, HUD, scene, quest spotlight and drag handlers; ensure desktop portrait offsets do not leak into window-relative coordinates.
3. Verify home backgrounds/pet sizes against world dimensions rather than visible camera crop; preserve saved positions and user scaling.
4. Verify map pan/drag and tutorial tap/drag behavior across representative desktop mouse, iPhone touch and tablet touch viewports.
5. Inspect pages that use CSS `vh`/`vw`, `--fh`, `--viewport-height`, or legacy stage logical variables and determine intended physical-vs-local units before modifying.

## Regression gate

- This PR adds source-contract tests to ensure the root cannot silently opt back into reference scaling and the desktop portrait branch remains native-pixel/viewport-owned.
- Existing geometry tests remain unchanged. CI checks code and unit tests, **not real-device playability**.
- No production layout, coordinates, UI or event behavior is changed by this audit PR.

## Status

| Area | Audited | Code corrected | Automated guard | Device verified |
| --- | --- | --- | --- | --- |
| Root viewport ownership | Yes | No change needed in this PR | Added | No |
| Desktop portrait eligibility | Yes | No change needed in this PR | Added | No |
| Legacy stage/mini-game callers | Partial | No | Existing tests only | No |
| Portals, tutorial interactions | Partial | No | Existing tests only | No |
| Home, world maps, admin placements | Pending | No | Existing tests only | No |

A merged PR must not be interpreted as completing any device-verification item.
