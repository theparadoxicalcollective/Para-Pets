# Test contract modernization inventory (after PR #803)

## Purpose

The suite currently contains 422 `test/*.test.ts` files (as counted at the start of this change). Do **not** delete passing tests solely because their titles mention iPhone 12, 390×844, or "stage": some still document active compatibility branches and persisted world coordinates. Classify the *asserted behavior* first.

## First consolidation completed

The exact Active Pet star and nameplate positioning formulas had been repeated across:
- `test/activePetChromeViewportAnchor.test.ts` — **canonical owner** of scene-relative star/nameplate formulas and shared admin offset;
- `test/activePetMainPageBackground.test.ts` — retain background, anchor, pet placement and layering checks, remove repeated pixel formulas;
- `test/activePetWideDevicePresentation.test.ts` — retain wide-screen backdrop, viewport measurement, grounding and scene ownership checks, remove repeated pixel formulas;
- `test/homePetGrounding.test.ts` — retain responsive pet baseline and tutorial flow checks, remove repeated star-position formula.

This removes duplicate assertions without weakening the single focused positioning test. A future PR should replace its source-string formulas with executable geometry or rendered UI assertions when suitable harness support exists.

## Migration-era compatibility tests: keep until matching runtime changes

| Tests | Why they cannot simply be deleted | Removal gate |
| --- | --- | --- |
| `portraitReferenceStage.test.ts` | Checks legacy `shouldFitPortraitReference` and scaled stage transforms still used by fallback routes | Retire portrait expectations with stage fitting removal; retain keyboard/orientation behavior in viewport tests |
| `fullDeviceStageReferencePlane.test.ts` | Requires `App.tsx` and `RootEntry.tsx` reference planes that still exist | Replace with native root-owner tests in the PR that removes those planes |
| `stageViewportOwnership.test.ts` | Mixes valuable lifecycle observation checks with obsolete geometry snapshots and `--stage-*` CSS contracts | Split lifecycle checks from legacy geometry when root layout changes |
| `stageLayout.test.ts` | Mixes viewport measurement, input coordinate transforms and legacy mini-game 390×844 helpers | Preserve browser keyboard and pointer tests; retire mini-game reference scaling only after all callers are gone |
| `legacyQuestStageAlignment.test.ts` | Protects current quest spotlight and drag-preview surface math, including stage fallback | Replace stage-owned assumptions with native guide geometry during quest overlay migration |
| `rootStageFinalDependencyInventory.test.ts` | Deliberately records remaining legacy runtime owners | Rewrite as *absence* regression once legacy owners are removed |

## Permanent behavioral coverage to protect

- Native viewport geometry on phones, tablets, and desktop (route-specific, not `DESIGN_W` snapshots).
- Admin oval placements and existing saved data; authored world/map coordinate transforms.
- Active Pet scene-relative chrome, adornments, menus and overlays.
- Pet House object sizing/dragging; world camera and pan boundaries.
- Quest/tutorial spotlight targeting, drag previews, modal stacking, pointer hit-testing.
- Authentication and keyboard focus; payments, inventories, and gameplay state.

## Rules for further cleanup

1. Prefer tests that call real layout/coordinate helpers over matching source text; use DOM-level checks for interactive behavior when the test harness supports them.
2. One canonical test owns a precise styling or coordinate formula. Other feature tests assert distinct contracts.
3. Do not replace a failing test with a weaker assertion unless a separate test still covers the behavior.
4. Retire old-stage expectations **in the same PR** that removes their runtime dependencies; do not delete ahead of migration.
5. Do not update tests to mask genuine runtime regressions. Type checking and CI are necessary but real-device QA is still required.

## Next test-cleanup passes

- With the entry/root-shell PR: replace `RootEntry` reference-plane assertions.
- With App fallback removal: replace `App` stage-owned CSS and portal snapshots.
- With helper retirement: remove `DESIGN_W/H`, `calculateMiniGameScale`, and stage-scale assertions only when no runtime callers remain.
- After runtime migration: add an anti-regression check against new 390×844 viewport restrictions, explicitly excluding legitimate artwork and saved-coordinate data.
