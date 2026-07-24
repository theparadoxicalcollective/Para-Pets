# Badge and achievement reward audit

**Scope:** static, read-only audit of the badge/achievement implementation as of
2026-07-24.  No distinct `achievement` model, route, or client module exists;
this document treats the `badges`, `user_badges`, and `badge_reward_claims`
system as the complete achievement system. This is documentation, not a
runtime, schema, balance, UI, asset, gameplay, or production-data change.

## Executive result

- **Confirmed — player claims are server-authoritative.** The only player claim
  body is an opaque `badgeId`. The server derives the player from `req.user.id`,
  confirms ownership through `user_badges`, reads the coin amount and cadence
  from the joined badge definition, and updates only that user's balance.
  Clients do not send progress, completion, unlock state, coins, item IDs,
  quantities, rarity, pet IDs, or reward values.
- **Resolved — the periodic-coin claim is transactional and idempotent.**
  `POST /api/badges/claim-daily` now obtains a transaction-scoped PostgreSQL
  advisory lock for the authenticated `(user_id, badge_id)` pair, locks all
  matching owned-badge and claim rows, rechecks the server-owned definition and
  cooldown with PostgreSQL `NOW()`, grants coins, and writes the timestamp in
  one transaction. A grant or timestamp failure rolls back both mutations.
- **Likely — duplicate prevention is not durable.** `awardBadge` uses a
  read-then-insert check, while the declared `user_badges` table has no unique
  `(user_id, badge_id)` constraint. Concurrent automatic or administrator
  awards can insert duplicate unlock rows. A database unique constraint is
  required for reliable duplicate prevention; application checks alone cannot
  provide it.
- **Needs verification — existing production indexes/constraints.** The
  declared Drizzle schema has no uniqueness constraints for `user_badges` or
  `badge_reward_claims`; startup creates ordinary indexes for `user_badges`.
  Inspect the live PostgreSQL catalog before asserting that an out-of-band
  migration has not added a unique constraint.

## API routes and client callers

### HTTP registration boundary

Badge and achievement HTTP registrations now live in `server/routes/badge.routes.ts`.
`server/routes.ts` injects the authenticated-player middleware, storage, Drizzle
database, and shared `processWorldImage` helper, and invokes the module in
three registration phases so the original ordering around unrelated emblem and
avatar routes remains unchanged. The profile badge read route is registered at
its original earlier position through the same module.

Badge award and backfill helpers intentionally remain in `server/routes.ts`:
fishing calls the fisher/fish-book award helpers, PvP calls the brawler helper,
purchases call acquisition awards, and startup invokes backfills. Moving those
shared functions would broaden this organization-only change and risks
gameplay-flow coupling. The recommended next small follow-up is to extract
those award definitions/helpers behind a dependency-injected service after
adding focused award-trigger characterization tests.

| Route | Auth / actor | Client caller(s) | Effect |
| --- | --- | --- | --- |
| `GET /api/badges` | Authenticated player | `BadgePage`, `AdminPage` query cache | Lists definitions; hides hidden badges from non-owners/non-admins. |
| `GET /api/user/badges` | Authenticated player | `BadgePage` | Lists current player's unlocks and joined claim timestamp. |
| `GET /api/users/:userId/badges` | Authenticated player | `PlayerDetailPanel`, `FriendProfileModal` | Reads another player's badges; no mutation. |
| `POST /api/badges/claim-daily` | Authenticated, email-verified player | `BadgePage` / `BadgeClaimButton` | Claims configured badge coins using `{ badgeId }`. Despite its name, supports daily, weekly, and monthly cadences. |
| `POST /api/admin/badges` | Authenticated session with `isAdmin` | `AdminPage` / `BadgeDatabaseSection` | Creates a definition from admin-supplied metadata/image. |
| `PATCH /api/admin/badges/:id` | Same | `AdminPage`; `BadgePage` has an admin edit popup | Changes definition/reward metadata. |
| `DELETE /api/admin/badges/:id` | Same | `AdminPage` | Deletes definition, unlock rows, and claim rows. |
| `GET /api/admin/badges/:id/recipients` | Same | `AdminPage` | Lists recipients. |
| `POST /api/admin/badges/:id/award` | Same | `AdminPage` | Manually awards the path badge to body `userIds`. |
| `POST /api/admin/badges/:id/revoke` | Same | No current UI mutation located | Revokes the path badge from body `userIds`. |
| `GET /api/badges/leaderboard` | No route middleware | No client caller located | Read-only Hall of Earnings with badge images. |
| `GET /api/badges/leaderboard/devotion` | No route middleware | No client caller located | Read-only devotion leaderboard with badge images. |

All listed client components are the badge-related components found. No client
request can update badge progress or self-unlock a badge. `App.tsx` only mounts
`BadgePage` at `/badges`; it does not make badge API requests itself.

