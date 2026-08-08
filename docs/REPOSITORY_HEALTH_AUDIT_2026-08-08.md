# Para Pets repository health audit — 2026-08-08

**Baseline:** commit `60786b2`

**Scope:** all tracked files under `client/`, `server/`, `shared/`, `test/`, `script/`, and `scripts/`; root package, TypeScript, Vite, Railway, Tailwind, PostCSS, Drizzle, Replit, and CI configuration; startup migrations/backfills/seeds/asset synchronization; tracked production and staging assets; and all existing repository audit documents.

**Policy:** preserve gameplay, UI, assets, persistence, authentication, progression, economy, rewards, combat, and deployment behavior. Static non-reference is not proof that an asset is unused.

## Executive summary

The current repository remains functional but highly concentrated. The largest risks are not isolated unused imports: they are the 8,570-line route hub, the 3,491-line storage hub, the 3,389-line ordered startup program, large multi-mode React pages, browser-authoritative legacy combat, broad cache invalidation, and a 1.6 GiB checkout dominated by large raster assets. These are **not** safe candidates for a bulk cleanup.

Current positive controls include route-level lazy loading in `client/src/App.tsx`, focused transactional services for newer value-moving features, shared deterministic Elysian Clearing modules, an ordered startup contract with a database advisory lock, and 82 test files. The safest immediate production-code correction found was a real keyboard-listener cleanup defect in Lava Crawl; this audit accompanies a narrowly scoped fix and characterization test. No dependency, route, API, source module, or production asset was deleted.

## Method and limitations

- Enumerated all 1,574 tracked paths and read every source/configuration path by inventory, targeted source review, import/reference searches, route registration searches, current diffs since the earlier audit baseline, and repository-wide pattern scans.
- Measured physical line counts, explicit `any` sites, effects, timers, animation frames, listeners, polling, invalidations, logging, image markup, asset sizes, extensions, and duplicate-name groups.
- Compared the current tree with the three requested earlier audits. The current tree has changed substantially since their `c4d78a1` baseline, especially Pet Care and Elysian Clearing.
- Checked every declared package by literal package-name reference outside lockfiles and documentation. This is a candidate detector, not removal proof: TypeScript type packages, transitive adapters, Tailwind plugins, esbuild externals, and runtime-loaded packages can be legitimate without a literal application import.
- Compared literal server route prefixes against client/tests only as a triage aid. Dynamic URLs, admin/operational callers, webhooks, sitemap/robots consumers, and external clients mean this cannot prove a route dead.
- Did not connect to Railway or a production database. Database-provided media paths, stored base64 media, operational scripts, and external callers therefore remain owner-review items.

## Current inventory

| Area | Current observation |
|---|---:|
| Tracked checkout | approximately 1.6 GiB |
| Main asset catalog | 1,092 tracked paths under `attached_assets/` |
| Client source | 180 files |
| Server source | 68 files |
| Shared source | 8 files |
| Tests | 82 files before this audit's regression test |
| Express registrations | 409 (`150 GET`, `159 POST`, `49 PATCH`, `50 DELETE`, `1 PUT`) |
| React `useEffect` sites | 251 |
| Query invalidation sites | 407 |
| Polling declarations | 31 `refetchInterval` sites |
| Explicit `any` candidates | approximately 533 client and 834 server occurrences |
| JSX `<img>` elements | 704; only 2 explicit `loading` attributes and no explicit `decoding` attributes |
| Console calls | approximately 488 across client/server/shared TypeScript |

Counts are static indicators, not defects by themselves. Minified/condensed files can understate logical complexity, and image components may supply behavior not visible on every literal `<img>`.

## Prioritized findings

### P0 — authority and correctness boundaries

#### 1. Legacy PvP, raid, and world combat retain material browser authority

- **Classification:** SECURITY / SERVER AUTHORITY; DO NOT TOUCH WITHOUT OWNER REVIEW
- **Files:** `client/src/pages/PvpBattlePage.tsx`, `client/src/pages/RaidBattlePage.tsx`, `client/src/components/BattleArena.tsx`, `client/src/pages/WorldPage.tsx`, and the corresponding handlers in `server/routes.ts`.
- **What was found:** targeting, damage/status timing, battle sequencing, and outcome orchestration remain substantially client-side in the legacy modes. Elysian Clearing has newer server session/hit/reward validation, so the repository contains intentionally different authority models.
- **Why it matters:** a modified client can potentially claim outcomes or magnitudes that should be derived and authorized by the server. It also makes client/server formula drift more likely.
- **Expected benefit:** a later staged authority migration would improve cheat resistance, retry safety, and deterministic reward handling.
- **Risk level:** critical if changed wholesale; current behavior must first be characterized.
- **Verification:** traced mode pages to their mutation endpoints and reviewed damage/reward handlers. Do not merge the modes merely because concepts share names.
- **Next safe step:** document each request's trusted and untrusted fields, then add endpoint tests that reject impossible damage/result/reward claims. Migrate one mode and one value boundary at a time.

