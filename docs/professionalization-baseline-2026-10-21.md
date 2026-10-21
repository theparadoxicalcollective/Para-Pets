# Professionalization baseline — 2026-10-21

**Scope:** documentation-only delta audit of the current repository, existing architecture/QA documents, CI configuration and recent PR history. **No runtime, database, gameplay, admin, or deployment changes.**

## Why this is a delta, not another general audit

Existing sources already cover substantial ground:
- [REPOSITORY_ARCHITECTURE_AUDIT.md](REPOSITORY_ARCHITECTURE_AUDIT.md) (2026-07-31): runtime boundaries, concentrated modules, authority and transaction risks.
- [CODEBASE_MAP.md](CODEBASE_MAP.md): useful navigation, **but its statements that the iPhone 390×844 stage is canonical are historical and must not be used as current implementation guidance**.
- [cross-device-viewport-audit-phase1.md](cross-device-viewport-audit-phase1.md) and [legacy-reference-runtime-separation-phase2.md](legacy-reference-runtime-separation-phase2.md): current root/native viewport migration status and remaining callers.
- [test-contract-modernization-inventory.md](test-contract-modernization-inventory.md): behavioral-versus-source-contract test modernization.
- [client-performance-audit.md](client-performance-audit.md), [REPOSITORY_ASSET_AUDIT.md](REPOSITORY_ASSET_AUDIT.md), [PAYMENT_SYSTEM_AUDIT.md](PAYMENT_SYSTEM_AUDIT.md), [STARTUP_INITIALIZATION_MAP.md](STARTUP_INITIALIZATION_MAP.md): specialized prior reviews.

This document tracks **remaining verification gates and owners**, rather than treating earlier audits as uncompleted or prescribing broad rewrites.

## Current entry points and responsibilities (verified from existing map / package / recent PRs)

| Boundary | Owner / entry point | Preserve and verify |
| --- | --- | --- |
| Root shell, navigation, portals | `client/src/App.tsx`, `client/src/RootEntry.tsx`, `client/src/lib/stageViewport.ts` | Native viewport ownership, non-touch desktop portrait layout, touch-first behavior, auth/document routes |
| Legacy layout helpers | `client/src/lib/stage.ts` | `DESIGN_W/H`, mini-game fitting and compatibility consumers require caller-by-caller inventory before deletion |
| Player scene, HUD, modal/backdrop portals | `StagePageSurface`, `ViewportScenePortal`, `ViewportHudPortal`, `ViewportBackdropPortal`, `ViewportModalPortal` | Coordinate conversion and portal positioning; avoid duplicate viewport authorities |
| Home / pet artwork | Home owner/visitor scenes and `PetAnimator` | Admin-authored placement, visible bounds, evolution, adornments and mini pets, scene-height scaling |
| Tutorials / NPC tour | `BeginJourneyOverlay`, `QuestGuideSpotlight`, `NpcQuestDiscoveryGuide` | Portal-local target/spotlight/drag coordinates and actual tap/mouse completion |
| API and persistence | `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, `server/startup/` | Authorization, transaction boundaries, migration ownership and live-data safety |
| Operational tools | Admin panels and corresponding server routes | Existing content creation/edit/save/reload for pets, parts, NPCs, cards, home bundles, raids and rewards |
| Delivery | `.github/workflows/ci.yml`, `script/build.ts`, `railway.toml` | CI versus device QA, production build, startup and deployment safety |

## Existing safeguards: do not rebuild them

`.github/workflows/ci.yml` already runs on PRs and main pushes with Node 20, `npm ci`, `npm run check`, `npm run check:tests`, `npm test`, and `npm run build`; purchase tests use a separate PostgreSQL service. The `test/` directory already contains extensive coverage for account flows, transactions, admin features, stage/viewport geometry, pet rendering, quests and world systems. **Passing these does not establish browser interaction, performance, or physical-device correctness.** Do not add a parallel CI pipeline or duplicate existing tests merely to increase counts.

## Prioritized next PR candidates (confirm against main immediately before implementation)

1. **Behavioral smoke-test pilot** (highest value): investigate existing test harness; add a small, isolated browser-interaction path for a critical player journey, without production credentials or modifying live data. Prefer an existing framework if available; otherwise justify the smallest dependency addition. Record which tests are simulated versus physical-device verified.
2. **Legacy viewport consumer inventory and targeted retirement**: continue PRs #906/#907, enumerate actual imports/call sites before removing `stage.ts` helpers. Protect world/admin authored positions, keyboard and orientation behavior, mini-games and portals.
3. **Admin content lifecycle characterization**: protect proven create/edit/save/reload/read behavior with isolated tests, including failed image processing. No speculative admin rewrite; no production writes.
4. **Measured client performance baseline**: collect representative route load, image decode, animation/render and memory observations before optimizing. Recent Bag pet PRs #896/#897 show why appearance and memory must be considered together.
5. **Value-moving transaction regression matrix**: use existing payment, gift, fish, marketplace, inventory and claim tests; identify missing retry/idempotency cases, avoiding changes to economy rules without evidence.
6. **Release/rollback and recovery verification**: confirm operational procedures and restore rehearsals in an isolated database; never treat an untested backup as proven recovery.

## Known risks, not confirmed defects

- Older `CODEBASE_MAP.md` guidance conflicts with the current native viewport direction; documentation drift can lead to AI-assisted regressions.
- The architecture audit identifies broad integration hubs (`server/routes.ts`, `server/storage.ts`, `shared/schema.ts`) and mixed client/server authority in some combat paths. Their size or architecture **alone** is not a reason to refactor.
- The viewport audit still records legacy compatibility consumers. Presence of a `390×844` constant does **not** prove the root still uses a reference stage.
- Source-string and pure geometry tests may miss drag, click, portal and rendering defects; device QA remains explicitly unverified unless performed.
- Admin creation success reported by the owner is valuable operational evidence, but this documentation pass did not execute an end-to-end admin session.

## Stricter development gate for every subsequent PR

1. Trace feature from entry point through state, rendering, event handling, API and persistence before editing.
2. Compare a known working implementation; reuse existing services and contracts.
3. Choose the smallest complete correction; avoid new stage systems, compatibility wrappers, duplicate pipelines or cosmetic mass refactors.
4. Run relevant existing tests plus type checks/build, add **behavioral** regression tests when feasible, and explicitly distinguish automated coverage from browser/device verification.
5. Review related regressions and preserve existing admin-authored placements, user content and production state.
6. Record status as **investigated / code changed / CI passing / browser verified / device verified** separately. Merge is not proof of resolution.
7. Do not remove historical compatibility tests or code until runtime callers are retired; remove corresponding obsolete contracts in the same PR.
8. Follow `replit.md` Railway safeguards: Railway is production source of truth, no forced schema pushes, no destructive production SQL without explicit approval, no automatic database mutation on build/deploy, and fresh backups before database-affecting work.

## Verification performed for this documentation PR

- Read current `.github/workflows/ci.yml`, `package.json`, `replit.md` safety rules, prior architecture/viewport/test inventory documents and recent PR descriptions (#888–#907).
- Reviewed the existing `test/` directory inventory; did not execute its tests in this documentation-only connector pass.
- No live database access, deployment, runtime code modifications, performance measurements, browser QA or physical-device testing performed.

**Exit condition for this PR:** one accurate, non-duplicative baseline and an evidence-driven next step; no claim of newly fixed gameplay.