## Data model, storage methods, and direct SQL

### Badge tables and fields

| Table | Fields and role |
| --- | --- |
| `badges` | `id`, `name`, `image_url`, `daily_reward_coins`, `claim_type`, `badge_points`, `rarity`, `obtain_description`, `hidden`, `created_at`. This is the reward and display-definition source. There are no item, pet, XP, title, cosmetic, or inventory reward fields. |
| `user_badges` | `id`, `user_id`, `badge_id`, `awarded_at`. This is the permanent unlock relation. No progress, reset, completion, or claim columns exist. |
| `badge_reward_claims` | `id`, `user_id`, `badge_id`, `last_claimed_at`. This is the last periodic-coin claim timestamp, not an immutable claim ledger. |
| `users` | `id`, `coins`, `total_coins_earned`, and `total_fish_caught` participate in authenticated ownership, coin grant, leaderboard, and fisher eligibility. |
| `pvp_battles`, `coin_purchases`, `player_fish_catch_log`, `pond_fish`, `world_locations` | Server-side eligibility evidence for brawler, acquisition, and fish-book badges. |

### Storage/database mutation points

- Definition CRUD: `getAllBadges`, `getBadgeByName`, `createBadge`,
  `updateBadgeDailyReward`, `updateBadge`, and `deleteBadge`. Deletion issues
  three separate deletes (`user_badges`, `badge_reward_claims`, then `badges`),
  without a transaction.
- Unlock lifecycle: `getUserBadges` joins definitions to claims; `awardBadge`
  selects the pair and then inserts; `revokeBadge` deletes the pair;
  `getBadgeRecipients` reads holders.
- Claim lifecycle: `getBadgeRewardClaim` reads a pair; `upsertBadgeRewardClaim`
  reads then updates or inserts the timestamp with application `new Date()`.
- Coin reward: `storage.addCoins(user.id, reward)` performs one SQL `UPDATE`
  with `GREATEST(0, coins + amount)` and increases `total_coins_earned` for
  positive amounts. Badge claims do not use inventory, purchase, consumption,
  or reward-inbox helpers, because their only implemented reward is coins.
- Direct badge-related SQL in `server/routes.ts`: fish-book completion counts
  distinct pond species and user catch-log species; startup backfills count PvP
  wins, select qualifying fish totals, and group purchase rows. `server/index.ts`
  creates non-unique indexes on `user_badges.user_id`, `user_badges.badge_id`,
  and `badges.name`.

## Mutation map

| Player/admin action | Client/request or server trigger | Authenticated identity | Server eligibility and state | Reward/unlock mutation; transaction/idempotency |
| --- | --- | --- | --- | --- |
| Claim periodic coins | `BadgeClaimButton` → `POST /api/badges/claim-daily` with `badgeId` | `req.user.id`; email verification required | Locks only that user's owned badge rows and corresponding claim rows, takes coin/cadence from `badges`, and compares `last_claimed_at` with PostgreSQL `NOW()` (24h/7d/30d) | **Atomic/idempotent:** `server/badgePeriodicClaim.ts` coordinates one transaction. A pair advisory lock also serializes the no-claim-row first-claim case; coin grant and timestamp update/insert roll back together. |
| Successful fishing catch | `FishingPage` flow → fishing catch route; no badge request | `req.user.id` in catch route | After catch/logging, increments server `users.total_fish_caught`; fish-book query counts server catch-log entries for the server-loaded location world | Awards permanent `user_badges` rows for 300/500/750 catches and complete biome books. **Likely not concurrency-safe** due to read-then-insert award; no reward is automatically granted at unlock beyond eligibility for periodic coin claims. |
| Recorded PvP win | PvP result request → route records battle | `req.user.id` | Counts persisted wins after a server-recorded result | Awards 100/300/500-win `user_badges`; fire-and-forget after response. **Likely duplicate-prone** without unique pair constraint; no transaction with battle record. |
| Completed Stripe purchase | Verify route or Stripe webhook → `maybeAwardAcquisitionBadges` | Verified session owner in verify route; Stripe session metadata/webhook for webhook | Server purchase amount; daily total from stored purchases | Awards $25, >=$100, and >=$500 daily-spend badge rows. Fire-and-forget and not in purchase transaction; duplicate-pair concern applies. Unlock has periodic coins only, claimed separately. |
| Startup reconciliation | `server/index.ts` invokes seed/backfill functions | Server process | Queries persisted PvP, fish, fish-book, and purchase history | Creates missing definitions and awards qualifying unlocks. **Likely duplicate-prone** without a pair constraint; safe to rerun only if no concurrent duplicate inserts occur. |
| Administrator creates/edits/deletes/rewards/revokes | `AdminPage` calls admin routes | `req.user.isAdmin` | Path badge ID/body recipient IDs are accepted; no existence/recipient validation before storage operation | Changes definitions or `user_badges`; no player reward grant. **Confirmed manual/admin grant path.** Admin routes use manual `isAdmin` checks, not the canonical `requireAdmin` middleware that also requires verified, current administrator status. |