#### 2. Value-moving operations use several independent grant/debit/idempotency patterns

- **Classification:** CORRECTNESS RISK; REFACTOR LATER
- **Files:** `server/routes.ts`, `server/storage.ts`, `server/inventoryPurchase.ts`, `server/inventoryConsumption.ts`, `server/rewardClaim.ts`, `server/dailyQuestClaim.ts`, `server/badgePeriodicClaim.ts`, `server/fishCatchRewardClaim.ts`, `server/fishSale.ts`, `server/clearingCurrency.ts`, `server/clearingRewardChests.ts`, `server/marketplace/transactions.ts`, `server/gifts/transactions.ts`, `server/payments/fulfillStripePurchase.ts`.
- **What was found:** direct user-balance updates, stack update-or-insert patterns, focused transactions, claim tables, Stripe idempotency, and reward bundles all coexist. Some duplication is required because inventory categories and reward modes differ, but fundamental ownership, nonnegative quantity, atomic debit/grant, and retry rules are not represented by one audited contract.
- **Why it matters:** future callers can bypass a focused coordinator, apply a different lock order, or grant twice after a retry.
- **Expected benefit:** an explicit value-boundary catalog and shared transaction primitives would reduce duplication bugs without changing balance.
- **Risk level:** high. Blind consolidation could change economy semantics.
- **Verification:** searched coin/essence/XP/inventory quantity mutations and reviewed focused transaction tests.
- **Next safe step:** add a ledger-style documentation matrix (operation, lock, idempotency key, tables, cache keys, tests) before extracting any implementation.

#### 3. Progression and combat calculations remain duplicated but are not all equivalent

- **Classification:** REFACTOR LATER; CORRECTNESS RISK
- **Files:** `client/src/components/BattleArena.tsx`, `client/src/pages/PvpBattlePage.tsx`, `client/src/pages/RaidBattlePage.tsx`, `client/src/pages/WorldPage.tsx`, `client/src/lib/elysianClearingCombatMath.ts`, `shared/clearingCombat.ts`, `server/elysianClearingCombat.ts`, and progression/reward handlers in `server/routes.ts`.
- **What was found:** pet/enemy damage, crits, equipment effects, XP/level updates, and rewards are calculated in multiple mode-specific implementations. Clearing has shared fundamentals, while cave/PvP/raid retain separate equations and status rules.
- **Why it matters:** identical-looking rules can drift; conversely, blindly sharing them could erase intended mode balance.
- **Expected benefit:** a formula catalog that labels **shared fundamental rules** versus **mode-specific rules** will make later extractions safe.
- **Risk level:** high.
- **Verification:** searched damage, critical, XP, level, reward, equipment power, quantity, debit, and ownership terms across client/server/shared.
- **Next safe step:** characterization tests with fixed inputs/outputs for every mode before moving deterministic fundamentals into shared TypeScript.

### P1 — performance and lifecycle

#### 4. Elysian Clearing combines a continuous RAF simulation with frequent network/render updates

- **Classification:** PERFORMANCE; REFACTOR LATER
- **Files:** `client/src/components/ElysianClearingCombat.tsx`, `client/src/pages/ElysianBayouClearingPage.tsx`, Clearing drop/equipment hooks, `server/elysianClearingCombat.ts`.
- **What was found:** the client animation loop clones live enemy objects into React state up to every 50 ms and sends position/enemy arrays every 500 ms while a session is active. Drop hooks also poll independently at 10 and 15 seconds.
- **Why it matters:** approximately 20 React updates and 2 position requests per second can be expensive on mobile, particularly with multiple animated enemies and decoded sprites.
- **Expected benefit:** profiling-informed separation of simulation refs from lower-frequency view snapshots, delta/threshold position sync, and coordinated polling could reduce CPU, allocation, and radio use.
- **Risk level:** medium/high because movement, hit validation, and feel are coupled.
- **Verification:** reviewed RAF, state-paint throttle, position interval, visibility handling, and query hooks.
- **Next safe step:** add performance counters and server tolerances; do not alter cadence without mobile characterization tests and play testing.

