# Para Pets codebase map

Last reviewed: 2026-07-22. This map describes the current implementation; it
does not certify that every feature is complete or safe for production changes.

## Runtime architecture

- **Client:** React/Vite application in `client/src`. `App.tsx` owns route and
  overlay composition; `pages/` contains screens, `components/` contains both
  shared UI and several feature-sized modules, and `lib/` contains client
  helpers/state utilities.
- **Server:** Express application starts in `server/index.ts`; it configures
  rate limits, session/passport middleware, request logging, the `/health`
  endpoint, runtime SQL setup, static/Vite hosting, Stripe initialization, and
  background seed/refresh work. `server/routes.ts` registers nearly all API
  endpoints. `server/storage.ts` is the database access layer.
- **Data:** `shared/schema.ts` is the Drizzle schema and shared type source.
  `server/db.ts` selects `RAILWAY_DATABASE_URL` first, then `DATABASE_URL`.
  Runtime-created tables/migrations in `server/index.ts` must not be changed
  through Drizzle schema pushes (see `replit.md`).
- **Deployment:** `railway.toml` builds with `npm run build`, runs `npm run
  start`, and probes `/health`. `server/static.ts` serves the production bundle;
  `server/vite.ts` configures development hosting.

## System ownership map

| System | Primary implementation | Notes |
| --- | --- | --- |
| Authentication, users, sessions | `server/index.ts`, `server/auth.ts`, `server/routes.ts`, `server/storage.ts`, `client/src/pages/AuthPage.tsx` | Passport local sessions; email verification and recovery routes are in `routes.ts`. |
| Admin authorization | `server/auth.ts`, admin routes in `server/routes.ts`, `client/src/pages/AdminPage.tsx` | Shared helper requires a current verified admin; several older routes still perform inline role checks and should be consolidated. |
| Pets, eggs, care, accessories | `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, `PetInventory*`, `PetDetail*`, `PetCarePage`, `PetAnimator*` | Hatching, stats, care, power-ups, accessories, templates, and animation are tightly connected. |
| Inventory, coins, shops, market, gifts | `server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, `BagInventoryPage`, `MarketPage`, `CoinShopPage` | Ownership and balance mutations are server routes but are concentrated in one large file. |
| Fishing and aquarium | fishing routes/storage/schema, `FishingPage`, `AquariumPage`, `FishingAdminPanel` | Includes equipment, catch, inventory, ponds, leaderboards, sell flow, aquarium, and admin data. |
| Worlds and exploration | world/location routes/storage/schema, `WorldPage`, `PetWorldPage`, `MapPage`, `WalkAroundScene` | World layouts, decor, locations, enemies, and positions interact with assets and startup seeding. |
| Quests, login rewards, badges | `server/index.ts`, `server/routes.ts`, `server/storage.ts`, `BadgePage`, `DailyClaimCard` | Several runtime SQL tables and background backfills are involved. |
| PvP and combat | `server/routes.ts`, `server/storage.ts`, `BattleArena`, `PvpArenaPage`, `PvpBattlePage` | Matchmaking, battle records/groups, tickets, reward paths, and leaderboards. |
| Raids | raid routes/storage/schema, `RaidPage`, `RaidBattlePage`, `RaidLeaderboardPage` | Shared boss state, damage, rewards, visibility, admin controls. |
| Chat, forum, friends, support | `WorldChatPanel`, `ForumPage`, `FriendsPage`, routes/storage/schema | Chat filters, moderation, support inboxes, posts/comments, gifting, and profile access. |
| Admin tools | `AdminPage`, `PetDatabasePanel`, `ItemDatabaseSection`, `FishingAdminPanel`, `ExploreAdminPanel`; `/api/admin/*` in routes | Content and live game controls span many tables and upload paths. |
| Payments | `server/stripeClient.ts`, `server/webhookHandlers.ts`, routes, `CoinShopPage` | Stripe checkout/webhooks plus contribution milestones and reward delivery. |
| Email | `server/routes.ts` via Resend | Registration verification and password reset. |
| Uploads/media | Sharp handling in routes/index, `media_blobs`, `server/static.ts` | Data URLs, stored media blobs, and world assets are all in use. |
| Assets | `client/src/assets`, `attached_assets` at runtime, DB image URLs | Do not delete or rename without a URL/reference inventory. |
| Scripts | `scripts/dump-railway-prod.ts`, `scripts/inspect-crimson-parts.ts`, `script/build.ts` | Production dump script is recovery-only; `post-merge.sh` is intentionally no-op. |

