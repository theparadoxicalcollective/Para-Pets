# Player marketplace integrity audit

## Confirmed route and caller inventory

All marketplace HTTP registrations remain in `server/routes.ts`. Reads are `GET /api/market`, `GET /api/market/my-listings`, `GET /api/market/listing/:listingId/item-details`, and `GET /api/market/listing/:listingId/pet-details`. Mutations are `POST /api/market/list`, `POST /api/market/list-pet`, `POST /api/market/list-fish`, `POST /api/market/:listingId/buy`, `POST /api/market/:listingId/collect`, `DELETE /api/market/:listingId`, and the separate slot purchase `POST /api/market/buy-slot`. `MarketPage.tsx` is the only marketplace caller: its browse and my-shop queries call the reads; its list, fish-list, buy, collect, cancel, and slot mutations call the corresponding mutations. Pet listing uses the dedicated atomic `list-pet` route so egg conversion and escrow cannot partially succeed.

The lifecycle uses `users` (identity, coins, earned coins, extra slots), `shop_items` (server item metadata and eligibility), `user_inventory` (general items, individual pets, stack quantities, and fish escrow), `player_fish_inventory` (one row per caught fish), and `player_market_listings` (escrow reference, seller snapshot, price, active/sold state, buyer, and pending seller proceeds). General inventory supports stack rows and individual rows; the marketplace preserves the existing behavior of transferring the complete selected row. Pets are supported only as unhatched egg inventory rows. Fish use individual fish rows and are converted to a listed `user_inventory` escrow row. No marketplace quantity parameter or partial-stack listing exists.

Storage reads remain `getMarketListings`, `getMyMarketListings`, and `getMarketListing`. The former mutation helpers (`createMarketListing`, `buyMarketListing`, `collectMarketCoins`, `cancelMarketListing`, fish conversion helpers, coin helpers) remain for interface compatibility but the public value-moving routes no longer call them. Core writes are owned by `server/marketplace/transactions.ts`.

## Original lifecycle and risks

* **List general item:** route read inventory, metadata, and slot count; `createMarketListing` set `is_listed`, then inserted the listing in separate autocommit statements. Insert failure stranded the item as listed; concurrent requests could both pass the checks.
* **List fish:** route deleted the fish and inserted general-inventory escrow in separate statements, then set escrow listed and inserted the listing through another helper. Any intermediate failure could destroy or strand value, and retries could not reliably reconcile.
* **Buy:** route read active state, debited the browser's authenticated user, changed listing state, changed general ownership, and then performed fish conversion or pet hatch backdating in additional statements. A losing buyer was refunded separately. Fish and hatch errors were logged and swallowed, so a charged buyer could miss the fish or receive inconsistent pet state. Concurrent buyers could both update an active listing because the status update was not conditionally guarded. A lost response could cause another debit attempt.
* **Cancel:** route read the listing, unlisted/deleted it, then separately converted fish escrow back; fish return errors were swallowed. A buy/cancel race or retry could lose or duplicate ownership.
* **Collect:** route selected then deleted the sold listing and separately credited coins. A credit failure destroyed proceeds; concurrent collection could credit more than once.

The browser supplied inventory/fish identifiers and player-selected price for listing, plus listing identifiers for buy/cancel/collect. It did not normally supply seller or buyer IDs, but handlers and storage were not a single authority boundary. There were no client idempotency keys. Buttons disabled some pending purchases, but server safety depended neither consistently nor durably on that UI.

## Current transaction boundaries and lock order

Every core operation runs in one PostgreSQL transaction and derives identity from the authenticated session.