#### 5. Broad cache invalidation can produce avoidable refetch bursts

- **Classification:** PERFORMANCE; LIKELY SAFE BUT NEEDS VERIFICATION
- **Files:** `client/src/App.tsx`, `client/src/pages/FishingPage.tsx`, `client/src/pages/WorldPage.tsx`, `client/src/pages/CoinShopPage.tsx`, `client/src/features/pet-care/FeedingOverlay.tsx`, `client/src/components/ClearingRewardChests.tsx`, `client/src/components/TopBar.tsx`, `client/src/lib/tabSync.ts`.
- **What was found:** 407 invalidation calls converge frequently on `/api/auth/me`, inventory, quests, and feature lists. Some mutation success paths update cache data and immediately invalidate the same key. Global auth polling and cross-tab invalidation can overlap feature-specific invalidation.
- **Why it matters:** one action may trigger several wide payload refetches and rerenders, increasing mobile bandwidth and battery use.
- **Expected benefit:** canonical cache-update helpers and mutation-response patching could reduce network duplication.
- **Risk level:** medium. Current broad invalidation may intentionally recover from partial responses.
- **Verification:** enumerated invalidations/polling and inspected high-density pages.
- **Next safe step:** instrument request counts by key and action. Optimize one mutation only when its response is proven complete.

#### 6. Large eager raster loading remains a mobile memory and transfer risk

- **Classification:** PERFORMANCE; DO NOT TOUCH WITHOUT OWNER REVIEW
- **Files:** `attached_assets/`, `client/src/assets/`, `client/public/`, and image-heavy pages/components including `WorldPage.tsx`, `PetWorldPage.tsx`, `HomePage.tsx`, `FishingPage.tsx`, `PetAnimator.tsx`, inventory/marketplace/admin pages.
- **What was found:** 992 PNGs and 135 JPEG/JPG/WebP assets are tracked across production/staging locations. Individual PNGs reach 20.3 MB. There are 704 literal `<img>` elements but only two explicit loading attributes and no explicit decoding attributes. Some components mount hidden overlays or many item images, so route splitting alone does not prevent decoding pressure.
- **Why it matters:** compressed file size understates decoded RGBA memory; one high-resolution image can occupy tens of megabytes on mobile.
- **Expected benefit:** measured lazy mounting, thumbnails/srcsets, async decoding, and owner-approved optimized derivatives would reduce initial transfer and memory peaks.
- **Risk level:** high for bulk changes: dimensions/transparency and DB/runtime URLs are gameplay presentation contracts.
- **Verification:** measured tracked sizes/extensions and reviewed markup. No asset is declared unused from static search alone.
- **Next safe step:** capture real route waterfalls and decoded dimensions on target phones; optimize one named, visibly verified asset per PR.

#### 7. Exact duplicate assets and multi-location copies remain, but deletion is not statically safe

- **Classification:** DO NOT TOUCH WITHOUT OWNER REVIEW; LIKELY SAFE BUT NEEDS VERIFICATION
- **Files:** duplicate groups within `attached_assets/`, copies under `client/src/assets/` and `client/public/`, plus startup asset synchronization in `server/startup/backfills/runNonCriticalStartup.ts`.
- **What was found:** current large examples include two 20,324,973-byte `AAC47494...` files, two 17,312,361-byte swamp-critters files, duplicate 8,652,611-byte Photoroom files, and production-name copies such as `icon_world_chat_new.png` in both source catalogs.
- **Why it matters:** copies increase checkout size and obscure provenance, but one path may be bundled while another is used by startup synchronization or stored database URLs.
- **Expected benefit:** a provenance manifest and canonical derivative policy would prevent recurrence.
- **Risk level:** high without production DB/startup verification.
- **Verification:** current size/name/hash-oriented inventory plus review of asset sync and earlier asset audit.
- **Next safe step:** record each duplicate group's import, startup, DB, and design-source role. Delete only owner-approved staging copies in separate PRs.

#### 8. One confirmed keyboard-listener leak existed in Lava Crawl

