---
name: Tutorial step-5 drag blockers
description: Three distinct bugs that silently blocked potion drag/tap in the speed-up tutorial step.
---

## Bug 1 — Modal outer-div swallows all touches (most critical)

`showPotionModal` and `showGrantModal` in `BeginJourneyOverlay.tsx` render a `fixed inset-0` wrapper at z-99010 with **default `pointer-events: auto`**.  This invisible full-screen div sits above the speed-up sheet (z-99002) and captures every touch, making potions appear "darkened out and unable to be dragged."

**Fix:** Add `pointerEvents: "none"` to the outer wrapper div; add `pointerEvents: "auto"` to the inner dialog div.

## Bug 2 — Drop-zone rect is the wrong element

`homeEggDropRef` points to the small egg thumbnail *inside* the sheet, not the large spotlit egg in the center of the screen.  The drag `onUp` check against `homeEggDropRef.getBoundingClientRect()` always misses when the player drags toward the real egg.

**Fix:** During tutorial step 5, bypass the rect check entirely in `handleHomeSheetItemPointerDown`.  Accept **any** `pointerup` on a potion (tap or drag in any direction) as "used on egg."

## Bug 3 — Players deplete potions and get permanently stuck

The grant endpoint (`POST /api/tutorial/grant-hatch-potions`) returned 409 when `tutorial_hatch_potions_claimed = true`, even when the player had 0 potions remaining.  Broken drag code consumed potions without advancing the step, leaving players stuck with no way forward.

**Fix:** Server now checks `user_inventory` count.  If the player has `> 0` potions → still returns 409.  If they have `0` → grants 3 more regardless of claim flag.  Client auto-calls grant silently (no modal delay) whenever step 5 detects no potions; only shows the "No More Free Potions" modal on failure.

**Why:** Three independent bugs had to ALL be present to see the symptom.  Never diagnose "drag broken" without also checking modal z-index stacking and server grant logic.
