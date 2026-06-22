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

## Dedup is enforced by a unique index (the 23505 catch is real)

`coin_purchases.stripe_session_id` now has a UNIQUE index
(`uq_coin_purchases_stripe_session_id`), added as an idempotent raw-SQL
`runMigration` in `server/index.ts` (same pattern as `idx_coin_purchases_user_id`,
NOT in the drizzle schema). This makes the `23505` (unique-violation) catch
blocks in both verify and webhook actually effective: under a true
verify+webhook race, one path inserts and grants, the loser hits 23505 and bails
→ at-most-once credit + at-most-once egg. `createCoinPurchase` is a plain insert,
so the violation surfaces naturally; no app-logic change was needed.

**What it does NOT cover:** side effects (addCoins, egg `sendGift`) run *after*
the marker insert and are not in one transaction with it. If the winning path
crashes/fails after inserting, retries see "already processed" and won't repair
the missing coins/egg. True exactly-once would need a transaction or a
processed-status/outbox with retryable side effects — a bigger change, not done.

**How to apply (DB safety):** adding/altering this index is a Railway schema
change governed by `replit.md`. Before touching it: take a backup, and verify
there are no duplicate `stripe_session_id` rows (a UNIQUE index fails if dupes
exist). pg_dump 16 can't dump the PG18 Railway server (version mismatch) — use a
logical backup via the `pg` driver instead, excluding the huge `media_blobs`.

## Gotcha: block-scoped response vars

The verify route builds its success response *after* the try/catch. Any var the
response reads (e.g. egg-bonus flags) must be declared at function scope, not
inside the try block, or it is out of scope at runtime (ReferenceError → 500
even though coins/egg were already granted).
