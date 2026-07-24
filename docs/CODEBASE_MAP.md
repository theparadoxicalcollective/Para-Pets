# Para Pets codebase map

This document describes the current production architecture on `main` after the Safety Foundation merge. It is a navigation aid, not a change plan; preserve the live game’s routes, economy, assets, and Railway configuration when working in these areas.

## Runtime architecture

- **Client:** `client/src/` is a React 18, TypeScript, Vite, Tailwind application. `client/src/App.tsx` owns routing and global overlays; `client/src/pages/` contains screen-level game experiences; `client/src/components/` contains reusable game UI and admin panels. Wouter manages client routing and TanStack Query manages server state.
- **Server:** `server/index.ts` builds the Express process, configures compression, rate limits, sessions, Passport, static assets, startup migrations, and production/development serving. `server/routes.ts` registers the API surface and delegates account/auth flows to `server/routes/account.routes.ts`, support flows to `server/routes/support.routes.ts`, and badge HTTP registrations to `server/routes/badge.routes.ts`. The badge module receives authentication, storage, database, and image-processing dependencies explicitly. `server/storage.ts` is the application data-access layer over Drizzle/PostgreSQL. `server/inventoryPurchase.ts` provides the coin-shop debit-and-grant transaction boundary.
- **Persistence:** `shared/schema.ts` declares Drizzle tables and shared types. `server/db.ts` selects `RAILWAY_DATABASE_URL` first and retains `DATABASE_URL` as a fallback. Railway PostgreSQL is the production source of truth.
- **Build/deploy:** `script/build.ts` builds the Vite client and bundles the server to `dist/index.cjs`. `railway.toml` starts that bundle and checks `GET /health`.

## Major game systems

| System | Primary locations |
| --- | --- |
| Identity, accounts, verification, bans, sessions | `server/index.ts`, `server/auth.ts`, registration and account routes in `server/routes.ts` |
| Pets, inventory, accessories, care and houses | `client/src/pages/PetCarePage.tsx`, `PetHousePage.tsx`, `PetInventoryPage.tsx`; relevant routes/storage/schema |
| World exploration, locations, cave combat | `client/src/pages/WorldPage.tsx`, `PetWorldPage.tsx`, `LavaCrawlPage.tsx`, `server/routes.ts` |
| PvP and raid battles | `client/src/pages/PvpArenaPage.tsx`, `PvpBattlePage.tsx`, `RaidPage.tsx`; `server/seedPvpBots.ts` |
| Fishing and aquarium | `client/src/pages/FishingPage.tsx`, `AquariumPage.tsx`, `SellFishPage.tsx`, `client/src/components/FishingAdminPanel.tsx`; fishing routes/helpers in `server/routes.ts` and `server/storage.ts`; see [`FISHING_SYSTEM_AUDIT.md`](./FISHING_SYSTEM_AUDIT.md) |
| Economy, shops, inventory and Stripe purchases | `client/src/pages/CoinShopPage.tsx`, `MarketPage.tsx`, `server/stripeClient.ts`, Stripe webhook/routes |
| Social features | `ForumPage.tsx`, `FriendsPage.tsx`, `WorldChatPanel.tsx`, support and admin-message routes |
| Content administration | `client/src/pages/AdminPage.tsx` plus admin panels; protected API routes in `server/routes.ts` |

## Oversized and tightly coupled areas

- `server/routes.ts` combines gameplay rules, content management, payments, and API registration; account registration, verification, reset, and logout flows live in `server/routes/account.routes.ts`, while badge HTTP routes live in `server/routes/badge.routes.ts`. Shared badge award/backfill helpers intentionally remain in `server/routes.ts` because fishing, PvP, purchases, and startup reconciliation invoke them directly; extracting those helpers is a separate dependency-focused follow-up.
- `server/index.ts` (~3.7k lines) combines HTTP bootstrap with runtime schema maintenance, migration/backfill work, seeding, and static/Vite setup. Boot concerns should eventually be isolated without changing ordering.
- `server/storage.ts` (~3.6k lines) centralizes all data access. It is a useful boundary but too broad for focused ownership and unit testing.
- Large client screens include `WorldPage.tsx`, `AdminPage.tsx`, `PetWorldPage.tsx`, `PetHousePage.tsx`, and `BattleArena.tsx`. Each combines display state, game rules, server calls, and interaction code.
- The frontend uses large base64/database-backed and attached image assets. Do not rename, move, compress, or bulk-process them as part of routine code refactors.

## Security-sensitive areas

