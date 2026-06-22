---
name: Coin purchase + limited-egg delivery
description: How coin-bundle purchases credit coins and deliver limited bonus eggs; the dual-path dedup and its missing DB constraint.
---

# Coin purchase / limited-egg delivery

Two independent code paths credit a Stripe coin-bundle purchase and deliver its
bonus egg (limited $50/$100 bundles): the synchronous `/api/coins/verify` route
(success-redirect) and the async Stripe webhook (`creditCoinsFromSession`). They
are meant to be mutually exclusive: each checks for an existing `coin_purchases`
row keyed by `stripe_session_id`; whichever runs first inserts the row, credits
coins, and delivers the egg, and the other bails.

**Both paths must deliver the limited egg the same way — as a GIFT via
`storage.sendGift` (self-sender, `itemType: 'shop_item'`, `shopItemId`).** The
egg is claimed from the gift inbox → `acceptGift` → `addToInventory`. Keep the
two paths' egg payloads identical (same `EGG_BONUS` map is duplicated in
`server/routes.ts` and `server/webhookHandlers.ts`).

**Why a gift, not direct-to-inventory:** product owner wants limited eggs
delivered through the gift/claim system, consistent with the webhook. Direct
`addToInventory` on one path + gift on the other was the original inconsistency.

**The limited-egg bundle reward and the monthly Contribution milestone rewards
are SEPARATE systems — keep them separate.** Milestone rewards
(`purchase_milestone_*` tables, `/api/coins/claim-milestone`) still grant via
direct `addToInventory`. Do not merge the two.

## Gotcha: the dedup has NO unique DB constraint

`coin_purchases.stripe_session_id` has **no unique constraint/index** on Railway
(only PK on `id`, non-unique index on `user_id`) — verified by live inspection.
So the `23505` (unique-violation) handling in both paths is effectively dead
code; dedup relies entirely on the check-then-insert SELECT. In practice this
has worked (0 duplicate rows observed in prod, low purchase volume), but a true
verify+webhook race could double-credit/double-gift.

**How to apply:** Don't trust the `23505` catch blocks as a real guarantee. If
asked to make delivery provably exactly-once, the fix is a unique constraint on
`stripe_session_id` (or transactional/idempotent egg delivery) — but that is a
Railway schema change governed by the DB safety rules in `replit.md`; get
explicit user approval first, and check for pre-existing duplicate rows before
adding the constraint (it will fail if duplicates exist).

## Gotcha: block-scoped response vars

The verify route builds its success response *after* the try/catch. Any var the
response reads (e.g. egg-bonus flags) must be declared at function scope, not
inside the try block, or it is out of scope at runtime (ReferenceError → 500
even though coins/egg were already granted).