## Stability baseline and refactoring hazards

### Oversized and coupled files

- `server/routes.ts` is the main risk area: it holds auth, economy, gameplay,
  admin, social, uploads, and payments in one approximately 475 KB module.
- `server/index.ts` combines HTTP bootstrap with runtime table creation,
  migrations, seed data, static hosting, and Stripe startup.
- Large client modules include `WorldPage.tsx`, `AdminPage.tsx`,
  `PetWorldPage.tsx`, `BattleArena.tsx`, `PetHousePage.tsx`, `FishingPage.tsx`,
  `PetAnimator.tsx`, and the PvP pages. Split only behind stable component
  interfaces and preserve existing route/asset URLs.
- `server/storage.ts` is a broad repository for unrelated features. It is a
  useful future seam, but changing method behavior can affect many routes.

### Security-sensitive paths

- Session/auth/admin authorization, password reset, email verification, and
  account deletion.
- Any route mutating coins, essence, inventory, pets, listings, rewards,
  tickets, damage, scores, or drops.
- Stripe webhooks, checkout verification, Resend delivery, uploads/Sharp,
  media serving, and all `/api/admin/*` routes.
- Production database selection, runtime SQL, schema tooling, and dump/restore
  scripts. Never run force/accept-data-loss schema commands against Railway.

### Known coupling, duplication, and incomplete-risk areas

- Authentication is now shared in `server/auth.ts`, but older route blocks
  retain direct `req.user.isAdmin`/moderator checks. Migrate one route group at
  a time with tests.
- Runtime database changes are split between `server/index.ts`, Drizzle schema,
  and startup seeds. This makes startup order and production rollback sensitive.
- Server-side reward/control boundaries are uneven: future work should audit
  raid damage/rewards, mini-game score/rewards, PvP results, and fishing catch
  inputs before client refactors.
- API route names and client fetch calls are coupled by string paths; no central
  route contract exists. Do not rename routes in a cleanup PR.
- `new_version.tsx`, `old_version.tsx`, `pvp_diff.patch`, and
  `artifacts/mockup-sandbox/` are historical/experimental material, not normal
  production runtime sources. Preserve them until an owner-approved inventory.

### Replit-specific dependencies to isolate later

- `stripe-replit-sync` and its startup migration integration.
- `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, and
  `@replit/vite-plugin-runtime-error-modal` in Vite development configuration.
- `REPLIT_*` environment fallbacks in Stripe/domain setup. Railway remains the
  production host/database source of truth.

## Test and CI boundary

`npm test` uses Node's built-in TypeScript-compatible test runner through
`tsx`; tests have no network or database credentials. `.github/workflows/ci.yml`
runs type checking, tests, and production build for pull requests and pushes to
`work`. The health test verifies the deployed health-check contract rather than
starting the full application, because current startup intentionally performs
database/runtime SQL and background initialization.

## Safe next pull requests (priority order)

1. Add route-level tests for the remaining inline admin/moderator checks, then
   move one bounded admin route group to `server/auth.ts`.
2. Introduce a non-production migration inventory and isolate startup SQL from
   seed/refresh work without changing the production schema.
3. Add server-owned validation tests for coins, inventory ownership, market
   transfers, and purchase/webhook idempotency.
4. Extract the authentication and user route block from `server/routes.ts`
   without changing URL paths or responses.
5. Extract fishing as a route/storage feature slice with catch/reward tests.
6. Audit PvP, raids, and mini-game endpoints so client input cannot determine
   scores, damage, coins, or drops.
7. Add an asset registry/reference report before any duplicate cleanup or file
   renaming.
