---
name: Founder tier vs monthly contribution bar
description: Two separate coin-purchase reward systems that must be kept in sync across BOTH credit entry points.
---

# Founder tier vs monthly contribution reward bar

Coin purchases drive two **independent** reward systems. Do not couple them.

- **Founder tier** (the name colors/animation on the Founder's Wall, `/founders`) is based on **lifetime/overall USD spend** via `getLifetimePurchaseUsd`. Thresholds (USD): Bronze 50 / Silver 150 / Gold 500 / Legendary 1000. Applied via `upsertFounderByUserId`, which is **upgrade-only** (PRIORITY map) — it never downgrades, so existing founders stay as-is and new rules apply going forward only.
- **Monthly contribution reward bar** is based on **this month's points** (`purchase_monthly_progress`, points = USD×100), milestones 500/2500/5000/10000, claimed via `claimMilestone`. This only grants the bar's coins/items — it must NOT assign founder tier.

**Why:** the wall used to derive tier from monthly milestones, which meant a big monthly spender got Legendary; the owner wanted tier to reflect total lifetime support instead, while keeping the monthly bar for repeatable rewards.

**How to apply:** coin-purchase crediting happens in **two** entry points that are deduped by `coin_purchases.stripe_session_id` (only one runs per purchase, and the webhook often wins the race):
1. verify path — `server/routes.ts` (the `/api/coins/verify`-style handler, founder-tier block after the milestone loop)
2. webhook path — `server/webhookHandlers.ts` `creditCoinsFromSession`

Any change to tier thresholds or the tier/milestone split MUST be mirrored in **both** files, or behavior silently differs depending on which path processed the purchase. `getLifetimePurchaseUsd` must be called after `createCoinPurchase` so the current purchase is included in the lifetime sum.
