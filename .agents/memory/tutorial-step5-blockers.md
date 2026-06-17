---
name: Tutorial step-5 drag blockers
description: Four distinct bugs that silently blocked potion drag/tap in the speed-up tutorial step.
---

## Bug 1 — Modal outer-div swallows all touches

`showPotionModal` and `showGrantModal` in `BeginJourneyOverlay.tsx` render a `fixed inset-0` wrapper at z-99010 with **default `pointer-events: auto`**.  This invisible full-screen div sits above the speed-up sheet (z-99002) and captures every touch, making potions appear "darkened out and unable to be dragged."

**Fix:** Add `pointerEvents: "none"` to the outer wrapper div; add `pointerEvents: "auto"` to the inner dialog div.

## Bug 2 — Drop-zone rect is the wrong element

`homeEggDropRef` points to the small egg thumbnail *inside* the sheet, not the large spotlit egg in the center of the screen.  The drag `onUp` check against `homeEggDropRef.getBoundingClientRect()` always misses when the player drags toward the real egg.

**Fix:** During tutorial step 5, bypass the rect check entirely.  Accept **any** `pointerup` on a potion as "used on egg."

## Bug 3 — Players deplete potions and get permanently stuck

The grant endpoint returned 409 when `tutorial_hatch_potions_claimed = true`, even with 0 potions remaining.  Broken drag code consumed potions without advancing the step.

**Fix:** Server checks inventory count.  0 potions → re-grant regardless of claim flag.

## Bug 4 — `hatch_started_at` is NULL on tutorial eggs (confirmed on Railway)

The `use-special` route returned 400 "Egg has not started hatching" when `hatchStartedAt` is null.  Tutorial eggs granted at step 4 never had the hatch timer started, so **every** speed-up potion attempt silently failed at the server — confirmed by querying Railway directly.

**Fix (server/routes.ts, use-special handler):** When `hatchStartedAt` is null, treat current time as the start and apply the speed-up offset from there, instead of returning 400.  One user confirmed on Railway with NULL hatch_started_at + 3 potions + correct IDs.

**Why:** The egg grant flow at step 4 never calls `hatchStartedAt = now()`.  Any potion-on-egg action against an un-started egg hit this 400 silently.  This was the definitive blocker once all the z-index / touch-event issues were resolved.

**How to detect:** Query Railway: `SELECT hatch_started_at FROM user_inventory WHERE id = $activePetId`.  If NULL with `is_hatched = false`, this bug is the cause.
