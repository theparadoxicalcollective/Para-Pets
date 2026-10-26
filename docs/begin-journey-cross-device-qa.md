# Begin Journey interaction QA

Base: `c52b325212d03f8b39ecfe958ea8ffa05eb0d169` (after #951/#952).

## Investigation

Traced `BeginJourneyOverlay`, the shared local-state/API acknowledgement code,
`HomePage`, `PetInventoryPage`/`PetInventory`, `FloatingNav`, HUD ownership,
and the server tutorial response contracts. Begin Journey has a separate
overlay from the shared NPC spotlight; the NPC tour fix did not repair this
overlay's potion control.

The baseline browser probe reproduced computed `pointer-events: none` on the
visible potion card inside the pass-through HUD. Its remaining fixed-position
rule also used browser coordinates instead of the HUD's portrait region.

The old release handler used a potion at any drop position. Catalog/grant and
inventory failures lacked usable recovery controls. Completion recovery depended
on inventory changing after a cooldown; unchanged query results could leave it
idle. Failure testing also reproduced duplicate completion dispatches while
polling, step updates and retries overlapped.

## Corrections

- Keep the potion card absolute within the current HUD and explicitly interactive.
- Check the current egg's client rectangle at drop time; taps, other drop
  positions and cancelled drags do not use a potion. Keep existing Home mutation
  ownership and pending-use guard.
- Expose catalog, egg-selection, potion-grant and inventory retry/error feedback.
  Report failed potion use through the existing toast system.
- Schedule completion retries explicitly and own completion requests synchronously
  so overlapping effects cannot dispatch duplicates.
- Bound and scroll the starter chooser within the measured HUD height.

No root stage, admin placements, device-specific runtime gate, reward amount,
database schema, server progression or authentication behavior is changed.

## Browser coverage

`node script/begin-journey-smoke.mjs` mounts the actual Home, collection,
navigation, Begin Journey and NPC discovery components with the current viewport
hook, CSS and portal hosts. It uses synthetic API responses and fixture auth
reconciliation, not the full App login/welcome/maintenance guards or a real DB.
It never logs into or resets a live player account.

The seven profiles are 320×568, 360×800, 390×844, 430×932, 800×1280,
834×1194 and 1440×900. Touch profiles use native Chromium touch dispatch for
potion drags; desktop uses mouse input. Tests check:

1. Reach the last choice in a 16-egg catalog, grant that choice, navigate to
   Pets, and activate its exact inventory row despite another owned 3-star egg.
2. Reach potion training, keep its card inside the HUD, reject taps/wrong drops/
   cancellations, use exactly three potions, hatch and record completion.
3. Hand off to the NPC tour, then use the real navigation/quest claim button;
   retain completion on reload.
4. On Android-sized and desktop profiles: retry failed catalog, starter grant,
   activation, potion grant, potion use, completion and coin claim requests.
   Double activation/use while pending must not dispatch duplicates.
5. Resize during potion training, recover a failed inventory reload after one
   potion without re-granting, recover step 6 before hatch confirmation, and
   keep another account's browser state isolated.

`--probe` targets the potion input regression; it fails against the original
overlay. `--recovery-only` runs the two extended recovery profiles.

The existing browser workflow also runs this script automatically on PRs that
change tutorial-related files, alongside its public-route and NPC tour checks.
It remains manually runnable. Node tests include separate server reward and
transaction tests; mocked browser responses do not establish live DB behavior.

## Still outstanding

- Dedicated live QA accounts through real login/welcome, inventory, hatch,
  completion and reward APIs; no production account testing occurred here.
- Physical iOS Safari and Android Chrome/WebView, including browser toolbar,
  keyboard, interruption and network behavior.
- Full Ginny, Lonelle, Janson and Home tutorial completion with live QA profiles.
- Intermediate tutorial steps remain browser-local. Cross-device continuation
  is not synchronized by this PR; completed flags remain server-owned.

Keep these items open after merge. Passing automated profiles is evidence for
the tested client interactions, not proof that every quest works on every device.
