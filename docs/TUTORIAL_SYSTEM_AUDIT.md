# Begin Journey tutorial system audit

## Confirmed original flow

Begin Journey is a seven-step, browser-directed onboarding flow. `App.tsx`
auto-starts it for an authenticated player whose server completion/reward flags
are false and whose browser has no local step. `FloatingNav.tsx` can start it,
syncs a completed server flag into local `done`, displays the quest card, and is
the only caller of the final quest-log reward. `BeginJourneyOverlay.tsx` owns the
seven labels, spotlights/navigation, local step changes, the automatic step-5
potion request, and the completion request. `HomePage.tsx` handles the tutorial
potion-use event through the existing owned-pet special-item route. Welcome gift
copy can initiate Begin Journey but does not call a tutorial reward endpoint.

The public tutorial HTTP inventory is:

| Route | Caller | Original purpose and writes |
| --- | --- | --- |
| `POST /api/tutorial/grant-starter-egg` | `BeginJourneyOverlay` step-2 rescue only | Selects an existing server-side starter egg and inserts it into `user_inventory`. It is a separate rescue path and is not an alternate hatch-potion or completion reward route. |
| `POST /api/tutorial/grant-hatch-potions` | `BeginJourneyOverlay` step 5 | Granted three copies of shop item `3e6d7b47-b4c5-4a34-bd69-c039a31e1770` through three independent storage calls, then set `users.tutorial_hatch_potions_claimed`. |
| `POST /api/tutorial/complete` | `BeginJourneyOverlay` step 6 | Set `users.tutorial_quest_completed`; it granted no coins or items. |
| `POST /api/tutorial/claim-reward` | `FloatingNav` quest card | Set `users.tutorial_reward_claimed`, then credited 1,500 coins and lifetime earned coins. Completion intentionally unlocks this separate manual quest-log claim; it does not grant that value itself. |

The hatch item remains the exact server-selected **Small Hatching Potion** ID
`3e6d7b47-b4c5-4a34-bd69-c039a31e1770`, a stackable `special` item whose
`special_type` is `hatch_time`. Inventory represents it as a `user_inventory`
row with a quantity; the unchanged tutorial bundle is exactly **3**. The final
quest-log reward remains exactly **1,500 coins**.

Before this hardening, a sequential second potion request returned a conflict
while any matching positive inventory row remained, but re-granted three after
the potions were consumed. Two first requests could both observe an unclaimed
flag and both grant. A lost successful response could therefore cause either a
conflict or another grant after consumption. The three inventory changes and
claimed flag were separate commits: an inventory failure could leave a partial
bundle, and a flag failure could leave value with the grant still retryable.
The reverse ordering did not occur. Existing claimed accounts with inventory
were blocked, claimed accounts with no inventory were re-granted, and unclaimed
accounts with potions received another bundle. Completion was an unconditional
update: repeats and two devices wrote `true` again but had no reward side effect.
The final coin claim marked claimed before crediting coins, so a credit failure
could permanently consume the reward and concurrent claims could duplicate it.

## State ownership

Server state is `users.tutorial_hatch_potions_claimed`,
`users.tutorial_quest_completed`, `users.tutorial_reward_claimed`, the owned
`user_inventory` potion stack, and the player's `users.coins` and
`users.total_coins_earned`. These fields survive refreshes and restarts and are
selected only through the authenticated session. Browser local storage key
`bj_step` stores only `null`, steps 0–6, or `done`; transient step-5 fake/tap
mode is in memory. Local state guides visuals and navigation but never supplies
ownership, reward identity, quantity, coins, or claim flags.

A refresh during step 5 reloads local step 5, refetches inventory, and either
uses the existing potion, reconciles the already-granted response, or enters
the existing hatch-ready tap path after a potion was used. Completion flags
from `/api/auth/me` reconcile reset browser state to `done`. Conversely, local
`done` does not write server completion; if a completion request fails, the
overlay now remains at step 6 rather than manufacturing permanent local
completion.

## Server-owned configuration and service boundary

`server/tutorial/config.ts` owns only the stable tutorial ID, unchanged potion
identity/type/quantity, the fact that completion grants no direct value, and
the unchanged quest-log coin amount. Empty request bodies are required; hostile
user IDs, item IDs, quantities, special types, balances, completion values, or
claim flags are rejected before service invocation.

`server/tutorial/tutorialService.ts` is independent of Express and exposes
typed potion-grant, completion, and quest-reward results. Thin authenticated
handlers pass only `req.user.id`. Typed domain errors contain non-sensitive
messages; HTTP failures do not expose SQL or item configuration. There is no
generic public inventory mint endpoint and no alternate tutorial potion or coin
caller.

## Transactions, locks, retries, and concurrency

The hatch grant opens one PostgreSQL transaction and locks the authenticated
`users` row `FOR UPDATE`. It re-checks the durable claimed flag while locked,
validates the fixed shop item, takes the established inventory advisory lock,
locks the canonical matching stack when present, adds exactly three, and
conditionally sets the claimed flag. Inventory and claim state commit together;
any item, inventory, or final-flag failure rolls back both. Replays, lost-response
retries, double taps, and two devices serialize on the player row and return
`already_granted` without value. Consuming the potions never clears the durable
boundary and therefore never re-grants them.

Completion similarly locks the owned player row and conditionally transitions
the durable completion flag. A repeat returns `already_completed` and performs
no quest progress, notification, reward, or other side effect. Completion only
enables the existing quest-log claim.

The final quest-log claim is also part of the tutorial mutation inventory. It
now locks the player, requires durable completion, and atomically credits the
unchanged 1,500 coins/lifetime earnings while setting the reward flag. Replays
return the authoritative balance with zero newly granted coins. Thus the
unchanged player-facing manual claim is now retry- and concurrency-safe as well.

## Legacy account compatibility

No schema, reset, or backfill is introduced. `COALESCE(..., false)` safely
interprets older null values if they survived a historical migration, while the
existing non-null defaults remain authoritative for normal rows.

* Claimed flag true is final whether potions remain or were consumed; no bundle
  is re-granted.
* Claimed flag false grants the configured bundle even when the player owns the
  same potion from another source. Inventory ownership is never inferred to be
  a tutorial claim.
* Flag true with no inventory remains claimed, preserving consumed/history
  semantics.
* Server completion true remains complete even if local tutorial state is reset;
  the existing client reconciliation writes local `done`.
* Local `done` with server completion false remains incomplete server-side and
  cannot claim the quest reward. The client reconciles this legacy false-local-
  completion state to retryable step 6 instead of guessing or overwriting the
  server flag.
* Existing completed and reward-claimed accounts replay safely and receive no
  duplicate completion or value.

## Deliberate remaining limitations

The tutorial's local step number is intentionally not server persisted, so
progress before completion does not roam between browsers/devices. The existing
tutorial-only instant hatch authorization still uses the durable claimed and
completion window rather than a server-side step-5 record. Starter-egg rescue is
separate from the audited potion/completion/coin boundaries and retains its
existing behavior. Existing duplicate inventory rows are not destructively
merged; the service deterministically increments one canonical row. These are
preserved constraints rather than expansions of this focused reward hardening.

No tutorial step, text, spotlight, navigation, animation, visual, potion value,
quest reward, hatch behavior, marketplace, Stripe, milestone, fishing,
aquarium, badge, raid, asset, or Railway behavior was intentionally changed.