- **Classification:** SAFE CLEANUP; PERFORMANCE
- **Files:** `client/src/pages/LavaCrawlPage.tsx`, `test/lavaCrawlLifecycle.test.ts`.
- **What was found:** the effect registered anonymous arrow functions and attempted to remove newly created arrow functions. DOM listener identity therefore never matched, so remounting could accumulate keyboard handlers.
- **Why it is safe:** named wrappers preserve the same key behavior and effect dependencies while allowing exact cleanup.
- **Expected benefit:** prevents duplicate controls, retained component closures, and remount-related memory growth.
- **Risk level:** low.
- **Verification:** added a regression test asserting matching callback identities. Type checking, the new focused test, and the production build pass; the complete suite still exposes the unrelated pre-existing brittle assertion recorded below.

#### 9. Other timers/listeners/RAF loops require profiling, not bulk edits

- **Classification:** LIKELY SAFE BUT NEEDS VERIFICATION; PERFORMANCE
- **Files:** `client/src/features/pet-care/FeedingOverlay.tsx`, `client/src/petCarePolish.ts`, `client/src/petCarePolishBootstrap.ts`, `client/src/pages/FishingPage.tsx`, `PetWorldPage.tsx`, `PvpBattlePage.tsx`, `MoltenBlocksPage.tsx`, `client/src/components/BattleArena.tsx`, `PetAnimatorCanvas.tsx`, `server/routes.ts`.
- **What was found:** 28 intervals, 34 RAF call sites, 95 listener registrations, and 156 timeouts exist. Most inspected React effects do return cleanup, and application-lifetime listeners in the entry/bootstrap code are intentional. The server background intervals are process-lifetime jobs without a shared scheduler/overlap policy; some have guards, others do not.
- **Why it matters:** stale closures, remount duplication, hidden-tab work, or overlapping async ticks can cause lag and repeated DB work.
- **Expected benefit:** a lifecycle registry/test pattern and server job ownership would improve reliability.
- **Risk level:** medium. Timer cadence affects gameplay and operational behavior.
- **Verification:** enumerated all sites and manually inspected high-frequency loops and cleanup patterns.
- **Next safe step:** add targeted lifecycle tests when touching each feature; move process jobs only after preserving startup/Railway semantics.

### P1 — maintainability and startup

#### 10. Route and storage hubs are still the primary maintainability bottlenecks

- **Classification:** REFACTOR LATER
- **Files:** `server/routes.ts` (8,570 lines), `server/storage.ts` (3,491 lines), extracted `server/routes/*.ts`, and focused domain services.
- **What was found:** `routes.ts` still mixes API registration, constants, validation, economic transactions, combat/raid/PvP logic, chat/SSE, and process background jobs. `storage.ts` spans accounts, pets, inventory, worlds, social, marketplace, raids, and admin data access.
- **Why it matters:** unrelated changes share high-conflict files and hidden local contracts. Route ordering/middleware and transaction behavior make naive splitting risky.
- **Expected benefit:** incremental domain registrars/services reduce conflict and allow focused tests.
- **Risk level:** high for broad extraction, low when one already-tested registrar is moved without API changes.
- **Verification:** current line counts, route inventory, imports, and existing extraction patterns.
- **Next safe step:** continue one domain at a time (`pvp/`, `raid/`, `worlds/`, `economy/`) with route-order and response characterization tests.

#### 11. The ordered startup program is large and slows/complicates operations

- **Classification:** REFACTOR LATER; PERFORMANCE; DO NOT TOUCH WITHOUT OWNER REVIEW
- **Files:** `server/startup/runStartup.ts`, `server/startup/migrations/runEssentialBoot.ts`, `server/startup/backfills/runNonCriticalStartup.ts` (3,389 lines), `server/startup/advisoryLock.ts`, `docs/STARTUP_INITIALIZATION_MAP.md`, `railway.toml`.
- **What was found:** essential DDL is awaited before routes/listening; a very large serial, interleaved noncritical migration/backfill/seed/asset-sync pass begins after listen under a nonblocking advisory lock. This is safer than every replica running it, but still couples deployment with historical data work and can generate sustained post-start DB load.
- **Why it matters:** startup history is difficult to reason about; failed/skipped lock owners and long backfills complicate Railway rollouts.
- **Expected benefit:** a migration ledger and independently observable jobs would shorten and clarify startup.
- **Risk level:** critical because ordering and asset overwrite precedence are documented behavior.
- **Verification:** read the orchestrator, startup map, Railway health/start commands, essential boot, advisory lock, and full noncritical boundary.
- **Next safe step:** add duration/result logging per existing phase and a read-only status endpoint before moving any statement.