- `server/auth.ts` contains the canonical authenticated-player and verified-administrator middleware. Privileged routes should use these guards rather than reimplementing role checks.
- `server/index.ts` owns Passport local authentication, session cookies, `SESSION_SECRET` production enforcement, rate limits, and the Stripe raw-body webhook boundary.
- Registration in `server/routes/account.routes.ts` must always use least-privilege defaults. `server/registration.ts` makes the fixed `isAdmin: false` and `isModerator: false` registration contract explicit.
- Admin-message deletion must stay username-scoped through `deleteAdminMessageForUsername`; never use the unscoped deletion method for a player route.
- `server/stripeClient.ts` handles Stripe credentials and Replit connector fallback. Webhook signing must remain intact.
- `server/db.ts`, `shared/schema.ts`, and runtime SQL in `server/index.ts` affect live Railway data. Follow `replit.md` database safety rules; do not force schema pushes or introduce destructive migrations.

## Reward-mutation map (2026-07 security audit)

For the complete badge and achievement route, client, storage, mutation, and
integrity audit, see [`BADGE_REWARD_AUDIT.md`](./BADGE_REWARD_AUDIT.md). The
audit documents the current non-transactional badge periodic-coin claim as the
safest focused follow-up; it makes no runtime or schema change.

| Claim/mutation path | Client request / trigger | Eligibility and claim state | Values and mutations | Transaction status |
| --- | --- | --- | --- | --- |
| Reward inbox bundles | `POST /api/rewards/:rewardId/claim` (reward inbox client) | `user_rewards.id`, `user_id`, `claimed`; verified authenticated user | Server bundle (`reward_bundles`, `reward_bundle_items`) grants configured coins and items; bait is quantity-stacked and pets remain individual inventory records | **Atomic/idempotent:** `server/rewardClaim.ts` coordinates one `db.transaction`, locks the owned reward, grants all value, then conditionally records claim. |
| Daily login | `DailyClaimCard` → `POST /api/daily-claim` | `player_daily_login_claims.claimed_at`, server `NOW()` and row lock | Server constants: coins, PvP/raid tickets, fishing rod | Existing transaction and server time; atomic. |
| Daily quests | daily quest UI → `POST /api/quests/daily/claim/:questKey` | owned `user_daily_quest_progress.completed/reward_claimed`, server Central date, locked row | Server `daily_quests.coin_reward`, `reward_item_id`, `reward_item_quantity` | **Atomic/idempotent:** `server/dailyQuestClaim.ts` coordinates a transaction that locks the current user's progress row, grants configured coins/items, then conditionally records the claim. |
| Badge periodic coins | Badge page → `POST /api/badges/claim-daily` | authenticated user's locked `user_badges`; locked `badge_reward_claims.last_claimed_at`; PostgreSQL `NOW()` | server badge reward configuration | **Atomic/idempotent:** `server/badgePeriodicClaim.ts` coordinates one transaction. A transaction-scoped advisory lock for `(user_id, badge_id)` serializes retry, concurrent, and first-claim requests; owned and existing claim rows are additionally locked with `FOR UPDATE`; coins and timestamp roll back together. |
| Purchase milestones | Coin shop → `POST /api/coins/claim-milestone` | purchase progress and `purchase_milestone_claims` | admin-configured milestone coins/item | **Follow-up:** claim record is written before grants and operations are not one transaction. |
| Fishing catch reward | Fishing UI → `POST /api/fishing/claim-catch-reward` | caught fish / claim state in storage | server fish reward | Follow-up focused audit required. |
| Tutorial rewards | tutorial UI → hatch-potions and `POST /api/tutorial/claim-reward` | user tutorial claim fields | fixed server potion/coin rewards | Follow-up: currently separate claim and grant mutations. |
| Petting, loyalty, molten blocks, world/KC, PvP battle rewards | corresponding game pages → reward endpoints | server player/pet/battle state | route-calculated coin, XP, item, and battle values | Follow-up: distinct gameplay flows; do not route through generic inbox abstraction. |
| Raid, referral/welcome, event/community and Stripe purchase rewards | server/webhook/admin/game triggers; inbox claim client | server-side event/purchase/raid state plus `user_rewards` where delivered by inbox | server/admin configured bundles, coins, badges, items | Inbox delivery is protected by the boundary above; distribution creation paths remain a focused follow-up for duplicate event issuance. |

The audited reward endpoints do not accept client coin values, item IDs/quantities, rarity, or completion results for the inbox flow: only the opaque reward identifier is accepted and it is ownership-scoped. Existing daily login eligibility uses database time, not client time. No schema change was made; systems without an existing durable claim record cannot gain complete idempotency without a separately planned schema/constraint review.

`server/rewardClaim.ts` is intentionally a small database-free coordinator. Its caller supplies transactional eligibility, reservation, grant, and permanent-record operations. Failure rolls back the enclosing database transaction; behavioral tests use an in-memory fake to verify retry, concurrent reservation, exact stack quantities, ineligibility, and all grant/record failure cases.