### Reward behavior and lifecycle answers

- **Benefits:** badge points are display/leaderboard metadata only; implemented player value is configured periodic **coins only**. No badge flow grants items, pets, experience, titles, cosmetics, or other inventory benefits.
- **Automatic versus claim:** unlocks are automatic from successful server-side gameplay/payment triggers or manual by admins. Coins are never granted at unlock; each eligible badge's coins require the separate claim route.
- **Repeatability:** unlocks are intended non-repeatable. Coin rewards are repeatable every daily/weekly/monthly cooldown. There is no finite “claimed once” achievement reward.
- **Progress/reset:** no generic badge-progress table or client progress mutation exists. Fisher/PvP/acquisition evidence is cumulative/persistent. Fish-book evidence is persistent catch history. Claims reset by elapsed server process time; no daily/seasonal badge progress reset exists.

## Security and integrity assessment

### Confirmed

1. **Administrator badge routes do have an admin check, but do not use the
   repository's verified-admin guard.** They require `isAuthenticated` and
   `req.user.isAdmin`, but omit the `emailVerified` requirement and canonical
   `requireAdmin` middleware. This is a confirmed policy inconsistency, not a
   claim that an unauthenticated player can use the routes.
4. **No client-controlled player reward values/completion flags were found.**
   Badge IDs are accepted from the claim client, but ownership and definition
   lookup occur server-side. One player cannot claim another player's badge
   through this route because the lookup is scoped to `req.user.id`.

### Likely

1. **Concurrent badge awards can create duplicate unlock rows.** `awardBadge`
   is select-then-insert and both pair tables lack declared unique constraints.
   This affects automatic award, backfill, and admin paths. It can also make
   `getUserBadges` return duplicate cards and make a claim join ambiguous.
2. **Concurrent first claims can create duplicate claim rows.** The claim
   upsert is itself read-then-insert; without a unique `(user_id, badge_id)`
   constraint, simultaneous first claims may create multiple timestamp rows.
3. **Definition creation races can duplicate badge definitions.**
   get-or-create helpers use `getBadgeByName` then `createBadge`, while the
   startup name index is non-unique. This is lower player-impact than coin
   claims but should be considered in the same constraint review.

### Needs verification

1. Inspect production DDL/indexes and existing data for unique pair
   constraints and duplicate `user_badges`/`badge_reward_claims` rows. The
   source schema alone cannot establish production history.
2. Load-test parallel claim requests against a disposable database to quantify
   duplicate grants and verify failure behavior of `addCoins` versus the claim
   write. Do not test this against production balances.
3. Confirm whether the administrator policy intentionally permits unverified
   admin accounts; if not, replace manual checks with `requireAdmin` in a
   focused authorization PR.
4. Audit the upstream fishing and PvP result boundaries separately. Badge
   functions use server-stored outputs, but this audit does not prove each
   underlying action cannot itself be forged or recorded more than once.

### Safe as implemented

- The claim route uses session identity and scoped ownership, not a client user
  ID; cross-player claim access was not found.
- Coin amount, cadence, unlock status, fisher counts, fish-book completion,
  PvP wins, and purchase thresholds are server-derived. No client-controlled
  badge progress/unlock/reward amount, item/pet/rarity/quantity field exists.
- Negative/impossible badge progress and progress beyond a maximum do not apply
  to this model: it has threshold evaluation against stored counts, not mutable
  progress counters. Fisher thresholds only unlock once as intended, subject to
  the duplicate-row race above.
- No badge unlock is based on client time. Client countdowns are presentation
  only; periodic claim cooldown is rechecked using PostgreSQL `NOW()` inside
  the locked transaction.
- Badge rewards do not bypass a required inventory helper: the implementation
  has no badge item/pet/inventory reward. Their direct `addCoins` call is the
  sole configured benefit and should be included in the future transaction.

## Recommended small follow-up PRs

1. Add schema migrations for unique `(user_id, badge_id)` constraints on both
   `user_badges` and `badge_reward_claims`, after a reviewed duplicate-data
   cleanup/migration plan. Use database-native upserts/conflict handling in
   award and claim storage methods.
3. Make automatic award/backfill definition creation race-safe with a unique
   badge-name policy (if names are intended identifiers) or stable keys, then
   use conflict-safe insert behavior.
4. Replace manual badge-admin authorization checks with `requireAdmin` and add
   route authorization tests, if the verified-administrator policy is intended.
5. Add an integration test matrix for owner scoping, cooldowns, duplicate
   requests, database write failure rollback, and duplicate historical rows.
