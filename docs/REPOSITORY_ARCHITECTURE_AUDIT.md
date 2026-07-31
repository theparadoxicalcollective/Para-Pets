# Para Pets Repository Architecture Audit

**Audit date:** 2026-07-31  
**Scope:** tracked application code, tests, documentation, and assets on commit `c4d78a1`  
**Change policy:** analysis and recommendations only; no runtime code, schema, gameplay, UI, or asset changes are included.

## Executive summary

Para Pets is a TypeScript monorepo with a React/Vite client, an Express server, PostgreSQL through Drizzle, and a large file-backed art catalog. The application has good foundations: shared schemas, server-side authentication, TanStack Query, server-authoritative transaction coordinators for several value-moving operations, lazy-loaded pages, and a growing test suite. The main architectural constraint is **concentration**. `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, and several page components act as broad integration hubs. Game simulation is also inconsistent: Elysian Clearing validates combat on the server, while legacy cave, PvP, and raid flows retain substantially more browser authority.

The first work after this audit should not be a broad refactor. It should be a sequence of safety projects: document and test every reward boundary; make raid/PvP outcome authority explicit; establish a migration ledger rather than accumulating startup DDL; inventory asset provenance and duplicates; and add observability around combat/network loops. Only then should the large files be split behind characterization tests.

### Audit method and limits

- Static review of all tracked source paths, package scripts, route registrations, schema declarations, tests, import relationships, timers/animation loops, and asset sizes.
- Line counts are physical lines as reported by `wc -l`; generated dependencies (`node_modules`) and Git internals are excluded.
- Asset storage numbers describe the working tree, not transfer size or production bundle size. Database-backed/base64 media cannot be completely sized statically.
- “Risk” means an architectural failure mode to investigate, not a confirmed defect. Recommendations intentionally avoid specifying gameplay balance changes.

## 1. Folder structure

```text
Para-Pets/
├── .agents/                  # Agent memory and repository-maintenance notes
├── .canvas/assets/           # Logo design previews/source variants
├── .github/workflows/        # CI definition
├── attached_assets/          # Main imported art library (~1.5 GiB working tree)
│   ├── generated_images/     # Generated illustrations/icons
│   ├── uploads/              # Uploaded source media
│   └── worlds/               # World-specific art
├── client/
│   ├── public/               # Static metadata, icons, social art, and public props
│   └── src/
│       ├── assets/           # Vite-imported production art
│       ├── components/       # Game/UI components and admin panels
│       │   ├── ui/           # Small reusable Radix-style primitives
│       │   └── world/        # World location/shop/cave overlays
│       ├── hooks/            # Client state and interaction hooks
│       ├── lib/              # Combat math, presentation maps, audio, query helpers
│       ├── pages/            # Route-level experiences
│       └── types/            # Local third-party declarations
├── docs/                     # System audits, implementation notes, and codebase maps
├── script/                   # Production build orchestration
├── server/
│   ├── gifts/                # Atomic gift value transfers
│   ├── housing/              # Home-decoration transactions
│   ├── marketplace/          # Marketplace transaction coordinator
│   ├── milestones/           # Purchase-milestone configuration/claims
│   ├── payments/             # Stripe fulfillment and payment errors/config
│   ├── routes/               # Extracted Express registration modules
│   ├── startup/              # Ordered boot, migrations, backfills, seeds, asset sync
│   └── tutorial/             # Tutorial configuration and reward service
├── shared/                   # Drizzle schema and client/server combat contracts
├── test/                     # Node test runner integration and domain tests
├── MASTER_GAME_DOCUMENT.txt  # Product/game design reference
├── package.json              # Runtime dependencies and build/check/test scripts
└── railway.toml              # Railway deployment configuration
```

### Runtime flow

1. `server/index.ts` creates Express middleware, sessions, Passport, rate limits, health/static handling, and startup sequencing.
2. `server/routes.ts` registers most HTTP APIs and calls focused registrars under `server/routes/`.
3. Domain services either call `server/storage.ts` or execute focused Drizzle transactions directly against `server/db.ts`.
4. `shared/schema.ts` supplies the persistence model and cross-runtime TypeScript types.
5. `client/src/App.tsx` authenticates the user, lazy-loads route pages, and owns global overlays/navigation.
6. Pages and components use `client/src/lib/queryClient.ts` and TanStack Query for HTTP server state; animation-heavy experiences also maintain local refs, timers, and `requestAnimationFrame` loops.

## 2. System breakdown

The following inventory treats a “system” as a player-facing domain or an operational boundary. Dependencies name the important direct collaborators rather than every import.

### 2.1 Authentication and accounts

- **Main files:** `server/index.ts`, `server/auth.ts`, `server/routes/account.routes.ts`, `server/registration.ts`, `client/src/pages/AuthPage.tsx`, `client/src/pages/ResetPasswordPage.tsx`.
- **Supporting files:** `server/routes.ts` (login/current-user integration), `server/storage.ts`, `shared/schema.ts`, account/auth tests.
- **Dependencies:** Passport Local, `express-session`, PostgreSQL session storage, bcrypt, Resend/email configuration, rate limiting.
- **Risks:** identity logic is split between bootstrap, the account registrar, and the legacy route hub; session shape is consumed as `any` in many handlers; password-reset and verification flows are operationally dependent on external email configuration. Any future route extraction must preserve middleware and raw webhook ordering.

### 2.2 Player data and progression

- **Main files:** `shared/schema.ts`, `server/storage.ts`, `server/routes.ts`, `client/src/components/UserProfilePanel.tsx`, `client/src/components/PlayerDetailPanel.tsx`.
- **Supporting files:** `client/src/components/TopBar.tsx`, `GlobalLevelUpOverlay.tsx`, `levelUpEvents.ts`, badge/quest/tutorial/reward services.
- **Dependencies:** users, inventory, badge, quest, purchase, battle, and social tables; `/api/auth/me` is a wide client cache dependency.
- **Risks:** player state is spread across the `users` row and many feature tables; broad cache invalidation of `/api/auth/me` makes unrelated systems converge on one payload; multiple XP/level formulas exist in route and combat code. A canonical progression service and formula catalog are needed before behavior changes.

### 2.3 Pets and pet presentation

- **Main files:** `client/src/components/PetAnimator.tsx`, `PetAnimatorCanvas.tsx`, `PetDetailPage.tsx`, `client/src/pages/PetCarePage.tsx`, `PetInventoryPage.tsx`; pet routes in `server/routes.ts`.
- **Supporting files:** `PetDatabasePanel.tsx`, `PetInventory.tsx`, `PetPowerUpModal.tsx`, `petGif.ts`, `alphaBounds.ts`, `WalkAroundScene.tsx`, template/part tables in `shared/schema.ts`.
- **Dependencies:** inventory ownership, shop item/template records, accessories, assets (URLs and database images), pet stats/progression, audio.
- **Risks:** rendering and gameplay metadata are co-located in large components; both DOM/GIF and canvas animation paths must remain behaviorally aligned; `any`-shaped pet payloads weaken contract validation; repeated template-part requests and image decoding can cause visible stalls.

### 2.4 Equipment and accessories

- **Main files:** `client/src/components/PetEquipAccessoriesPage.tsx`, `PetDetailPage.tsx`, `ClearingEquipmentModal.tsx`, `ClearingEquipmentPanels.tsx`, `server/clearingEquipment.ts`, `server/routes/clearingEquipment.routes.ts`.
- **Supporting files:** `client/src/hooks/useClearingEquipment.ts`, `shared/clearingEquipment.ts`, `server/clearingEquipmentBalance.ts`, equipment columns/tables in `shared/schema.ts`.
- **Dependencies:** user inventory, shop items, pets, coins/essence, Clearing combat stat calculation.
- **Risks:** there are two equipment concepts—pet accessories and Clearing slot gear—with different rules and APIs; stat projection can diverge between UI display, session creation, and attack resolution; sale/equip operations need consistent lock ordering and single ownership validation.

### 2.5 Inventory

- **Main files:** `server/storage.ts`, inventory routes in `server/routes.ts`, `server/inventoryPurchase.ts`, `server/inventoryConsumption.ts`, `client/src/components/PetInventory.tsx`, `client/src/pages/BagInventoryPage.tsx`.
- **Supporting files:** item database/admin components, marketplace/gifts/fishing/housing transactions, `user_inventory` in `shared/schema.ts`.
- **Dependencies:** nearly every economy and progression system.
- **Risks:** one table represents stacks, individual pets, poles, equipment, listing escrow, and metadata-rich instances; callers must know which categories stack. This is a high-coupling boundary and a common source of quantity, ownership, duplication, or stale-cache defects.

### 2.6 Marketplace

- **Main files:** `client/src/pages/MarketPage.tsx`, `server/routes/marketplace.routes.ts`, `server/marketplace/transactions.ts`.
- **Supporting files:** `server/storage.ts`, `shared/schema.ts`, `docs/MARKETPLACE_SYSTEM_AUDIT.md`, marketplace tests.
- **Dependencies:** users/coins, shop items, general inventory, fish inventory, listing records, authentication.
- **Risks:** category-specific transfer semantics make escrow complex; reads remain coupled to broad storage/route dependencies; correctness relies on every value-moving path using the transaction coordinator and its lock order.

### 2.7 Economy, coins, payments, and rewards

- **Main files:** coin/payment routes in `server/routes.ts`, `server/payments/fulfillStripePurchase.ts`, `server/stripeClient.ts`, `server/webhookHandlers.ts`, `client/src/pages/CoinShopPage.tsx`.
- **Supporting files:** `inventoryPurchase.ts`, `rewardClaim.ts`, `dailyQuestClaim.ts`, `badgePeriodicClaim.ts`, milestone services, `DailyClaimCard.tsx`, `RewardClaimModal.tsx`.
- **Dependencies:** Stripe, sessions, reward bundles, inventory, users, quests/badges, admin configuration.
- **Risks:** many legitimate coin grant/debit paths exist; not all share a ledger or common idempotency abstraction. Admin-configured values and direct grants need auditability. Webhook/verify concurrency is protected in focused fulfillment code, but future callers could bypass it.

### 2.8 Essence

- **Main files:** `server/clearingCurrency.ts`, `server/clearingRewardChests.ts`, `server/clearingEquipment.ts`, `client/src/hooks/usePlayerCurrencyBalances.ts`, `client/src/lib/currencyAssets.ts`.
- **Supporting files:** `TopBar.tsx`, Clearing currency/drop/equipment components, `shared/clearingConfig.ts`, `shared/clearingEquipment.ts`, `users.essence` in `shared/schema.ts`.
- **Dependencies:** Elysian Clearing loot, chest claims, equipment sales, user balance.
- **Risks:** essence is currently Clearing-specific but lives on the global user record; balance changes occur through several focused SQL paths rather than a ledger; startup default/backfill history differs from the schema default, so environment history matters.

### 2.9 Elysian Clearing combat

- **Main files:** `client/src/pages/ElysianBayouClearingPage.tsx`, `client/src/components/ElysianClearingCombat.tsx`, `server/elysianClearingCombat.ts`, `server/routes/elysianClearingCombat.routes.ts`.
- **Supporting files:** shared combat/config/geometry modules, `clearingEnemyBehavior.ts`, `elysianClearingCombatMath.ts`, attack/effect/drop/equipment components and hooks.
- **Dependencies:** active pet/inventory, equipped gear, in-memory server sessions, database-configured enemies, world coordinates, loot/chests/egg drops, XP.
- **Risks:** the browser simulates enemy movement and incoming damage while the server authorizes player hits and rewards, producing two partially authoritative simulations. Position sync is periodic and combat sessions are process-local; restart or horizontal scaling expires sessions. See the dedicated combat review below.

### 2.10 Legacy world/cave combat and enemy AI

- **Main files:** `client/src/pages/WorldPage.tsx`, `client/src/components/BattleArena.tsx`, `client/src/pages/LavaCrawlPage.tsx`, `server/caveProgress.ts`, world/combat routes in `server/routes.ts`.
- **Supporting files:** `WorldCaveOverlay.tsx`, `WorldLocations.tsx`, sounds, pet animation, cave tests.
- **Dependencies:** world configuration, active pet, potions, inventory, XP, coins, cave tier progress.
- **Risks:** UI, animation, AI, damage, rewards, and API calls share very large components. Cave and Clearing combat are separate engines with separate formulas. Browser-driven simulation creates desynchronization and outcome-trust questions.

### 2.11 Loot, drops, XP, and reward chests

- **Main files:** `server/clearingLoot.ts`, `clearingRewardChests.ts`, `clearingSpecialMobs.ts`, `clearingCurrency.ts`, reward/loot routes in `server/routes.ts`.
- **Supporting files:** `ClearingRewardChests.tsx`, ground/currency drop components and hooks, `rewardClaim.ts`, schema reward tables.
- **Dependencies:** enemy defeat, configured shop items/drop tables, inventory, coins/essence, pet XP, transactions.
- **Risks:** several reward models coexist (immediate grants, ground drops, chests, inbox bundles, direct inventory, end-of-battle awards). Idempotency keys use different tables/strategies; duplicate distribution and inconsistent expiration/retry behavior are the principal cross-system hazards.

### 2.12 Worlds and exploration

- **Main files:** `client/src/pages/MapPage.tsx`, `WorldPage.tsx`, `PetWorldPage.tsx`, `client/src/components/world/*`, world/admin routes in `server/routes.ts`.
- **Supporting files:** `exploreLocations.ts`, world presentation/config libraries, `ExploreAdminPanel.tsx`, world assets.
- **Dependencies:** admin-configured database records, world assets, pets, cave/fishing/shop/combat experiences, navigation.
- **Risks:** `WorldPage.tsx` embeds multiple sub-experiences and asset mappings; presentation config exists in the database, code constants, and imported images; partial loads or startup asset synchronization can overwrite/mask environment-specific content.

### 2.13 Fishing and aquarium

- **Main files:** `client/src/pages/FishingPage.tsx`, `SellFishPage.tsx`, `AquariumPage.tsx`, `server/routes/fishing.routes.ts`, `server/fishingAttempt.ts`, `fishCatchRewardClaim.ts`, `fishSale.ts`, `aquariumUnlock.ts`.
- **Supporting files:** `FishingAdminPanel.tsx`, `fishingAttemptResult.ts`, `server/storage.ts`, relevant schema/tests, `docs/FISHING_SYSTEM_AUDIT.md`.
- **Dependencies:** poles/bait and general inventory, fish inventory, aquarium state, coins, daily quests, assets/audio.
- **Risks:** a large client state machine coordinates timing and animation with server attempts/claims; split catch-attempt and reward-claim phases demand durable correlation/idempotency; fish are stored separately from general inventory, complicating marketplace and UI reuse.

### 2.14 PvP

- **Main files:** `client/src/pages/PvpArenaPage.tsx`, `PvpBattlePage.tsx`, PvP routes in `server/routes.ts`, `server/seedPvpBots.ts`.
- **Supporting files:** `PvpMatchmakingOverlay.tsx`, `BattleArena.tsx` types/assets, PvP tables in `shared/schema.ts`, badge backfills.
- **Dependencies:** pets/stats, tickets, matchmaking records/bots, inventory/potions, rewards/badges, audio.
- **Risks:** `PvpBattlePage.tsx` contains targeting, AI selection, damage, status effects, timing, and outcome orchestration in the browser. Server endpoints must not trust a claimed result or reward magnitude. Timers for poison, stun, attacks, FX, and countdowns increase stale-closure/unmount risk.

### 2.15 Raids

- **Main files:** `client/src/pages/RaidPage.tsx`, `RaidBattlePage.tsx`, `RaidLeaderboardPage.tsx`, raid routes in `server/routes.ts`.
- **Supporting files:** `BattleArena.tsx`, raid boss/game settings, reward bundles, admin configuration in `AdminPage.tsx`.
- **Dependencies:** tickets, pets, shared boss HP in `game_settings`, leaderboard fields on users, reward distribution, assets/audio.
- **Risks:** `/api/raid/deal-damage` is a sensitive trust boundary; shared HP, participant totals, defeat locking, cache invalidation, and reward distribution are co-located in the route hub. Process-local caches are unsuitable as authoritative state and multiple app replicas can race unless database conditions/locks are complete.

### 2.16 UI, navigation, and accessibility

- **Main files:** `client/src/App.tsx`, `client/src/index.css`, `client/src/components/FloatingNav.tsx`, `TopBar.tsx`, `components/ui/*`.
- **Supporting files:** route pages, overlays/modals, `stage.ts`, `navVisibility.ts`, `use-mobile.tsx`, toast/error/loading components.
- **Dependencies:** authentication payload, Wouter, TanStack Query, Radix, Tailwind, Framer Motion, portal layers.
- **Risks:** global overlays and route visibility logic concentrate in `App.tsx`; extensive absolute positioning and z-index conventions are not represented by one layout service; large components use inline state and styles, making render boundaries and accessibility behavior difficult to verify consistently.

### 2.17 Assets, animation, sound, and effects

- **Main files:** `attached_assets/`, `client/src/assets/`, `client/public/`, `client/src/lib/sounds.ts`, `petGif.ts`, `PetAnimator*.tsx`.
- **Supporting files:** `alphaBounds.ts`, `enemyImageMetrics.ts`, generated image folders, database `image_url`/base64 fields, asset sync startup code.
- **Dependencies:** Vite bundling, Sharp, browser image/audio APIs, database content, Git LFS attributes.
- **Risks:** 1,128 tracked raster assets occupy roughly 1.5 GiB under `attached_assets`; duplicate binaries and opaque timestamp names impair provenance; 20 MiB individual PNGs and duplicate source/production copies create clone, decode, memory, and transfer costs. No tracked audio files were found; audio is code-generated/remote/data-backed through `sounds.ts`.

### 2.18 Admin tools

- **Main files:** `client/src/pages/AdminPage.tsx`, `ItemDatabaseSection.tsx`, `PetDatabasePanel.tsx`, `EnemyDatabasePanel.tsx`, `FishingAdminPanel.tsx`, `ExploreAdminPanel.tsx`, `ClearingAdminPanel.tsx`.
- **Supporting files:** admin routes in `server/routes.ts` and `server/routes/clearingAdmin.routes.ts`, `server/auth.ts`.
- **Dependencies:** virtually all configurable content tables, image upload/processing, roles, metrics, maintenance mode.
- **Risks:** admin UI and API breadth are enormous; a single authorization omission has high impact. Several content edits accept large image payloads. Audit logging, validation consistency, least-privilege roles, and destructive-action confirmation need dedicated review.

### 2.19 Networking and cache synchronization

- **Main files:** `client/src/lib/queryClient.ts`, client `useQuery`/`useMutation` callers, `server/routes.ts`, `server/index.ts`.
- **Supporting files:** `tabSync.ts`, `WorldChatPanel.tsx`, Clearing position sync, query hooks.
- **Dependencies:** cookie sessions, REST JSON, TanStack Query invalidation, in-process caches.
- **Risks:** endpoint strings and response shapes are handwritten; there is no generated API contract. Broad invalidations cause refetch bursts, while direct `fetch` callers do not always share error handling. World chat, onboarding, and combat polling can overlap. Process-local caches/sessions behave differently under multiple server replicas.

### 2.20 Saving/loading, startup, and persistence

- **Main files:** `server/db.ts`, `server/storage.ts`, `shared/schema.ts`, `server/startup/runStartup.ts`, `startup/migrations/runEssentialBoot.ts`, `startup/backfills/runNonCriticalStartup.ts`.
- **Supporting files:** advisory lock/startup contract, seed/asset-sync modules, route mutations, Railway config.
- **Dependencies:** Railway PostgreSQL, Drizzle, runtime SQL, environment variables.
- **Risks:** “saving” is endpoint-by-endpoint rather than a centralized save service, which is appropriate for web persistence but makes atomicity inconsistent. Runtime DDL/backfills in a 3,381-line boot file blur deployment and application startup, can delay readiness, and are hard to roll back. Clearing sessions and some caches are intentionally in memory and are not saved.

### 2.21 Social, forum, friends, gifts, housing, badges, quests, and tutorial

- **Main files:** `ForumPage.tsx`, `FriendsPage.tsx`, `WorldChatPanel.tsx`, gift/housing route and transaction modules, badge/quest route modules, tutorial service, `PetHousePage.tsx`.
- **Supporting files:** `server/adminMessages.ts`, `server/storage.ts`, reward coordinators, corresponding schema and tests.
- **Dependencies:** authenticated identity, inventory/coins, content moderation, reward state, TanStack Query.
- **Risks:** this group crosses social content and value transfer. Gift/housing transfers have focused transactions, but broad storage and client pages remain shared. Forum/chat need separate abuse, pagination, retention, and unbounded-query review; quest and badge progress are coupled to domain routes through callbacks/helpers in `server/routes.ts`.

## 3. Large files (approximately 500+ lines)

All application source files above 500 physical lines are listed. “Split?” is a future recommendation only.

| Lines | File | Split eventually? | Suggested boundary (after characterization tests) |
|---:|---|---|---|
| 8,542 | `server/routes.ts` | **Yes—highest priority** | Domain registrars/services; preserve registration order and shared reward callbacks |
| 5,555 | `client/src/pages/WorldPage.tsx` | **Yes** | World shell, data hooks, admin editing, shops, fishing, cave launcher |
| 5,031 | `client/src/pages/AdminPage.tsx` | **Yes** | One feature panel per domain plus shared admin form/upload utilities |
| 4,062 | `client/src/pages/PetWorldPage.tsx` | **Yes** | Scene engine, movement, encounters, controls, overlays |
| 3,664 | `client/src/pages/PetHousePage.tsx` | **Yes** | House scene, placement editor, pet interaction, gifts, data hooks |
| 3,535 | `client/src/components/BattleArena.tsx` | **Yes—high priority** | Battle state machine, AI, math, effects renderer, reward adapter |
| 3,487 | `server/storage.ts` | **Yes—high priority** | Domain repositories behind narrow interfaces |
| 3,411 | `client/src/index.css` | **Yes** | Tokens/base, layout, component, world, animation stylesheets |
| 3,381 | `server/startup/backfills/runNonCriticalStartup.ts` | **Yes—high priority** | Versioned, observable, idempotent backfill units with a ledger |
| 2,554 | `client/src/pages/FishingPage.tsx` | **Yes** | Attempt state machine, presentation, controls, result/claim hook |
| 2,398 | `client/src/pages/HomePage.tsx` | **Yes** | Home shell, pet scene, cards/bundles, interaction effects |
| 2,382 | `client/src/components/PetAnimator.tsx` | **Yes** | Data loading/cache, animation state, layered renderer |
| 2,291 | `client/src/pages/PvpArenaPage.tsx` | **Yes** | Lobby, team builder, matchmaking, history/rewards |
| 2,284 | `client/src/pages/PvpBattlePage.tsx` | **Yes—high priority** | Deterministic engine, targeting, status effects, renderer/network adapter |
| 1,743 | `client/src/pages/MoltenBlocksPage.tsx` | **Yes** | Game engine, rendering/input, reward submission, UI |
| 1,703 | `client/src/pages/ParaPetsHubPage.tsx` | **Yes** | Notices/carousels, catalog sections, page shell |
| 1,690 | `client/src/pages/LavaCrawlPage.tsx` | **Yes** | Loop/physics, encounter state, renderer, HUD |
| 1,655 | `client/src/components/ItemDatabaseSection.tsx` | **Yes** | List/filter, editor form, upload, domain subsections |
| 1,521 | `client/src/components/PetDatabasePanel.tsx` | **Yes** | Catalog, template editor, part/asset editors |
| 1,507 | `client/src/pages/MarketPage.tsx` | **Yes** | Browse/filter, listing detail, create/sell/collect flows |
| 1,473 | `client/src/components/HomeBundleSection.tsx` | **Yes** | Catalog/editor, preview, upload management |
| 1,455 | `client/src/components/PetInventory.tsx` | **Yes** | Query/model adapter, filters/grid, card/detail actions |
| 1,328 | `client/src/pages/CoinShopPage.tsx` | **Yes** | Pack catalog, checkout/verification, milestones, presentation |
| 1,236 | `client/src/components/UserProfilePanel.tsx` | **Yes** | Profile data, tabs/sections, social actions |
| 1,183 | `client/src/components/PetDetailPage.tsx` | **Yes** | Profile, equipment, stat/reset/delete mutations |
| 1,138 | `shared/schema.ts` | **Yes, carefully** | Per-domain schema modules re-exported from a stable barrel |
| 1,102 | `client/src/pages/RaidPage.tsx` | **Yes** | Boss status, party selection, reward/leaderboard entry |
| 1,015 | `client/src/components/PetAnimatorCanvas.tsx` | **Yes** | asset/cache loader, frame scheduler, draw layers |
| 1,013 | `client/src/pages/AquariumPage.tsx` | **Yes** | aquarium scene, inventory/unlock hooks, fish renderer |
| 930 | `client/src/pages/AuthPage.tsx` | **Yes** | login/register/verification forms and shared auth shell |
| 928 | `client/src/pages/MapPage.tsx` | **Yes** | map presentation, markers/admin editing, navigation |
| 925 | `client/src/components/FishingAdminPanel.tsx` | **Yes** | fish/pole/bait/config subsections |
| 909 | `client/src/App.tsx` | **Yes** | route table, auth gate, global overlay providers |
| 875 | `client/src/components/FloatingNav.tsx` | **Yes** | navigation, quests, social indicators, tutorial actions |
| 844 | `client/src/pages/RaidBattlePage.tsx` | **Yes—high priority** | combat state, boss AI/timing, renderer, damage reporting |
| 812 | `client/src/components/BeginJourneyOverlay.tsx` | **Probably** | tutorial state machine, page content, polling adapter |
| 752 | `client/src/lib/sounds.ts` | **Yes** | audio engine plus domain sound catalogs |
| 741 | `client/src/pages/FoundersPage.tsx` | **Probably** | data hooks, tier cards, layout |
| 708 | `client/src/components/ExploreAdminPanel.tsx` | **Yes** | location/enemy/drop editors |
| 648 | `client/src/components/PetPowerUpModal.tsx` | **Probably** | calculation/view model and modal rendering |
| 640 | `client/src/components/PetEquipAccessoriesPage.tsx` | **Probably** | inventory hook, slot model, UI |
| 631 | `client/src/pages/VisitPetHousePage.tsx` | **Probably** | visitor data, scene, profile/actions |
| 610 | `client/src/components/world/WorldShopOverlay.tsx` | **Probably** | catalog/filter, purchase mutation, overlay UI |
| 608 | `server/routes/account.routes.ts` | **Yes** | registration, verification, reset, account lifecycle route groups |
| 603 | `client/src/lib/petGif.ts` | **Probably** | caching/loading, composition, export utilities |
| 582 | `server/routes/fishing.routes.ts` | **Probably** | attempts/claims, inventory/sales, aquarium registrars |
| 581 | `client/src/pages/BadgePage.tsx` | **Probably** | badge data/claim hook and collection UI |
| 579 | `client/src/components/PlayerDetailPanel.tsx` | **Probably** | profile display and friendship mutations |
| 561 | `client/src/pages/RaidLeaderboardPage.tsx` | **Probably** | ranking/reward model and presentation |
| 552 | `client/src/pages/ForumPage.tsx` | **Probably** | post list, thread, comment/reply components and hooks |
| 526 | `client/src/components/WorldLoadingScreen.tsx` | **Probably** | loader engine, progress model, view |

Line count alone is not a reason to split. The strongest candidates combine multiple authority boundaries or independent rates of change (`routes.ts`, storage, battle engines, startup work), not merely substantial markup.

## 4. Duplicate logic candidates

1. **Combat engines and formulas (High):** `BattleArena.tsx`, `PvpBattlePage.tsx`, `RaidBattlePage.tsx`, and Elysian Clearing independently implement health updates, target selection, damage numbers, mana, status effects, attack phases, timers, and sound/FX. Eventually share pure primitives and explicit mode adapters—not one configurable mega-engine.
2. **Pet animation/loading (Medium):** `PetAnimator.tsx`, `PetAnimatorCanvas.tsx`, `WalkAroundScene.tsx`, Home/Pet House/World scenes repeat part retrieval, image loading, facing, scaling, and frame scheduling. A shared asset cache and presentation model would reduce drift.
3. **Home pet interaction effects (Medium):** heart/sparkle timer patterns appear in both `HomePage.tsx` and `PetHousePage.tsx`. Extract only after verifying identical cleanup and visual semantics.
4. **API request/error parsing (Medium):** direct `fetch(...).json().catch(...)` and `apiRequest` coexist. A typed request layer could standardize credentials, error codes, cancellation, and response validation.
5. **Query invalidation bundles (Medium):** rewards, gifts, equipment, pet care, and purchases repeatedly invalidate inventory, auth, quest, and feature queries. Named cache-update policies would prevent missing or excessive invalidation.
6. **Admin CRUD/upload forms (Medium):** item, pet, enemy, fishing, exploration, bundle, and world editors repeat local editing state, Data URL reading, preview/reset, mutations, and confirmation.
7. **Currency and reward display (Low):** coins/essence icons, formatting, gain toasts, and balance refetches repeat across Top Bar, Clearing, shops, rewards, and pet interactions.
8. **XP and level advancement (High):** formulas/loops appear in route helpers, Clearing reward grant, and battle flows. Catalog and test every formula before choosing a canonical implementation because current differences may be intentional.
9. **Inventory category/stack decisions (High):** transactions independently distinguish fish, pets, poles, stackables, equipment, and decor. Central metadata/policies would reduce grant/transfer errors.
10. **Reward idempotency patterns (High):** game settings keys, claim rows, `claimed_at`, unique inserts, advisory locks, and inbox claims solve similar retry problems differently. A shared protocol/ledger is preferable to copy-pasting SQL.
11. **Stage/coordinate math (Medium):** world, cave, PvP, pet scenes, hit testing, and drag/drop repeatedly convert normalized, percentage, design, and pixel coordinates.
12. **Timers and ephemeral FX cleanup (Medium):** many pages schedule removal of floats/sparks/hearts/status effects. A lifecycle-safe scheduler hook could own cancellation without changing timing.

## 5. Tight coupling

| Coupling | Evidence | Desired future boundary | Risk |
|---|---|---|---|
| Route registration ↔ business rules ↔ SQL | `server/routes.ts` owns all three | Thin registrars → domain services → repositories | High blast radius and difficult isolation |
| Storage interface ↔ every domain table | `server/storage.ts` is a broad singleton | Narrow domain repositories/ports | Mocks and changes require unrelated knowledge |
| UI rendering ↔ combat simulation ↔ network mutation | Battle pages/components | Pure deterministic engine + presentation + server adapter | Timing and render changes can alter gameplay |
| Inventory ↔ pets/equipment/fishing/market/gifts/housing | Shared table and category branches | Inventory policy service and typed item capabilities | Quantity/ownership/escrow mistakes |
| Quest/badge progress ↔ unrelated action routes | callbacks/helpers in route hub | Domain events or explicit progression service | New actions can omit progress or duplicate it |
| Global user payload ↔ currency/progression/navigation | widespread `/api/auth/me` use | Focused resources plus deliberate cache projection | Refetch storms and payload creep |
| World presentation ↔ admin database ↔ bundled asset imports | `WorldPage.tsx` and startup sync | Versioned content manifest/repository | Environment drift and overwrite risk |
| Raid combat ↔ `game_settings` ↔ reward distribution | same route section | raid service with transactional boss instance/participation boundary | concurrency and replay risk |
| Clearing client simulation ↔ server session | periodic position plus attack requests | documented authoritative state protocol | reconciliation/desync under latency |
| Startup ↔ production schema evolution/content seeds | runtime boot modules | deployment migration/backfill pipeline | startup failure and hidden environment history |

## 6. Technical debt register

Severity reflects impact and likelihood, not an instruction to change behavior immediately.

### Critical

1. **Audit browser authority for PvP and raid outcomes.** Value-bearing results must be computed or strongly validated against a durable server-side battle instance. Client simulation is appropriate for presentation, not authoritative damage/rewards.
2. **Establish one auditable value-mutation map/ledger.** Coins, essence, items, fish, XP, tickets, and rewards move through many paths. A missed ownership, atomicity, or idempotency check can affect economy integrity.
3. **Replace runtime schema evolution as the long-term primary migration mechanism.** Essential and noncritical startup SQL must be reconciled to an ordered migration ledger with recorded versions, observability, rollback/repair procedures, and one-run guarantees.

### High

1. **Decompose `server/routes.ts` safely.** At 8,542 lines it is an architectural choke point. Continue small registration-only extractions, then extract services under characterization tests.
2. **Define authoritative combat contracts across modes.** Clearing, cave, PvP, and raid currently have distinct trust/timing models; document what the client may claim and what the server derives.
3. **Unify and test XP/damage/stat formulas as named policies.** Do not merge formula values blindly; first freeze current behavior with golden tests per mode.
4. **Create typed item capabilities and inventory transaction rules.** The shared inventory model requires callers to infer stackability and transfer semantics.
5. **Split broad storage into domain interfaces.** Keep transaction ownership in services; do not merely redistribute the same singleton into files.
6. **Harden multi-instance behavior.** Process-local raid caches and Clearing sessions need an explicit deployment assumption or shared/durable state plan.
7. **Create asset provenance/duplicate policy.** Very large duplicate binaries and opaque names make the repository costly and error-prone.
8. **Add admin audit trails and uniform validation review.** Admin APIs span accounts, economy, content, combat, assets, and maintenance.

### Medium

1. Introduce runtime request/response validation and generated/shared API types.
2. Separate animation loops/state machines from React render state in large game components.
3. Consolidate query keys and cache invalidation policies; add cancellation for obsolete requests.
4. Add pagination/limits to social, admin, inventory, and catalog reads where not already bounded.
5. Build lifecycle-safe timer/audio/image caches and instrument leaks/long tasks.
6. Modularize `index.css` around tokens and feature scopes without changing computed styles.
7. Standardize coordinate spaces and hit-test primitives.
8. Establish dependency-direction rules: client presentation → shared contracts; server services → repositories; no server imports from client.
9. Increase focused tests for combat loops, unmount cleanup, latency/retry, reward races, and startup failure modes.
10. Document database-backed versus bundled asset ownership and deployment synchronization.

### Low

1. Normalize file naming for **new** assets and modules; retain legacy names until a dedicated migration.
2. Replace remaining `any` incrementally at domain boundaries.
3. Add module ownership headers for the largest integration files.
4. Standardize error messages/codes and structured logging fields.
5. Add automated architecture metrics (file size, circular dependencies, asset budgets) as nonblocking reports before enforcing limits.

## 7. Performance review

### Rendering and state updates

- **Clearing combat paints enemy React state about every 50 ms** by cloning the enemy array while its simulation runs every animation frame. This caps React updates near 20 fps but still rerenders the large combat subtree; isolate the HUD/entity layer or render moving entities outside React only after profiling.
- Battle, PvP, fishing, world, lava, molten blocks, pet animation, and walk controllers all run animation frames. Verify only the visible experience owns an active loop and that route/overlay transitions cancel it.
- Large route components hold numerous unrelated state variables; a small mutation (FX, drag position, timer tick) may rerender static panels and image trees. Use React Profiler before introducing memoization.
- Repeated `.map`, `.filter`, `.find`, `.sort`, and object cloning inside combat frames and render paths are acceptable for small parties but scale poorly with entity/catalog counts. Record entity counts and frame time before optimizing.
- Set/array functional updates for drops, sparks, death effects, and chests repeatedly allocate collections. They are safer than mutation for React, but high-frequency effects should be bounded.

### Calculations and loops

- Pixel-alpha bounds, GIF/canvas composition, image metrics, and layered pet rendering can be CPU-heavy. Existing caches should be checked for upper bounds, eviction, key stability, and failed-load behavior.
- XP advancement uses `while` loops capped at level 100 and is not individually expensive; duplication is a correctness concern more than a performance concern.
- Admin/catalog and inventory pages may filter/sort large arrays on every render. `useMemo` is only warranted after measuring actual row counts and dependency stability.
- Reward distribution and startup backfills can loop across many users/items. These operations need batching, progress logging, lock-duration metrics, and resumability before data volume grows.

### Network behavior

- Elysian Clearing posts position every 500 ms (about two requests/second per active player), posts each attack, and may retry once after invalid position. This can dominate request volume and should be instrumented for latency, rejection, retry, and concurrency.
- `/api/auth/me` and `/api/inventory` are invalidated by many mutations; reward claims invalidate several queries and then explicitly refetch balances. TanStack Query deduplicates some overlap, but waterfall/refetch behavior should be measured.
- World chat, tutorial, matchmaking, raid boss state, and notifications use polling/timers. Document each cadence and suspend it when hidden/off-route.
- Direct fetch calls lack uniform `AbortSignal` use, so stale page/session requests can complete after navigation.
- Template/fish-part image metadata queries occur from multiple renderers. Stable query keys/cache lifetimes are important to avoid duplicate requests.

### Assets and memory

- Tracked raster inventory: **1,128 files** (992 PNG, 71 WebP, 59 JPEG, 4 JPG, 2 SVG). `attached_assets` is approximately **1.5 GiB**; `client/src/assets` about **28 MiB**; `client/public` about **9.8 MiB**.
- The largest tracked files are PNGs around 20.3 MiB, with many exact-size duplicates. `client/src/assets/raid_bg.png` is ~4.9 MiB and `icon_world_chat_new.png` ~4.2 MiB.
- Browser decoded memory is roughly width × height × 4 bytes regardless of compressed file size. Multiple full-screen backgrounds, canvas layers, and preloaded pet parts can exceed mobile memory even if network compression is good.
- Timestamped duplicates may be intentional revisions or exact duplicate bytes. Confirm hashes and references before any future deletion; this audit recommends no asset change.
- Prefer production-generated size reports, route chunk budgets, image dimension audits, and runtime memory sampling rather than assuming repository size equals user download.

### Memory/lifecycle concerns to test

- Every `requestAnimationFrame`, interval, timeout, DOM listener, `Audio`, `Image`, object URL, and canvas resource must be cancelled/released on dependency change and unmount.
- Process-local Clearing sessions need TTL cleanup even when clients fail to send `DELETE`; inspect session eviction behavior under abrupt disconnects.
- Caches for template parts, image metrics, decoded frames, audio, and raid status should have bounded growth or a documented finite keyspace.
- Long-lived closures in combat timers may capture obsolete entities/state; use refs deliberately and add fake-timer/unmount tests.

## 8. Combat review

### Combat topology

| Mode | Client | Server | Current authority profile |
|---|---|---|---|
| Elysian Clearing | `ElysianBayouClearingPage.tsx`, `ElysianClearingCombat.tsx`, effects/drop/equipment hooks | `elysianClearingCombat.ts`, focused route/equipment/loot/chest modules | Server validates player hits/rewards; client simulates enemies/incoming damage |
| World/cave | `WorldPage.tsx`, `BattleArena.tsx`, `WorldCaveOverlay.tsx`, `LavaCrawlPage.tsx` | routes, `caveProgress.ts`, storage | Mixed legacy client simulation and server progression/reward endpoints |
| PvP | `PvpArenaPage.tsx`, `PvpBattlePage.tsx` | PvP route section, battle records/bot seed | Client-heavy battle engine; server owns matchmaking/persistence/rewards |
| Raid | `RaidPage.tsx`, `RaidBattlePage.tsx`, shared battle UI | raid route section and `game_settings` | Client-heavy timing; server mutates global HP/damage/rewards |

### Targeting and hit detection

- Clearing uses shared geometry plus client helpers for locked targets, aim capsules, melee assist cones/radii, normalized-to-pixel direction, and server-side range/direction validation. This is the strongest current combat boundary.
- Client and server receive/derive player, aim, target, and world-pixel coordinates separately. Differences in visible sprite bounds, image metrics, world resize, stale 500 ms position, or target motion between windup and request can yield “too far,” “invalid position,” or apparent misses.
- Locked-target state exists in both the client and server session. Target defeat/respawn mutates instance data, so stale callbacks or delayed responses can clear or apply the wrong lock unless action IDs and instance IDs remain unique.
- PvP/legacy modes perform browser hit tests against moving percentage-position entities. Drag thresholds, pointer coordinate conversion, transparent image bounds, and CSS transforms are likely causes of attacks/potions appearing not to register.

### Attack timing and projectiles

- Clearing sequences windup, impact, recovery, and idle with multiple timeouts; staff attacks add a projectile delay before the HTTP request. Network latency is therefore added after visible timing unless presentation reconciles the response.
- Queued attacks are tracked while a request is in flight. Test rapid input, held input, target death during windup, pause/unpause, tab backgrounding, high latency, rejection/retry, and unmount.
- PvP and Battle Arena use animation frames plus intervals/timeouts for charges, poison, stun, combos, floats, sparks, and skill effects. Multiple clocks can drift during background throttling or React state batching.
- Raid damage reporting must deduplicate clicks/attacks and bind them to a live battle ticket/session; otherwise retries or modified clients can inflate global damage.

### Damage, XP, drops, and equipment bonuses

- Clearing session creation derives active pet base stats, applies server-loaded equipment totals, scales enemy/session damage, and awards XP in a transaction after a unique defeat claim. This is appropriately server-oriented, but its level formula must remain aligned with profile displays and other modes.
- Clearing incoming enemy damage is applied locally. A refresh/reconnect/process restart may not preserve health/defeat state; document whether this is deliberately session-local.
- Chests/egg drops are durable database records and ownership-scoped. Claims use transactions, but expiration, respawn, ground placement, and next-enemy reuse need regression coverage.
- Equipment changes synchronize/recalculate session statistics. Race-test an equip/sell action during an attack and ensure the authoritative stat snapshot is explicit.
- Legacy cave/PvP/raid damage and XP formulas live in client components and routes. Compare formula names, rounding, defense application, crit/special multipliers, level caps, and XP boosts before any consolidation.

### Enemy AI

- Clearing enemies are a client state machine: spawning → roaming → pursuing → windup → recovering/returning → defeated/respawning. Per-frame distance checks, active-attacker caps, home clustering, disengage radii, and image-derived centers control behavior.
- Likely AI issues include enemies sharing homes/colliding, oscillating at pursue/disengage boundaries, delayed first attacks, invisible-sprite bounds shifting centers, background-tab time jumps, stale `nextActionAt` after pause, and mismatch between render state (20 fps) and simulation state (display refresh rate).
- PvP chargers and ally auto-attacks select targets on timers. Fairness/idle behavior depends on timer cadence, last-charge maps, live-array filtering, and stale closure avoidance.
- No common deterministic seed/replay exists across combat modes. Random failures are therefore difficult to reproduce; a future test harness should inject clocks and random sources without altering live randomness.

### Most plausible causes of reported combat problems

1. **Latency plus split authority:** visible impact occurs before server validation/response.
2. **Position freshness:** Clearing syncs at 500 ms and retries after rejection; a moving pet can outrun the last accepted server coordinate.
3. **Coordinate-space mismatch:** normalized world coordinates, pixel ranges, percentage layouts, sprite offsets, transforms, and alpha bounds are mixed.
4. **Multiple clocks:** animation frames, intervals, timeouts, CSS animations, and network completion do not pause/resume identically.
5. **Stale closures/target reuse:** delayed timers reference entities that moved, died, respawned, or were replaced.
6. **Render/simulation cadence mismatch:** simulation mutates refs each frame while React snapshots render less often.
7. **Formula drift:** duplicated damage/defense/XP/equipment logic produces mode- or display-specific expectations.
8. **Unbounded/repeated input:** queued attacks, touch/click duplication, potion drag/drop, or retry behavior can suppress or duplicate actions.
9. **Process-local state:** restarts, replica routing, or missed cleanup invalidate Clearing sessions and caches.
10. **Asset bounds/load timing:** transparent padding or late metrics change visual centers/hit radii.

### Combat verification plan (no balance change)

- Add deterministic unit vectors for geometry, target selection, rounding, equipment snapshots, XP thresholds, and state transitions.
- Add fake-clock tests for rapid input, pause/background, poison/stun, target death mid-windup, and cleanup.
- Add integration tests binding a battle/session ID, action ID, ticket, damage, defeat, XP, and reward to one idempotent server flow.
- Add structured combat telemetry: mode, session/action ID, client/server timestamps, accepted position age, target/range, rejection code, latency, and reward claim outcome—excluding sensitive data.
- Capture browser performance traces on representative low-end mobile hardware before optimizing.

## 9. Asset organization

### Findings

- Assets are distributed across `attached_assets`, `client/src/assets`, `client/public`, `.canvas/assets`, database records, and occasional data URLs.
- Many filenames describe upload tools/timestamps rather than game identity. Exact-size duplicate pairs and source/production copies are common.
- World assets have begun adopting a useful nested structure, but most assets remain flat.
- Icons, backgrounds, UI chrome, pet parts, screenshots/source uploads, and generated outputs share directories.
- There is no single manifest documenting canonical ID, owner, source/provenance, license, dimensions, alpha behavior, optimized derivative, and live references.

### Recommended professional structure (future only)

```text
assets/
├── source/                         # Never shipped; editable/original files
│   ├── brand/
│   ├── characters/pets/<pet-id>/
│   ├── enemies/<enemy-id>/
│   ├── worlds/<world-id>/<location-id>/
│   └── ui/
├── generated/                      # Reproducible build outputs
│   ├── images/{1x,2x}/
│   ├── atlases/
│   └── manifests/
├── runtime/                        # Canonical shipped/static files
│   ├── brand/
│   ├── ui/{icons,buttons,frames,currency}/
│   ├── pets/<pet-id>/{egg,idle,walk,battle,parts}/
│   ├── enemies/<enemy-id>/{idle,attack,hit,defeat}/
│   ├── worlds/<world-id>/{backgrounds,locations,shops,effects}/
│   ├── gameplay/{combat,fishing,pvp,raids,housing}/
│   ├── effects/{particles,projectiles,status}/
│   └── audio/{music,ambience,sfx,ui}/
└── catalog.json                    # IDs, provenance, license, dimensions, hashes, derivatives
```

### Migration principles

1. First generate a read-only hash/reference/dimension manifest and label canonical versus duplicate candidates.
2. Decide whether bundled files or object storage/database references are authoritative for each class.
3. Establish naming for new assets: stable semantic kebab-case IDs, not upload timestamps.
4. Build optimized derivatives reproducibly; retain originals outside the shipped bundle.
5. Migrate one bounded domain at a time with automated reference checks and visual regression screenshots.
6. Do not delete or move a legacy file until code, database content, documentation, historical URLs, and deployment sync are all verified.

## 10. Suggested roadmap

### Must Fix First

1. **Combat/economy threat model:** enumerate every value-bearing endpoint, its authority, validation, idempotency, transaction, and replay behavior; prioritize raid and PvP damage/outcomes.
2. **Migration safety:** inventory every startup DDL/backfill, reconcile it with the declared schema, and create a versioned migration/backfill ledger and operational runbook.
3. **Reward and inventory integrity:** define typed item capabilities, lock order, ledger/audit requirements, and consistent idempotency protocol; preserve current values and behavior.
4. **Multi-instance contract:** document whether production runs one process; either enforce that assumption or design durable/shared raid and Clearing state.
5. **Characterization coverage:** freeze current combat formulas, progression thresholds, reward paths, route order, and startup order before structural changes.
6. **Observability:** add structured metrics/logs for value mutations, combat rejections/latency, startup steps, slow routes, and failed asset loads without logging secrets.

### Should Improve Soon

1. Continue small route-registration extractions from `server/routes.ts`; move business logic only into tested services with injected dependencies.
2. Introduce narrow domain repositories around storage and transaction services.
3. Define shared runtime-validated API contracts, query-key factories, request cancellation, and cache invalidation policies.
4. Separate combat/fishing/game state machines from rendering and network adapters, beginning with tests rather than refactoring.
5. Produce asset hash/dimension/reference/provenance reports and production bundle/chunk budgets.
6. Add admin audit logging, validation consistency tests, pagination, and least-privilege review.
7. Profile active game routes on low-end mobile; record FPS, long tasks, decoded image memory, requests/minute, and React commits.

### Future Improvements

1. Split large client pages into feature shells, hooks/view models, renderers, and focused overlays.
2. Extract shared coordinate, scheduler, asset cache, currency display, and lifecycle-safe FX utilities.
3. Modularize schema and CSS through stable barrels/import order with no schema or computed-style changes.
4. Add deterministic combat replay/test harnesses with injected clocks/randomness.
5. Standardize error codes and user-safe error mapping across direct fetch and TanStack Query.
6. Add bounded caches, stale request cancellation, and explicit polling visibility policies.
7. Establish domain ownership documentation and automated dependency-cycle/file-growth reports.

### Long-Term Refactors

1. Move all competitive/shared-world combat outcomes to durable server-authoritative battle instances while retaining responsive client prediction/presentation.
2. Introduce a transactional economy ledger that records reason, source action, idempotency key, before/after or delta, and actor for all currencies/value items.
3. Replace the broad storage singleton with domain repositories and explicit unit-of-work boundaries.
4. Create versioned content manifests for worlds, pets, enemies, drops, equipment, and assets, with validation and staged publishing.
5. Consolidate combat primitives into small pure packages plus mode-specific policies; do not create a single coupled mega-engine.
6. Move original art out of the runtime repository path, generate optimized derivatives in a reproducible pipeline, and serve immutable versioned assets through appropriate storage/CDN infrastructure.

## Appendix A: Architectural guardrails for follow-up work

- Never combine file splitting with behavior, balance, schema, or asset migration in one pull request.
- Preserve route and middleware order; add route-registration tests before moving handlers.
- Preserve server authority and transactional boundaries; do not move security logic into client helpers.
- Characterize existing formulas per mode before sharing code; “duplicate” does not mean “equivalent.”
- Make migrations forward-only, observable, idempotent where possible, and rehearsed against production-scale snapshots.
- Use before/after screenshots and performance traces for perceptible UI or rendering work.
- Treat exact binary duplicates as candidates, not permission to delete; verify all reference channels first.

## Appendix B: Related focused audits

- `docs/CODEBASE_MAP.md`
- `docs/REPOSITORY_ASSET_AUDIT.md`
- `docs/FISHING_SYSTEM_AUDIT.md`
- `docs/MARKETPLACE_SYSTEM_AUDIT.md`
- `docs/PAYMENT_SYSTEM_AUDIT.md`
- `docs/BADGE_REWARD_AUDIT.md`
- `docs/TUTORIAL_SYSTEM_AUDIT.md`
- `docs/ELYSIAN_CLEARING_IMPLEMENTATION_STATUS.md`
- `docs/elysian-clearing-weapon-audit.md`
- `docs/STARTUP_INITIALIZATION_MAP.md`