#### 12. Large React files combine independent responsibilities and expensive render surfaces

- **Classification:** REFACTOR LATER; PERFORMANCE
- **Files:** `WorldPage.tsx` (5,555 lines), `AdminPage.tsx` (5,043), `PetWorldPage.tsx` (4,095), `BattleArena.tsx` (3,535), `FishingPage.tsx` (2,562), `HomePage.tsx` (2,406), `PvpArenaPage.tsx` (2,297), `PvpBattlePage.tsx` (2,284), `PetAnimator.tsx` (2,287), `FeedingOverlay.tsx` (1,948).
- **What was found:** these files combine data fetching, mutations, layout, modal state, animation/input loops, gameplay rules, asset mapping, and admin editing. Inline objects/callbacks and large parent state surfaces make rerender causes hard to isolate.
- **Why it matters:** any state update can revisit a large element tree; behavior extraction without tests can subtly alter overlays, z-order, timing, or gestures.
- **Expected benefit:** profiling-guided memo boundaries and incremental domain components improve reviewability and mobile CPU use.
- **Risk level:** medium/high.
- **Verification:** current line counts and responsibility review; route lazy loading is already present and should be retained.
- **Next safe step:** React Profiler traces on named hot routes, then extract pure presentation boundaries with existing regression coverage.

#### 13. Shared schema remains a broad coupling point

- **Classification:** REFACTOR LATER; DO NOT TOUCH WITHOUT OWNER REVIEW
- **Files:** `shared/schema.ts` (1,168 lines), `server/storage.ts`, Drizzle configuration, startup DDL.
- **What was found:** table declarations, relations, insert schemas, enums/constants, and exported types for most domains are centralized while historical startup SQL also mutates schema.
- **Why it matters:** schema edits have broad import and deployment impact, and startup defaults/history can differ from a fresh schema representation.
- **Expected benefit:** domain re-export modules could improve navigation without altering table definitions.
- **Risk level:** high; no schema/data change is approved here.
- **Verification:** schema exports/import graph and startup DDL review.
- **Next safe step:** first create a migration ledger and schema parity check; later split only through a compatibility barrel.

### P2 — hygiene, typing, observability, resilience

#### 14. Many declared dependencies appear absent from current application/build imports

- **Classification:** LIKELY SAFE BUT NEEDS VERIFICATION
- **Files:** `package.json`, `package-lock.json`, `client/src/components/ui/*`, `script/build.ts`, Tailwind/Vite configuration.
- **What was found:** candidate runtime packages with no literal current source/build/config reference include `@hookform/resolvers`, many unrepresented Radix packages (accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dropdown-menu, hover-card, menubar, navigation-menu, popover, progress, radio-group, scroll-area, slider, switch, tabs, toggle, toggle-group), `cmdk`, `embla-carousel-react`, `framer-motion`, `input-otp`, `next-themes`, `picomatch`, `react-day-picker`, `react-hook-form`, `react-icons`, `react-resizable-panels`, `rollup`, `tw-animate-css`, and `vaul`.
- **Why it matters:** unused direct dependencies increase install surface, audit noise, and lockfile churn.
- **Expected benefit:** smaller dependency/lock manifests and fewer supply-chain inputs.
- **Risk level:** low/medium per package, but not zero. `rollup`, type packages, optional `bufferutil`, plugins, and packages named in the server build allowlist need special handling.
- **Verification:** literal package-name scan, current component inventory, build script, lockfile, configuration, and successful production bundle. No package was removed in this pass.
- **Next safe step:** one dependency family per PR; prove absence with import graph plus check/test/build and verify development startup for Vite/plugin-related packages.

#### 15. No source module, export, route, API, or production asset was proven genuinely unused

