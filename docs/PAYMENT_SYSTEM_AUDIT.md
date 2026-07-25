# Stripe payment system audit and fulfillment boundary

## Confirmed original route and caller inventory

The paid integration is one-time Stripe Checkout for coin bundles; there are no subscriptions or invoices. `GET /api/coins/packs` returns the package display data and daily limit, authenticated `POST /api/coins/checkout` creates a Checkout Session, authenticated `POST /api/coins/verify` retrieves a session from Stripe after the return redirect, `POST /api/stripe/webhook` verifies Stripe's signature and receives raw events, and authenticated `GET /api/stripe/publishable-key` returns only the public key. `GET /api/admin/coin-purchases` and the public contribution leaderboard are read-only. The milestone endpoints read progress, claim a separately configured reward, or administer that reward; none verifies Stripe.

`CoinShopPage.tsx` is the only checkout/verification caller. It requests a package ID, redirects to Stripe, reads only `session_id` from the success URL, removes the query string, and calls `/api/coins/verify`. Refresh/reopen is consequently a status/retry operation, not browser-authoritative fulfillment. Cancel only displays status and grants nothing. Admin purchase history has no grant action.

Before this change, both `/api/coins/verify` and `WebhookHandlers.creditCoinsFromSession` independently inserted `coin_purchases`, credited coins, started an egg, advanced contribution progress, upgraded founder tier, and launched community/badge work. Only `stripe_session_id` uniqueness prevented two successful marker inserts. The marker was written before the grants and every later write was separate: coin failure left a permanently processed payment; egg/progress/community failures were swallowed; a webhook/verification race could observe the marker before coins existed; process loss after any step produced partial fulfillment. The two paths also duplicated constants and trusted `coins` and `amountUsd` copied from Stripe metadata rather than re-resolving `packId` against server configuration.

Original write order was: payment row, player coin update, asynchronous community bundle/inbox rows and acquisition badges, egg inventory plus hatch timestamp, asynchronous contribution progress, lifetime purchase query/founder upsert, and watcher chat. Webhook order was materially similar but nested egg after contribution/founder. Milestone *claim* remains a later player action: it records `purchase_milestone_claims`, then separately grants its admin-configured coins/item and may increment the contribution cycle. That known non-atomic claim is outside this PR; purchase fulfillment only ensures its progress is incremented once.

## Events, authority, identifiers, tables, and methods

The only custom event handled is `checkout.session.completed`. All other valid signed event types are acknowledged without a grant. A completed but unpaid/non-complete event is acknowledged without value. Invalid signatures are rejected. `stripe-replit-sync` also receives each verified payload for its own synchronization tables; those tables do not grant game value.

The canonical fulfillment identity is the Checkout Session ID. This is appropriate because every current purchase is exactly one one-time Checkout Session and existing legitimate history is keyed by it. The PaymentIntent ID is recorded when present for audit/correlation, but event ID is not the value boundary: the same session may arrive under different events/retries. `uq_coin_purchases_stripe_session_id` is the durable unique constraint. Event ID is last-event evidence only.

Core tables are `coin_purchases` (claim/status/evidence), `users` (coins, lifetime earned, purchaser lock), `user_inventory` (limited egg), `user_contribution_cycles` and `purchase_monthly_progress` (current-cycle points), `reward_bundles` and `user_rewards` (community coin inbox), and `founders` (upgrade-only lifetime tier). `purchase_milestone_claims` and `purchase_milestone_rewards` belong to later manual claiming. Acquisition badge helpers read `coin_purchases` and write `badges`/`user_badges` after commit; durable purchase backfills make those idempotent/recoverable. Storage's legacy `createCoinPurchase`, `addCoins`, `addToInventory`, `addPurchaseProgress`, reward, and founder methods remain for other callers/compatibility, but no payment-completion route uses them.

Previously only the session ID was unique; no PaymentIntent or event constraint existed, and Drizzle did not describe the runtime session index. The additive migration preserves all historical rows, defaults them to `fulfilled`, adds nullable audit fields/status/timestamps/result JSON, and retains the already deployed session unique index. No cleanup or deletion occurs. Production duplicate verification was required before that pre-existing unique index was originally installed; this PR does not introduce a new startup-breaking uniqueness assumption.

## Current flow, validation, transaction, and locking

`server/payments/config.ts` is the one server-owned package/reward map. Checkout accepts only `packId`; it resolves price, amount, currency, coins, bonus and contribution values on the server. Success/cancel URLs contain no user or reward authority. Checkout metadata records the authenticated user and resolved package for trusted correlation, but fulfillment ignores metadata coin/amount reward claims and recalculates them. Fulfillment requires `payment_status=paid`, complete status, a known package, exact configured cent amount, USD currency, and a real trusted metadata player. Manual verification additionally requires that player to equal the authenticated session. Stripe retrieval, not query-string status, supplies the payment object.

