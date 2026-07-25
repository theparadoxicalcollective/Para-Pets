# Purchase/contribution milestone claim audit

## Confirmed original lifecycle and risks

The monthly contribution bar is a cycle-based, repeatable purchase reward system; it is separate from lifetime founder tiers, limited purchase eggs, and community reward inbox distributions. Stripe fulfillment adds the unchanged `priceUsd * 100` points to `purchase_monthly_progress` under the current `user_contribution_cycles.cycle`. Claiming does not spend or reduce those points.

The original claim route was `POST /api/coins/claim-milestone`, called only by `CoinShopPage`. The browser sent a numeric threshold as `milestone`. The route selected the authenticated user's cycle and progress, compared the browser value against a route-local threshold list, inserted a `purchase_milestone_claims` row through `storage.claimMilestone`, then independently read the reward, credited coins, added one inventory item, and (for 10,000) advanced the contribution cycle. The claim marker therefore committed **before** every value grant. A grant or cycle failure could permanently consume the claim; a lost response could produce a confusing rejection; the storage helper swallowed every insert error as though it were a duplicate; and none of the claim/grant/cycle writes shared a transaction.

The existing database uniqueness constraint is `(user_id, milestone_points, month_year)`. It prevented two successful marker inserts for one cycle, but did not make the later grants atomic. Double clicks and concurrent requests normally produced one marker and one grant, but a failure after the marker caused partial/missing value. A claimed-state failure after a grant was not the old order, while a cycle-advance failure occurred after both marker and grant. Progress could change between the pre-transaction qualification read and claim writes. A final-milestone retry after cycle advancement read the new cycle and appeared unqualified rather than reconciling the committed claim.

## Route, caller, table, and storage inventory

| Concern | Confirmed owner |
| --- | --- |
| Read progress and claimed state | Authenticated `GET /api/coins/progress` in `server/routes.ts`; `CoinShopPage` query `/api/coins/progress` |
| Display eligibility, threshold, reward, claimed button state | Existing contribution bar and popup in `client/src/pages/CoinShopPage.tsx`; display thresholds remain duplicated there for visuals |
| Claim | Authenticated `POST /api/coins/claim-milestone`; the sole client caller is `CoinShopPage` |
| Grant | Now exclusively `server/milestones/claimPurchaseMilestone.ts`; the public route delegates authenticated player ID and `milestoneId` |
| Configure rewards | Administrator-only `GET/PATCH /api/admin/milestone-rewards`; callers are `AdminPage` and the existing administrator picker in `CoinShopPage` |
| Add purchase progress | `server/payments/fulfillStripePurchase.ts`, inside the Stripe fulfillment transaction |
| Contribution/supporter reads | Coin-shop bar plus public founder/contribution leaderboard reads; no leaderboard route grants or claims a milestone |

The involved tables are `users` (coin balance and lifetime earned coins), `user_contribution_cycles` (current repeat cycle), `purchase_monthly_progress` (authoritative points by cycle), `purchase_milestone_rewards` (administrator-owned reward definition), `shop_items` (authoritative item identity/type), `user_inventory` (direct item/egg/pet delivery), and `purchase_milestone_claims` (durable claimed state). There are no milestone reward-bundle, `user_rewards`, badge, quest, pet-template, or coin-purchase claim writes.

Legacy storage methods retained for reads/admin configuration are `getContributionCycle`, `getMonthlyProgress`, `getClaimedMilestones`, `getMilestoneRewards`, and `setMilestoneReward`. `addPurchaseProgress` and `incrementContributionCycle` remain general compatibility helpers. The unsafe public-flow `claimMilestone` helper was removed, and the claim service does not call non-transactional `addCoins` or `addToInventory`.

## Definitions and rewards

The canonical server mapping contains stable IDs `500`, `2500`, `5000`, and `10000`, with unchanged thresholds 500, 2,500, 5,000, and 10,000 points. Each threshold is claimable once per contribution cycle and therefore repeatable in a later cycle. Claiming 10,000 advances to the next cycle exactly as before; the other claims do not.

Reward **values are deliberately administrator-configured production data**, not source constants: each threshold's row supplies `reward_coins` (a non-negative integer, default zero) and optionally one `reward_item_id`; one configured item means quantity one. `reward_item_name`, image, label, and star rarity are display metadata. The repository contains no seed that establishes the live row values, and this environment had no `RAILWAY_DATABASE_URL`, so production amounts/item IDs could not safely be asserted from source or queried. This change does not alter or seed any reward row. A missing row, negative/invalid coins, or a dangling item ID now fails without consuming the claim rather than silently recording an empty claim.