`server/badgePeriodicClaim.ts` is the analogous database-free coordinator for
`POST /api/badges/claim-daily`. The route accepts only `badgeId`; session
identity selects the user, and the transaction derives ownership, configured
coins, cadence, and eligibility from the database. It first takes
`pg_advisory_xact_lock(hashtext(user_id), hashtext(badge_id))`, which protects
the absent-claim-row first request without a schema constraint, then locks all
matching `user_badges` and `badge_reward_claims` rows with `FOR UPDATE`.
PostgreSQL `NOW()` is the cooldown clock. The coin `UPDATE` precedes the claim
timestamp update/insert inside the same transaction, so either failure rolls
back both. This protects concurrent first claims as long as all periodic claims
continue through this route/locking boundary. The schema still permits historic
duplicate `user_badges` or `badge_reward_claims` rows; a separate reviewed
cleanup followed by unique `(user_id, badge_id)` constraints remains the
recommended follow-up.

## Daily-quest mutation map (2026-07 claim audit)

### Routes and client callers

| API route | Caller / mutation source | Server-side authority and fields touched |
| --- | --- | --- |
| `GET /api/quests/daily` | `client/src/components/FloatingNav.tsx` TanStack query; invalidated after power-up, feeding, fishing, and related UI actions | Uses server Central (`America/Chicago`) date; reads active `daily_quests` and only the authenticated user's current `user_daily_quest_progress` row. Returns progress, completion, claim state, and configured display rewards. |
| `POST /api/quests/daily/seen` | `FloatingNav` when the quest log is opened | Uses authenticated user plus server Central date to upsert `user_quest_log_state.last_opened_date` and `has_unseen_completion`; it grants no reward. |
| `POST /api/daily-quests/progress` | `client/src/pages/MoltenBlocksPage.tsx` formerly posted `play_molten_blocks` after a browser timer | Preserved path now rejects mutation. Client-selected quest keys can no longer advance progress; verified game-action routes are the only progression sources. |
| `POST /api/quests/daily/claim/:questKey` | `FloatingNav` claim mutation; request body is empty | Resolves ownership from `req.user.id`, current date from server time, quest configuration from `daily_quests`, and item metadata from `shop_items`; it does not accept progress, completion, coins, item ID, quantity, goal, or reset data from the client. |
| `GET /api/admin/daily-quests`, `PATCH /api/admin/daily-quests/:questKey` | `client/src/pages/AdminPage.tsx` | Separate verified administrator configuration surface for existing server quest definitions. It is not a player claim boundary. |

### Progress, storage, and claim boundary

- `incrementQuestProgress` in `server/routes.ts` is called only after the server has processed these successful actions: `use_powerup`, `feed_pet`, `catch_fish`, and each owned fish sale. It uses server Central date, the active quest's server `target_count`, a `(user_id, quest_key, quest_date)` upsert, `LEAST(target_count, progress + 1)`, and a completed-row guard. Therefore progress does not become negative, cannot exceed its configured target, and does not advance once completed.
- `daily_quests` stores `quest_key`, `title`, `description`, `target_count`, `coin_reward`, `reward_item_id`, active status, and the runtime-managed `reward_item_quantity` column. `user_daily_quest_progress` stores `user_id`, `quest_key`, `quest_date`, `progress`, `completed`, and `reward_claimed`; its existing unique key is `(user_id, quest_key, quest_date)`. `user_quest_log_state` stores the non-reward log-open state.
- Rewards are coins and/or one configured shop item with its configured quantity. There are no daily-quest experience, bait-specific, pole-specific, or pet-specific client values: item kind is resolved from `shop_items`. Stackable items increment one canonical stack by the exact configured quantity under a transaction-scoped advisory lock; pets and fishing poles are durable individual inventory rows. This mirrors the inventory safety distinction without calling a non-transactional storage method from inside the claim transaction.
- `server/dailyQuestClaim.ts` is a database-free coordinator. The claim route opens one `db.transaction`, locks the authenticated user's current progress row with `FOR UPDATE`, rejects incomplete/claimed/previous-day rows, resolves the active server quest, grants coins and items, then conditionally changes `reward_claimed` from false to true. Any grant or final-record failure throws and rolls back the same transaction. The row lock plus conditional final update makes repeat and concurrent claims idempotent.

### Remaining limitation and recommended follow-up

- This audit intentionally did not alter schema. The existing per-user/per-quest/per-date unique progress key is sufficient to serialize a claim after the progress row exists. Stale prior-day rows are retained as historical progress but cannot be read or claimed by current-day queries; cleanup/retention is a separate non-reward data-maintenance decision.
- The browser-timer Molten Blocks progress call is now rejected rather than trusted. A future gameplay-focused change should add a server-verifiable Molten Blocks session/action boundary before restoring that quest's progression trigger; do not re-enable a client-selected progress endpoint.
- **Recommended next follow-up: badge rewards.** Give `POST /api/badges/claim-daily` the same owned-row lock, transaction, and conditional claim-record boundary; do not mix it with this daily-quest implementation.

