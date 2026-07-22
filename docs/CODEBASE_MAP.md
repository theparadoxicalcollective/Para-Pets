# Para Pets codebase map

This document describes the current production architecture on `main` after the Safety Foundation merge. It is a navigation aid, not a change plan; preserve the live game’s routes, economy, assets, and Railway configuration when working in these areas.

## Runtime architecture

- **Client:** `client/src/` is a React 18, TypeScript, Vite, Tailwind application. `client/src/App.tsx` owns routing and global overlays; `client/src/pages/` contains screen-level game experiences; `client/src/components/` contains reusable game UI and admin panels. Wouter manages client routing and TanStack Query manages server state.
- **Server:** `server/index.ts` builds the Express process, configures compression, rate limits, sessions, Passport, static assets, startup migrations, and production/development serving. `server/routes.ts` registers the API surface. `server/storage.ts` is the application data-access layer over Drizzle/PostgreSQL.
- **Persistence:** `shared/schema.ts` declares Drizzle tables and shared types. `server/db.ts` selects `RAILWAY_DATABASE_URL` first and retains `DATABASE_URL` as a fallback. Railway PostgreSQL is the production source of truth.
- **Build/deploy:** `script/build.ts` builds the Vite client and bundles the server to `dist/index.cjs`. `railway.toml` starts that bundle and checks `GET /health`.

## Major game systems

| System | Primary locations |
| --- | --- |
| Identity, accounts, verification, bans, sessions | `server/index.ts`, `server/auth.ts`, registration and account routes in `server/routes.ts` |
| Pets, inventory, accessories, care and houses | `client/src/pages/PetCarePage.tsx`, `PetHousePage.tsx`, `PetInventoryPage.tsx`; relevant routes/storage/schema |
| World exploration, locations, cave combat | `client/src/pages/WorldPage.tsx`, `PetWorldPage.tsx`, `LavaCrawlPage.tsx`, `server/routes.ts` |
| PvP and raid battles | `client/src/pages/PvpArenaPage.tsx`, `PvpBattlePage.tsx`, `RaidPage.tsx`; `server/seedPvpBots.ts` |
| Fishing and aquarium | `client/src/pages/FishingPage.tsx`, `AquariumPage.tsx`, fishing routes and storage methods |
| Economy, shops, inventory and Stripe purchases | `client/src/pages/CoinShopPage.tsx`, `MarketPage.tsx`, `server/stripeClient.ts`, Stripe webhook/routes |
| Social features | `ForumPage.tsx`, `FriendsPage.tsx`, `WorldChatPanel.tsx`, support and admin-message routes |
| Content administration | `client/src/pages/AdminPage.tsx` plus admin panels; protected API routes in `server/routes.ts` |

## Oversized and tightly coupled areas

- `server/routes.ts` (~10k lines) combines account handling, gameplay rules, content management, payments, and API registration. It is the highest-value route-extraction target.
- `server/index.ts` (~3.7k lines) combines HTTP bootstrap with runtime schema maintenance, migration/backfill work, seeding, and static/Vite setup. Boot concerns should eventually be isolated without changing ordering.
- `server/storage.ts` (~3.6k lines) centralizes all data access. It is a useful boundary but too broad for focused ownership and unit testing.
- Large client screens include `WorldPage.tsx`, `AdminPage.tsx`, `PetWorldPage.tsx`, `PetHousePage.tsx`, and `BattleArena.tsx`. Each combines display state, game rules, server calls, and interaction code.
- The frontend uses large base64/database-backed and attached image assets. Do not rename, move, compress, or bulk-process them as part of routine code refactors.

## Security-sensitive areas

- `server/auth.ts` contains the canonical authenticated-player and verified-administrator middleware. Privileged routes should use these guards rather than reimplementing role checks.
- `server/index.ts` owns Passport local authentication, session cookies, `SESSION_SECRET` production enforcement, rate limits, and the Stripe raw-body webhook boundary.
- Registration in `server/routes.ts` must always use least-privilege defaults. `server/registration.ts` makes the fixed `isAdmin: false` and `isModerator: false` registration contract explicit.
- Admin-message deletion must stay username-scoped through `deleteAdminMessageForUsername`; never use the unscoped deletion method for a player route.
- `server/stripeClient.ts` handles Stripe credentials and Replit connector fallback. Webhook signing must remain intact.
- `server/db.ts`, `shared/schema.ts`, and runtime SQL in `server/index.ts` affect live Railway data. Follow `replit.md` database safety rules; do not force schema pushes or introduce destructive migrations.

## Remaining Replit dependencies

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
