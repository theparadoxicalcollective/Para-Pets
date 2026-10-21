# Phase 2 — legacy reference stage versus active viewport

## Traced ownership

- `App.tsx` and `RootEntry.tsx` use `useStageViewportLayout`, which calls `readStageViewportLayout` in `stageViewport.ts`.
- The runtime controller passes `{ viewportSurface: true }` to `calculateStageLayout`. Root gameplay geometry is therefore device-viewport-owned at scale 1, not a 390 × 844 plane.
- On wide non-touch gameplay routes, `desktopPortraitGameplayLayout` uses viewport height to derive a centered portrait scene width. It does not apply phone reference scaling.
- `MiniGameFrame` uses `ViewportScenePortal`, and has no direct call to `calculateMiniGamePage`. Its old comment described a prior stage-owned tablet/desktop architecture; the comment is corrected here.
- `stage.ts` still exports `DESIGN_W`, `DESIGN_H`, `calculateMiniGamePage`, `shouldFitPortraitReference` and legacy stage-coordinate conversion. `test/stageLayout.test.ts` and `test/portraitReferenceStage.test.ts` explicitly test those opt-in legacy behaviors. Those tests alone are **not proof of runtime usage**.

## What this PR establishes

New executable geometry tests compare root viewport dimensions, touch-first bypass, desktop portrait positioning and document-route bypass. This is more than a source-string assertion, but it does not simulate DOM pointer events or render a browser.

## Deferred deletion gate

Do not remove reference helpers until all imports and runtime consumers (including admin and mini-games) are inventoried and checked for saved placement compatibility. In particular, the presence of legacy test expectations should not be mistaken for a requirement to reintroduce the old root stage.

## Verification status

- Root viewport calculation: executable regression coverage added.
- Desktop portrait and touch bypass: executable regression coverage added.
- Mini-game frame: outdated architecture description corrected; no runtime behavior changed.
- Legacy helper deletion: **not yet justified**; outstanding caller audit.
- Mouse/touch interactions and actual device gameplay: **not verified**.

This PR intentionally avoids changing production rendering, event handling, admin coordinates or stage sizing.