## Remaining Replit dependencies

## Fishing and aquarium audit (2026-07)

The complete route-by-route fishing and aquarium audit is
[`FISHING_SYSTEM_AUDIT.md`](./FISHING_SYSTEM_AUDIT.md). It is documentation
only and records the live behavior rather than changing it.

- **Primary client files:** `client/src/pages/FishingPage.tsx` (world fishing,
  equipment, catch, fish book and pond administration), `AquariumPage.tsx`
  (tank ownership/display), `SellFishPage.tsx` (fixed-price sale),
  `MarketPage.tsx` (fish marketplace), `WorldPage.tsx` (opens fishing),
  `FloatingNav.tsx` (opens aquarium), and `components/FishingAdminPanel.tsx`
  (fish/bait/pole/part administration).
- **Primary routes/helpers:** `server/routes.ts` registers the fishing,
  aquarium, pond, fish-part, fish-barrel, player-market, and generic shop
  configuration paths. Its catch handler calls `incrementQuestProgress`,
  `maybeAwardFisherBadges`, and `maybeAwardFishBookBadge`; those badge helpers
  intentionally remain outside the extracted `server/routes/badge.routes.ts`
  HTTP module. `server/storage.ts` supplies fish inventory, catch log, pond,
  equipment/consumption, aquarium, coin, leaderboard, and market operations.
- **Primary tables:** `shop_items`, `world_locations`, `pond_fish`,
  `player_fish_inventory`, `player_fish_catch_log`,
  `player_fishing_equipment`, `user_inventory`, `users`,
  `fishing_leaderboard`, `player_aquarium_unlocks`, `fish_template_parts`,
  `fish_barrels`, and `player_market_listings`. `shared/schema.ts` declares
  most of these; some runtime/raw-SQL tables and constraints need production
  catalog verification.
- **Cross-domain dependencies:** fishing changes inventory fish/bait/poles,
  coins and lifetime earnings, daily quest progress, fisher/fish-book badges,
  world locations/leaderboards, aquarium flags/unlocks, player-market listings,
  and administrator catalog/world configuration.
- **Highest-priority follow-up:** make `POST /api/fishing/claim-catch-reward`
  transactional and idempotent, after production DDL/data inspection. It is
  the smallest confirmed direct coin-integrity issue and should be covered by
  parallel/retry/failure tests before broader catch changes.
- **Confirmed risks:** client `performanceScore=100` guarantees a catch and a
  valid client fish ID chooses a stocked fish; `/api/fishing/inventory/add`
  permits authenticated fish minting; catch-reward claim flag and coins are
  separate writes; catch, sale, aquarium unlock, aquarium state, and fish
  market conversions lack complete cross-record transaction boundaries.
- **Requires verification:** production uniqueness/duplicate data for fish
  catch logs; exact parallel aquarium outcomes; verified-admin policy for
  manual fishing admin checks; and existing live indexes/constraints before
  migrations. Do not extract fishing writes until shared badge/quest helpers
  can be dependency-injected and characterization tests describe live paths.

- Vite includes Replit development plugins (`@replit/vite-plugin-*`) when Replit environment variables are present.
- `server/stripeClient.ts` can obtain Stripe credentials through Replit connector environment variables and uses `stripe-replit-sync`.
- `server/db.ts` retains `DATABASE_URL` as a non-production/Replit-compatible fallback, while preferring Railway.
- `replit.md` remains operational documentation, but production build, start, and health settings are in `railway.toml`.

## Small, prioritized future refactoring PRs

1. **Extract route modules by domain:** move one self-contained route group at a time from `server/routes.ts`, retaining exact paths, middleware, and responses; add route-level tests before each extraction.
2. **Separate startup migrations from bootstrap:** preserve their idempotency and order while moving `server/index.ts` schema/backfill helpers into focused modules.
3. **Split storage by domain behind the existing interface:** begin with low-risk read-only areas such as forum/social or fishing; do not change schema behavior.
4. **Extract pure game-rule helpers from large screens/routes:** start with battle, fishing, or pet-care calculations and cover existing economy values with characterization tests.
5. **Decompose `AdminPage.tsx`:** separate panels and API hooks without changing admin paths or role behavior.
6. **Reduce connector coupling:** make Stripe configuration explicitly provider-driven after production parity tests, retaining the current Replit fallback until migration is planned.
7. **Add focused integration test helpers:** provide an in-memory Express harness and storage fakes for additional authorization and ownership tests without requiring Railway access.
