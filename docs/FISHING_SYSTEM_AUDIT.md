# Fishing and aquarium system audit

**Scope and method.** Static documentation audit of the production code at
`044ee7d` (the local `main` tip containing merged PR #14), completed 2026-07-24.
This is not a behavioral, schema, balance, asset, UI, API, or Railway change.
Route registration was enumerated before conclusions by inspecting every
fishing/fish/aquarium/pond/fish-market registration in `server/routes.ts` and
their callers, storage methods, and Drizzle declarations.

## Executive result

* **Confirmed vulnerability / integrity risk — client-selected catch.**
  `POST /api/fishing/catch` accepts `performanceScore` and `shopItemId`.  A
  score of 100 guarantees a catch, and a supplied fish ID is selected directly
  whenever it is stocked in the requested pond.  The browser's reel result and
  fish selection therefore affect success and rarity; the server only verifies
  pond membership, not that the animation produced the result.
* **Confirmed vulnerability / integrity risk — catch reward is non-atomic and
  non-idempotent.** `claimFishCatchReward` reads then flags the log row, then
  the route separately credits 10 coins. Concurrent requests can both pass the
  read; a coin-write failure after the flag loses the reward, while a request
  interleaving can duplicate the credit.
* **Confirmed integrity risks — catch, selling, aquarium unlock, and fish
  market transfers cross multiple writes without one transaction.** In
  particular, selling deletes fish before coin credit; a failure loses fish.
  Catch grants the fish before catch-log/bait/side effects. Aquarium unlock
  debits coins before recording ownership. Fish listing/buy/cancel cross fish
  and general inventory records without one boundary.
* **Confirmed safe properties.** Session identity is authoritative for
  player-owned fish/equipment/aquarium reads; fish sale prices and bait/pole
  values are server configuration; the pole and bait decrement SQL prevents a
  quantity below zero. Pond stock has a `(location_id, shop_item_id)` unique
  declaration, equipment has unique `user_id`, and aquarium unlock insertion
  uses a conflict-safe pair insert.

## Client and world entry points

`WorldPage` opens `FishingPage` with a world location ID. `FishingPage` loads
pond stock, equipment, fish inventory, catches, equips, and presents a
timer/animation reel before posting its score and selected fish. It also hosts
admin pond management and the fish-book/reward UI. `AquariumPage`, opened by
`FloatingNav`, reads the current user's fish and unlocks and adds/removes fish
from slots (it has optimistic local cache changes). `SellFishPage` performs the
fixed-price bulk sell; `MarketPage` lists/buys/cancels fish in the player
market. `FishingAdminPanel` manages fish/pole/bait catalog attributes and fish
part art; `AdminPage` mounts it. No caller using an arbitrary player ID was
found for player-owned data.

World-specific behavior: a catch route loads `world_locations` and requires
`type = fishing`; its location's `worldId` selects leaderboard points and the
fish-book badge biome. `addFishToPond` and `removeFishFromPond` propagate a
stock change to every fishing location in the same world. Fish barrels are
world-position/decor reads, not catch rewards.

## Registered HTTP routes

All routes below are in `server/routes.ts`; “auth” means `isAuthenticated`.
Unless noted, errors are `500 { message }`; successful reads return their
entity/array and mutations return JSON. Manual admin checks require auth plus
`req.user.isAdmin`, but do **not** use the repository's verified-admin guard.

| Method and path (approx. line) | caller / input | authority, effects, response, and concurrency assessment |
| --- | --- | --- |
| GET `/api/fish-parts/:fishItemId` (6242) | Aquarium fish renderer; path fish ID | auth; reads `fish_template_parts`; no ownership requirement (display metadata), `200 []`; no mutation. |
| GET/POST/PATCH/DELETE `/api/admin/fish-parts/:fishItemId` or `:partId` (6251–6323) | FishingAdminPanel; path IDs; POST `{partType,imageData,posX,posY,width,height,zIndex}`, PATCH arbitrary body | auth + manual admin; reads/writes fish part art. POST validates part type, resizes client image; no reward values. `200` entity/`{ok:true}`, `400` missing/invalid, `403`. Not transactional for multi-step image processing/write. |
| GET/POST/DELETE `/api/admin/location/:locationId/pond-fish[/:shopItemId]` (6334–6372) | FishingPage admin; path IDs, POST `{shopItemId}` | auth + manual admin; validates fishing location and fish catalog item; touches `pond_fish`, `world_locations`, `shop_items`; returns list/entry/`{ok:true}`. Storage propagation is multiple inserts/deletes without a transaction; declared pond uniqueness prevents duplicate same-location stock. |
| GET `/api/fishing/all-fish` (6375), GET `/api/fishing/fish-by-world` (6385), GET `/api/location/:locationId/pond-fish` (6451) | admin/UI queries; location path | auth; catalog/world/pond reads (`shop_items`, `pond_fish`, locations/worlds); no ownership or mutation. |
| GET `/api/fishing/caught-fish-ids` (6427) | FishingPage fish book | auth; `req.user.id`; reads own `player_fish_catch_log`, returns `{shopItemId,rewardClaimed}[]`. |
| POST `/api/fishing/claim-catch-reward` (6437) | FishingPage fish book; `{shopItemId}` | auth; user and caught species are server-scoped, but request chooses which owned log to claim. Sets `player_fish_catch_log.reward_claimed`, then `users.coins`/`total_coins_earned` +10; `200 {ok,coins}`, `400` absent/already claim. **Nontransactional read-then-write; confirmed duplicate/lost-reward risk.** |
| GET `/api/fishing/equipment` (6460) | FishingPage | auth; own `player_fishing_equipment`, referenced `user_inventory`/`shop_items`; `200 {equipment,poleItem,baitItem,poleUsesLeft}`. It fetches inventory ID without an additional owner predicate, but IDs originate from the user's equipment row; verify stale/cross-owner references in data. |
| POST `/api/fishing/equip`, POST `/api/fishing/unequip` (6484,6506) | FishingPage drag/drop; `{inventoryId,slot}` / `{slot}` | auth; equip verifies inventory ownership and fishing subtype; upserts own equipment (`user_id` unique). `200 {ok,equipment}`, `400` invalid, `404` absent. No transaction needed for its one upsert, but no lock prevents concurrent last-write-wins equipment changes. |
| GET `/api/fishing/inventory` (6520) | Fishing/Aquarium/Market/Sell pages | auth; reads own `player_fish_inventory` joined `shop_items` plus part metadata; `200 []`; no mutation. |
| POST `/api/fishing/inventory/add` (6540) | no production caller located | auth; `{shopItemId}` is only checked as a fish catalog item, then inserts an owned fish. `201 entry`; **confirmed vulnerability:** any authenticated user can mint any catalog fish; no location/catch/ownership evidence. |
| POST `/api/fishing/catch` (6556) | FishingPage reel; `{locationId,performanceScore,shopItemId}` | auth; location is server-loaded and must be fishing; supplied fish must be in that pond, but supplied score (clamped 0–100) controls success and supplied fish bypasses random/bait rarity selection. Mutates fish inventory/log, later increments total catches, bait/pole inventory/equipment, quest, leaderboard, badges. `200 {caught,item}` or `{caught:null,reason:'empty_pond'|'miss'}`, `400` location, `500`. **No transaction; browser-authoritative success/fish integrity risk; retry/concurrent requests create additional catches and side effects.** |
| GET `/api/fishing/leaderboard/:worldId` (6689) | FishingPage | auth; arbitrary path world ID reads public leaderboard and current user's rank; `200 {top,me}`; no validation of world existence or mutation. |
| GET `/api/world/:worldId/fish-barrel`, PATCH/DELETE `/api/admin/fish-barrel/:id` (7091–7121) | World/admin editing; path and PATCH `{posX,posY,size}` | read is auth; writes manual admin; touches `fish_barrels`; no fishing reward/ownership mutation; success barrel/null or `{ok:true}`, `403` admin. |
| POST `/api/fishing/aquarium/sync` (7124) | no current client caller located; `{counts:[{shopItemId,count}]}` | auth/current user; resets all their `in_aquarium` flags, then marks selected IDs. `200 {ok}`, `400` non-array. **Nontransactional and count/type unvalidated; concurrent add/remove/sync can overwrite state.** |
| POST `/api/fishing/aquarium/add`, `/remove` (7140,7154) | AquariumPage; `{shopItemId,slot?}` | auth/current user; read then updates one owned fish matching state/slot. `200 {ok,fishId}` / `{ok:true}`, `400` absent. Comments call these atomic, but storage uses select then unconditional ID update with no transaction/conditional update; simultaneous adds can select the same fish. |
| GET `/api/aquarium/unlocks`, POST `/api/aquarium/unlock` (7168,7180) | AquariumPage; POST `{aquariumId}` | auth/current user; fixed server `AQUARIUM_PRICES`; reads/inserts `player_aquarium_unlocks`, atomically debits `users.coins`. `200 {unlocks}` / `{ok,coinsRemaining}`, `400` invalid/already/insufficient. **Debit and ownership insert are separate; retry/failure can lose coins, and concurrent requests can double debit before conflict insert.** |
| POST `/api/fishing/sell` (7208) | SellFishPage; `{fishIds}` | auth/current user; server loads own fish, excludes aquarium fish, derives fixed rarity price, deletes IDs then credits coins; quest once/fish fire-and-forget. `200 {sold,coinsEarned,newBalance}`, `400` bad/no valid. **No transaction; duplicate input IDs collapse in filter, but concurrent sells can credit based on stale read after one delete and credit failure loses fish.** |
| POST `/api/market/list-fish` (6101), POST `/api/market/:listingId/buy` (6137), POST `/api/market/:listingId/collect` (6197), DELETE `/api/market/:listingId` (6209) | MarketPage; list `{fishInventoryId,price}`, paths | auth; list verifies owned/non-aquarium fish and bounded client **market price**, converts fish record to listed general inventory and creates listing; buy atomically debits then tries status transfer and converts listed item to fish; collect deletes listing then credits seller; cancel reverses. All touch `player_fish_inventory`, `user_inventory`, `player_market_listings`, `users`. Individual status/debit steps have conditional logic, but cross-record flows are not transactional and caught conversion errors are swallowed: confirmed integrity-risk area requiring characterization. |
| GET `/api/market`, `/api/market/my-listings`, `/api/market/listing/:listingId/item-details` (5979,6046,2955) | MarketPage | auth fish-market reads; query search/itemType and path ID; returns listing/details; no mutation. |
| POST `/api/admin/world/:worldId/fishing-spot` (4226) | admin/world tooling; path ID | `isAdmin` middleware; creates fishing location/art defaults; `200` location, `500`; administrator world-location configuration, no catch. |

Generic authenticated/admin shop-item routes elsewhere in `routes.ts` are also
the administrator configuration surface for `shop_items` fields used by
fishing: `type`, `fishing_type`, `star_rarity`, `rarity_boost_percent`,
`bait_rarity_boost_star`, `bait_catch_boost`, `pole_max_uses`, and fish visual
fields. Purchases stack bait in `user_inventory` (five charges per purchased
bundle) and give durable poles individual rows with `pole_uses_left`; these
catalog/purchase routes were traced as dependencies but are not fishing-path
registrations by name.

## Mutation map and authority boundaries

| Mutation | authoritative values and records | transaction / locks / retry result |
| --- | --- | --- |
| Catch | user=`req.user.id`; location=`world_locations`; pond fish server membership; random rarity/bait config from `shop_items` **unless client sends valid pond fish**; score is client-controlled; `player_fish_inventory` is ownership, `player_fish_catch_log` permanent species/claim record | No encompassing transaction/lock/unique log pair. Pole uses are an owned conditional SQL decrement in its own transaction; bait decrement is guarded against negative quantity in a separate transaction. Fish can be granted without log/bait/quest/points, and retries create fish. |
| Catch reward | user session; fish is own log pair; reward fixed route constant 10 | log read/update then `addCoins`; no lock, conditional update, unique `(user,fish)`, or rollback. **Confirmed risk.** |
| Sale | session user; owned non-aquarium record; rarity and fixed price server-derived | read → delete → coin credit; no atomic boundary. Quest follows asynchronously; replay/concurrent requests need testing. |
| Aquarium placement | session user; eligible fish selection scoped by user; slot is client display value | select → update, no row lock/conditional mutation. Sync resets then loops. Ownership cannot cross user, but simultaneous calls can violate intended selection/state. |
| Aquarium purchase | session user; aquarium ID and price fixed server map; ownership pair `player_aquarium_unlocks` | atomic conditional debit only; insert is separate but conflict-safe. No rollback between them. |
| Equipment/consumption | session user; equip validates owned inventory/subtype; pole state=owned inventory row; bait quantity=stack field | equipment upsert has unique user key; pole/bait each own atomic transaction. Catch couples neither to grant/result atomically. A depleted bait's unequip is separate. |
| Fish market | seller/buyer session and listing state; client price only for bounded player market price | multiple storage mutations and compensating refund, no one transaction. Fish records are moved through general inventory, which is a cross-domain dependency. |
| Quest/badge/points | server calls only after catch/sale attempts; quest server chooses current configuration, badge helper sees stored counts/log; points rarity uses returned catalog item | all are fire-and-forget after core catch/sale. Failures do not roll back catch/sale; badges can run after partial catch and `awardBadge` remains select-then-insert with no declared pair unique constraint (see badge audit). |

### Tables and storage methods

Primary tables are `shop_items` (fish/bait/pole definitions), `world_locations`,
`pond_fish` (declared unique location/fish), `player_fish_inventory` (one row
per fish, aquarium flags), `player_fish_catch_log` (first species and boolean
reward flag, **no declared unique pair**), `player_fishing_equipment` (unique
user), `user_inventory` (bait stacks/poles), `users` (coins and
`total_fish_caught`), `fishing_leaderboard`, `player_aquarium_unlocks` (raw
SQL conflict pair), `fish_template_parts`, `fish_barrels`, and
`player_market_listings`. The primary storage methods are
`getPondFish`/`addFishToPond`, `addFishToPlayerInventory`, `logFishCatch`,
`claimFishCatchReward`, `decrementPoleUses`, `decrementBaitQuantity`,
`sync/add/removeFishToAquarium`, `atomicDeductCoins`/`addCoins`,
`deleteFishInventoryItems`, and market conversions.

## Findings classification

### Confirmed safe

* Catch location and client fish ID are constrained to a server-loaded fishing
  location and that location's pond; equipment selection checks inventory
  ownership; fish inventory/aquarium/sale reads are session-user scoped.
* Sale price, aquarium price, catch-reward value, pole durability, bait boost,
  bait quantity, and normal random weights are server-held. Client rarity,
  coin amount, quantity, or another user ID is not accepted as such.
* Bait and pole decrement guards prevent negative consumption under concurrent
  decrements; pond placement and equipment have declared conflict/unique keys.

### Confirmed vulnerability or integrity risk

1. Client 100 score guarantees a catch and client stocked fish ID chooses its
   rarity/species, so animation/timer is an authority boundary.
2. `/api/fishing/inventory/add` mints a chosen valid catalog fish for any
   authenticated player with no server event/ownership evidence.
3. Catch-reward claim is read-then-write and its claim flag/coin credit are
   separate. Catch, sale, unlock, aquarium, and market cross-record mutations
   lack one transaction as described above.

### Likely risk requiring verification

* `player_fish_catch_log` has no declared unique `(user_id,shop_item_id)`;
  confirm production DDL/data and parallel requests. Badge fish-book joins can
  count duplicated pond placements across locations, although it uses distinct
  fish IDs.
* Admin/manual fish routes use `isAuthenticated` plus a manual `isAdmin`
  condition rather than `requireAdmin`; confirm whether verified-admin policy
  is intentionally different.
* Aquarium add/remove comments claim atomicity contradicted by select/update
  implementation; parallel database tests should establish the exact outcome.

### Maintainability concerns and documentation gaps

`server/routes.ts` holds UI protocol, catch rules, reward values, generic
inventory, coins, quest increment, badge helpers, and administration in one
module. The lack of route tests/transaction characterization tests and no
documented production constraint catalog make secure extraction risky. The
client has no server-verifiable fishing-attempt/session record. Existing
comments overstate aquarium atomicity.

## Relationship to extracted badge route module

PR #14 moved badge **HTTP registrations** to `server/routes/badge.routes.ts`,
called with injected auth/storage/db/image dependencies from `routes.ts`.
Fishing does not call that route module. `maybeAwardFisherBadges`,
`maybeAwardFishBookBadge`, their definition helpers, and backfills remain in
`server/routes.ts`; catch calls them fire-and-forget after inventory/logging.
Thus extracting fishing routes now would require dependency injection for
`storage`, `db`, `isAuthenticated`, `incrementQuestProgress`, and the two
badge-award functions (or a small injected award service). Importing routes
back into badge routes would create circular-dependency risk. Initially keep
shared badge helpers, quest progress, coin/inventory primitives, and
transaction coordinators outside a fishing route module; move read-only route
registration only after characterization tests.

## Prioritized independent follow-ups

1. **Safest first implementation — make catch-reward claims transactional and
   idempotent.** Why: confirmed direct coin integrity risk isolated to one
   route/storage flow. Production risk: high (duplicate/lost 10-coin claims),
   but small blast radius. Scope: coordinator + route/storage tests; prerequisite
   production DDL/data inspection. Tests: sequential/parallel claim, unowned,
   already claimed, coin-write and claim-write failure rollback. A migration is
   eventually needed for a unique `(user_id,shop_item_id)` log constraint;
   advisory/row locks can protect the immediate route before that review.
2. Make fish sale removal and coin credit atomic, including owned conditional
   deletion and quest dispatch after commit. Risk high; medium scope; needs
   concurrent sell and failure tests; no migration required initially.
3. Replace client-authoritative fishing result with a server attempt boundary
   (or server selection independent of timer). Risk critical gameplay/economy;
   medium/large scope; characterize current odds/UI contract first; likely a
   durable attempt/idempotency schema migration eventually.
4. Make catch fish/log/bait/pole side effects transactional and postpone
   quest/badge/leaderboard work until commit. Risk high; medium scope; test
   failures and simultaneous attempts; an attempt/claim uniqueness migration
   may eventually be needed.
5. Remove or secure `/api/fishing/inventory/add` behind an authoritative
   server-only flow. Risk critical; very small scope but needs caller/history
   verification and authorization tests; no migration required.
6. Make aquarium unlock and fish market conversions atomic; replace aquarium
   select/update with conditional owned updates. Risk medium; medium scope;
   parallel/retry tests; unlock already has a pair conflict key, market may
   need additional state constraints after DDL review.
7. Extract a read-only fishing route group only after characterization tests.
   Low production risk/medium organization scope; no migration; inject shared
   helpers rather than importing route modules.