- **Classification:** SAFE CLEANUP (result: none); DO NOT TOUCH WITHOUT OWNER REVIEW
- **Files:** repository-wide, especially `server/routes.ts`, `client/src/App.tsx`, `server/startup/backfills/runNonCriticalStartup.ts`, `survey.cjs`, and asset catalogs.
- **What was found:** TypeScript with `noUnusedLocals`/`noUnusedParameters` produced no diagnostics, and normal type checking is clean. Heuristic route/reference searches produced candidates, but dynamic URLs, admin tools, external Stripe/webhook/SEO callers, operational scripts, database URLs, and startup synchronization prevent a defensible deletion claim.
- **Why it matters:** deleting an apparently unreferenced live-game path is higher risk than retaining clutter.
- **Expected benefit:** none from speculative deletion.
- **Risk level:** high if ignored.
- **Verification:** TypeScript diagnostics, route and import searches, configuration/startup review, and comparison with the earlier asset/hygiene audits.
- **Next safe step:** add usage telemetry/deprecation markers and owner sign-off before removal. Preserve `survey.cjs` until its operational ownership is decided.

#### 16. `any` is concentrated at API, database, and player-data boundaries

- **Classification:** CORRECTNESS RISK; REFACTOR LATER
- **Files:** `server/routes.ts`, `server/storage.ts`, client route pages/components, `client/src/App.tsx`; shared modules currently contain no matching explicit-`any` candidates.
- **What was found:** approximately 834 server and 533 client explicit-`any` candidates. Common cases include `req.user`, raw SQL rows, large API payloads, error values, pets/items, and query-cache updates.
- **Why it matters:** fields can drift silently across client/server, and partial cache updates can discard or mis-shape player state.
- **Expected benefit:** shared response schemas/types at high-value boundaries prevent bugs without changing runtime behavior.
- **Risk level:** medium; mass type edits are noisy and can hide runtime assumptions.
- **Verification:** repository-wide type-pattern count and inspection of repeated boundary shapes.
- **Next safe step:** type one endpoint/request/response family per domain using Zod/shared types and characterization tests.

#### 17. Production logging and diagnostics are broad and inconsistent

- **Classification:** PERFORMANCE; LIKELY SAFE BUT NEEDS VERIFICATION
- **Files:** `server/routes.ts`, `server/startup/backfills/runNonCriticalStartup.ts`, `server/index.ts`, `client/src/main.tsx`, `client/src/lib/stabilityDiagnostics.ts`, animation/game pages.
- **What was found:** approximately 488 console calls exist. Some hot-loop warnings are development-gated, but startup seeds/backfills and feature handlers emit many unstructured lines. Client global error storage and multiple lifecycle diagnostics overlap in purpose.
- **Why it matters:** high-volume Railway logs cost I/O and make actionable failures difficult to correlate; client storage may retain noisy error summaries.
- **Expected benefit:** leveled structured logging with operation IDs and phase durations improves diagnosis while reducing noise.
- **Risk level:** medium because logs may be the only operational evidence today.
- **Verification:** enumerated console sites and reviewed client global handlers and startup/server hot paths.
- **Next safe step:** define log levels/redaction/rate policy and change one noisy domain only after confirming owner needs.

#### 18. Error handling can still fail inconsistently across large pages and direct fetch callers

- **Classification:** CORRECTNESS RISK; REFACTOR LATER
- **Files:** `client/src/App.tsx`, `client/src/components/ErrorBoundary.tsx`, `client/src/lib/queryClient.ts`, direct-fetch gameplay pages/hooks, server handlers in `server/routes.ts`.
- **What was found:** the app has global and router error boundaries, but many direct fetch/JSON paths use local assumptions and some catch paths intentionally swallow errors. Server handlers frequently return `err.message` from `any`, while async process jobs log and continue.
- **Why it matters:** malformed/non-JSON responses can escape feature-level handling; swallowed failures can leave stale UI; raw internal messages can be inconsistent or overly revealing.
- **Expected benefit:** a typed API error decoder and domain error states would make failures graceful and observable.
- **Risk level:** medium/high because changing retry/fallback semantics can alter behavior.
- **Verification:** reviewed global boundaries/query client and searched direct fetch/catch/error response patterns.
- **Next safe step:** adopt one shared response decoder in a low-risk admin/read-only flow before gameplay mutations.

#### 19. Development/runtime tooling is mostly gated, with a few ownership questions