`fulfillStripePurchase` is independent of Express. Validation delegates to one operation boundary. Its PostgreSQL implementation opens one transaction, conditionally inserts a `processing` record, selects that canonical record `FOR UPDATE`, returns `already_fulfilled` for a committed record, verifies owner, locks the player, grants exact coins/lifetime earnings, inserts the configured egg when applicable, advances current-cycle contribution points, creates the complete community reward bundle and recipient inbox set, applies the existing upgrade-only founder tier, then conditionally marks the record fulfilled with result evidence. All core value writes roll back if any statement or final completion fails. It never marks fulfilled first.

A conflicting insert waits on the unique session index; after the winner commits, the loser locks and reads `fulfilled`. Thus duplicate event IDs, different event IDs for one session, webhook/verification races, two verification requests, and retries after a lost response grant once. A server restart before commit leaves no effects; Stripe retry or verification can fulfill. A restart/lost response after commit reads the durable fulfilled record. An unpaid, incomplete, expired, failed, cancelled, zero/mismatched, unknown-package, wrong-currency, unknown-player, or wrong-player object grants nothing. A refunded/disputed payment is never treated as a new purchase; automatic clawback is deliberately not implemented and remains a policy decision.

The community inbox changes future player balances, so bundle and all `user_rewards` rows are a **core transactional economy effect**, not fire-and-forget. One fulfillment creates them once. The watcher chat announcement was non-critical and is no longer emitted by payment completion because it had no durable once-only delivery key; adding a payment-keyed outbox is a deliberate follow-up if that announcement is required. Acquisition badge work is a **post-commit idempotent/recoverable effect** and cannot roll back or repeat purchase value. Contribution points and founder progression are core. Monthly milestone progress changes once in the transaction; milestone reward claiming remains its existing separate non-atomic boundary.

## Webhook security and error/recovery behavior

`server/index.ts` registers `express.raw({type:'application/json'})` for the webhook before global JSON parsing. It requires `stripe-signature`, confirms `req.body` is a Buffer, and passes raw bytes plus the signature to `stripe-replit-sync`, which performs signature verification before custom JSON parsing/fulfillment. Failures return a generic 400 and do not expose secrets, SQL, card/customer data, or payloads. Unexpected signed events return 200 without granting.

Domain failures distinguish unpaid/invalid state, unsupported package, missing player, amount/currency/player mismatch, and transaction conflict; verification maps them to non-sensitive 4xx responses. Stripe retrieval/unknown database failures use a generic response and sanitized logging. A database failure before, midway through, or while marking completion rolls back the transaction, leaving a retry possible. A post-commit badge failure cannot make core fulfillment retry; the durable history supports reconciliation.

## Deliberate remaining risks

* Existing automatic refund/dispute clawback policy does not exist; no balances are reversed here.
* Acquisition badge creation/award remains post-commit and depends on its existing idempotency/backfills.
* Manual milestone reward claiming is still non-atomic (claim row precedes grant); it should be a separate focused task.
* Dynamic Stripe Price discovery retains existing behavior. Exact amount/currency and trusted server-created package mapping are authoritative; the resolved price ID is stored in Checkout metadata for diagnosis but no static Price IDs existed to pin without changing current Stripe product configuration.
* A durable outbox would be required to restore an exactly-once watcher-chat announcement.

## Files changed

* `server/payments/config.ts`: canonical unchanged package/reward rules.
* `server/payments/errors.ts`: typed non-sensitive domain errors.
* `server/payments/fulfillStripePurchase.ts`: validation, transaction, locks, grants, and replay result.
* `server/routes.ts`: checkout authority and verification delegation.
* `server/webhookHandlers.ts`: signed-event filtering and shared-service delegation.
* `server/index.ts`, `shared/schema.ts`: additive durable fulfillment evidence.
* `test/stripePurchaseFulfillment.test.ts`: validation, exact rewards, rollback, replay/race, raw-body and delegation coverage.
* `docs/PAYMENT_SYSTEM_AUDIT.md`, `docs/CODEBASE_MAP.md`: maintained architecture/audit record.

No package price/reward, contribution formula, marketplace, fishing, aquarium, raid, visual/UI, asset, navigation, Stripe product behavior, or Railway configuration was intentionally changed.

## Manual Railway smoke-test checklist

1. Open the coin shop while signed in.
2. Start checkout for each currently available package.
3. Confirm displayed Stripe price matches the Para Pets package.
4. Complete one Stripe test purchase.
5. Confirm expected coins/items are granted exactly once.
6. Refresh the success page repeatedly; confirm rewards do not repeat.
7. Reopen the success URL; confirm rewards do not repeat.
8. Confirm contribution points increase exactly once.
9. Confirm the community bonus inbox runs exactly once.
10. Confirm purchase/milestone progress increases exactly once.
11. Verify payment history reflects the purchase once.
12. Cancel checkout and confirm it grants nothing.
13. Test an incomplete/failed payment and confirm it grants nothing.
14. Confirm webhook-only completion works without opening the success page.
15. Confirm another account cannot claim the completed session.
16. Confirm current shop visuals, package values, and navigation remain unchanged.