* **Create:** validate price on the server; lock seller `users` row; lock the exact owned inventory/fish row; resolve `shop_items`; recheck eligibility and server slot count; escrow/remove ownership; insert listing. General inventory uses a conditional `is_listed = false` update. Fish deletion, escrow insertion, and listing insertion commit together.
* **Buy:** lock listing; validate active state and actor; lock buyer `users` row; conditionally debit the stored listing price; lock escrow; transfer the exact escrow to general inventory or fish inventory; conditionally mark active listing sold with its authenticated buyer. Pet egg hatch backdating remains inside this transaction. The sold listing itself is the single committed seller-proceeds record.
* **Cancel:** lock listing; verify authenticated seller and active state; lock escrow; return it using its category-specific ownership model; conditionally delete the active listing. All return writes roll back if deletion fails.
* **Collect:** lock sold listing/proceeds record; verify authenticated seller; lock seller `users` row; credit the stored listing price and lifetime-earned counter; conditionally delete the sold listing. Credit and collected state commit together.

The consistent ordering is listing before user/escrow for existing listings, and user before new item escrow for creation. A listing serializes buy versus cancel and competing buyers. The user lock serializes balance changes and same-seller slot checks. Exact inventory rows are locked before escrow mutation. Core errors are never swallowed; PostgreSQL rolls the transaction back.

## Retry, response loss, and status lifecycle

Listings retain the existing `active -> sold -> deleted-on-collection` lifecycle; active cancellation deletes the row after returning escrow. A same-buyer retry after committed purchase sees the locked sold row and receives the already-committed price with `replayed: true`, without debit or transfer. A competing buyer deterministically receives `already_sold`. Create retries find the selected general row already listed or the selected fish row absent, so inventory is not removed twice. Cancel retries and collect retries find no row and deterministically report already cancelled/collected; they cannot return or credit twice. Two collectors serialize on the listing row, and only the first can credit before deletion. Buy versus cancel serializes on the same listing and yields exactly one final state.

## Schema findings

`player_market_listings.id`, `user_inventory.id`, `player_fish_inventory.id`, `shop_items.id`, and `users.id` are primary keys. The Drizzle marketplace declaration has no foreign keys, check constraints, expiry timestamp, proceeds table, status check, unique inventory reference, or quantity column. Runtime startup creates only the existing seller index for marketplace listings and backfills image snapshots; no additive marketplace constraint is introduced here. Repository startup cleanup can delete malformed marketplace references, so production catalog verification remains advisable before adding foreign keys or uniqueness constraints. Row locking and conditional writes provide the new runtime boundary without risking legitimate Railway rows through an unverified unique migration.

The database does not independently constrain the status vocabulary or invalid buyer/status combinations if writes bypass this service. Public marketplace mutation routes are registered once and delegate to the service; keeping non-route storage mutation helpers is a deliberate compatibility limitation. A later production-catalog-reviewed migration could add safe checks or a durable operation-key table, but is not required for one-time movement through the current public API.

## Authority, errors, and side effects

Requests may select only inventory/fish/listing identifiers and the existing player-chosen listing price. The server derives seller/buyer, ownership, item type and metadata, complete-row quantity, current state, charged price, proceeds, balance, and transfer result. Extra identity, balance, proceeds, quantity, or transfer fields are ignored because services never read them. Existing 1–1,000,000 price validation is unchanged.

Typed domain errors distinguish missing/owned items, wrong owner, inactive/sold/cancelled state, insufficient funds, invalid price/quantity, unsupported items, own listing, listing limit, already-collected state, and conflicts. Routes map ownership to 403, missing resources to 404, state conflicts to 409, validation/economy failures to 400, and unexpected transaction failures to a non-sensitive 500 response.

There are no marketplace notification, quest, badge, metric, or message side effects. Fish-book/catch-log ownership history is deliberately not rewritten by a trade, preserving existing behavior. No post-commit side effect therefore needs retry handling.

## Deliberate compatibility limits

Listing duration/expiry is not represented in the current schema and remains unsupported. Partial-stack quantity listing is not introduced. The confirmed pet-list action now reverts the pet, removes its accessories, clears any active-pet reference, and places the egg in escrow inside one transaction. The hatch timer stays paused in escrow and starts fresh only when the egg is bought or the seller cancels the listing. Slot purchases use their existing conditional single-statement debit/increment path and are outside listing lifecycle escrow/proceeds. Prices, fees (none), slot limits, sorting, eligibility, visuals, assets, and navigation are unchanged.