- **Classification:** LIKELY SAFE BUT NEEDS VERIFICATION
- **Files:** `vite.config.ts`, `script/build.ts`, `.replit`, Replit dev plugins, `client/src/lib/stabilityDiagnostics.ts`, `survey.cjs`, `scripts/*`.
- **What was found:** Cartographer/dev-banner loading is development/Replit-gated; the runtime error overlay plugin is included in the Vite plugin list for all builds; server build allowlist still names historical packages not declared in `package.json`; operational scripts are outside npm scripts and lack one common ownership/read-only policy.
- **Why it matters:** stale build configuration confuses dependency audits, and production inclusion of development-oriented tooling should be verified from emitted chunks rather than assumed.
- **Expected benefit:** explicit environment gating and script documentation reduce production surface and maintenance ambiguity.
- **Risk level:** low/medium, except production database tooling requires owner review.
- **Verification:** read Vite/build/Replit/Railway/package/scripts and inspected production build output.
- **Next safe step:** inspect the runtime overlay's emitted production footprint, then gate/remove only in a dedicated deployment-verified PR.

#### 20. Potential database repetition needs runtime evidence before query rewrites

- **Classification:** PERFORMANCE; LIKELY SAFE BUT NEEDS VERIFICATION
- **Files:** `server/routes.ts`, `server/storage.ts`, marketplace/social/admin list/detail handlers, leaderboard watcher jobs, startup backfills.
- **What was found:** broad route/storage loops contain per-entry lookups and several background leaderboard queries; large admin/detail responses join data through application code in places. Static review identifies N+1 candidates but cannot determine production row counts, cache hit rates, or query plans.
- **Why it matters:** per-row queries and repeated polling scale poorly and can compete with gameplay requests.
- **Expected benefit:** query-count instrumentation and `EXPLAIN (ANALYZE, BUFFERS)` on sanitized staging data can identify real hotspots.
- **Risk level:** medium/high; replacing queries can alter ordering, null handling, locks, or transaction semantics.
- **Verification:** scanned database calls inside loops and repeated endpoint workflows; no production DB was queried.
- **Next safe step:** add request-scoped query counts/slow-query logging, then optimize one measured endpoint with response-equivalence tests.

## Duplicate/obsolete configuration assessment

- World/location/item presentation exists across TypeScript constants, database rows, imported assets, and ordered startup synchronization. This is duplication by deployment design, not safe dead configuration.
- The server build allowlist contains undeclared historical package names. Because the list only controls esbuild externalization, removing entries should be a separate build-tool cleanup after bundle comparison.
- `script/` and `scripts/` are both present but serve different purposes: the former is the production build entry; the latter contains operational/development utilities. Rename/move only with Railway/npm/CI verification.
- Older and newer combat engines are obsolete-looking but still routed/player-facing. No implementation was classified as safely obsolete.

## Recommended small-PR sequence

1. **Lifecycle correctness:** retain the Lava Crawl listener fix; add the same identity/unmount test pattern only when another proven leak is found.
2. **Observability:** add request/query counts and phase durations without changing outcomes or cadence.
3. **Dependency families:** verify and remove one unused UI package family per PR, including dev startup, check, tests, and build.
4. **Cache traffic:** measure one player action; replace invalidation with response-driven cache updates only when response completeness is tested.
5. **Asset pilot:** choose one owner-approved oversized production image, preserve appearance/dimensions/path compatibility, and capture before/after mobile screenshots and transfer/decode measurements.
6. **Characterization:** freeze PvP, raid, cave, and Clearing formulas/outcomes independently.
7. **Authority migrations:** reject impossible client claims before moving any simulation; keep animation/prediction client-side.
8. **Architecture:** extract one tested domain registrar/service at a time while preserving exported APIs, route order, middleware, transactions, and Railway startup.

## Explicitly deferred

- No production artwork, duplicate asset, staging upload, database-backed path, or design source was removed.
- No dependency was removed solely from a textual scan.
- No route/API was removed solely because no current client literal matched it.
- No schema, startup SQL, backfill, seed, asset synchronization, authentication, payment, economy, reward, progression, or combat behavior was changed.
- No giant file was reformatted or split.
- No formula was unified across game modes.

## Baseline test issue discovered (not changed here)

The complete `npm test` run executes 445 tests: 444 pass and one existing static-source assertion fails in `test/itemTypeFilters.test.ts`. The test expects the minified text `type==="all"||(item.type||"item")===type`, while the current implementation in `client/src/components/clearing/ClearingAdminSections.tsx` contains the behaviorally equivalent formatted expression `(type === "all" || (item.type || "item") === type)`. This audit and the Lava Crawl change do not touch either file. Per the repository safety policy, this unrelated brittle test was not silently rewritten; it should be corrected in a focused test-maintenance PR.

This audit should be treated as a point-in-time prioritization document. Before each follow-up PR, re-run the relevant current-tree verification rather than relying on this report as permanent proof.