Supported core rewards are coins and one inventory item. Non-pet/non-pole items increment the existing stack by exactly one; pets and durable fishing poles create one individual row. Pet items preserve the existing milestone behavior of starting the hatch timer. There are no direct badge, quest, notification, inbox, email, Discord, analytics, or other progression effects in this claim flow. In particular, milestone rewards are granted directly and are **not** also inboxed. Community purchase rewards remain a separate Stripe-created inbox distribution.

## Transaction, locks, and idempotency

The focused service accepts only authenticated `playerId` and stable `milestoneId`; it is independent of Express. It resolves the threshold from server configuration, then opens one PostgreSQL transaction in this deterministic order:

1. Lock the authenticated `users` row `FOR UPDATE`.
2. Ensure and lock `user_contribution_cycles` `FOR UPDATE`.
3. Lock the current `purchase_monthly_progress` row `FOR UPDATE` when present.
4. Lock/read the owned current-cycle claim row.
5. Lock the administrator reward row `FOR SHARE` and resolve the item through `shop_items`.
6. Verify authoritative points meet the server threshold.
7. Credit configured coins and lifetime earned coins.
8. Grant exactly one configured item; stackable identity uses an advisory transaction lock plus an owned inventory-row lock.
9. Insert the claim with `ON CONFLICT DO NOTHING` backed by the real unique constraint; a conflict aborts the transaction rather than being swallowed.
10. For 10,000 only, conditionally advance the locked cycle.
11. Commit and return authoritative claim/reward/balance state.

Claim insertion, coins, inventory, and final cycle advancement therefore commit or roll back together. The user lock also serializes Stripe progress updates, because Stripe fulfillment locks the same player before locking/updating the contribution cycle and progress. Qualification cannot race a purchase update through these supported paths, and claiming never mutates the historical progress row.

Existing historical rows remain recognized without a backfill or destructive migration. `shared/schema.ts` now declares the already-present runtime unique constraint; startup already created it idempotently. The durable identity remains player + threshold + cycle, which preserves the established repeatability semantics. A retry reads the committed row and returns `already_claimed` without a grant. After the 10,000 claim advances the cycle, a retry while the new cycle is below 10,000 reconciles the immediately preceding claim; after the new cycle genuinely qualifies, it can be claimed independently.

## Failure, retry, and ownership behavior

Repeated taps, duplicate mutation callbacks, refresh retries, response loss, server restart after commit, and two devices all converge on the durable claim row and return success/replay with no additional grant. A restart before commit leaves no claim or reward. Coin, inventory, claim-record, or cycle-advance failure rolls back all core writes. An unknown milestone or unqualified player receives nothing. The browser cannot submit a player ID, progress, threshold, reward type, item, quantity, amount, claimed state, or balance: the route rejects every request key except string `milestoneId`, and the session supplies ownership.

There are no post-commit milestone side effects to retry. The client keeps its existing pending disable, performs no optimistic value grant, treats a replayed HTTP success as reconciliation, and invalidates every query affected by the supported rewards: progress/claimed state, authentication/coin balance, and inventory (which also represents milestone eggs and pets). Milestones do not affect badge or reward-inbox queries. Refresh continues to read claimed state from the server.

## Admin and legacy findings

Verified administrators retain the existing ability to configure rewards for the four fixed thresholds. It does not mark a player claim, bypass eligibility, or directly grant a player value; ordinary players cannot invoke it because the route uses `isAdmin`. No admin route for force-claiming milestones exists. Public founder/supporter/leaderboard routes are read-only. Stripe fulfillment changes progress but never invokes milestone granting. Reward inbox claims, limited egg delivery, founder-tier upgrades, and community goal rewards remain separate transaction boundaries.

## Deliberate limitations

Historical claim rows do not snapshot the reward definition used at claim time, because adding and backfilling production reward metadata was unnecessary for exactly-once value and would invent unverifiable history. A replay therefore reports the current administrator reward display metadata while granting nothing. The progress read endpoint is a read-only snapshot rather than a transaction, which is sufficient because claim eligibility is independently re-derived under lock. Existing duplicate inventory rows outside this claim boundary are not cleaned up; the service deterministically increments one row and this focused change adds no destructive inventory constraint.
