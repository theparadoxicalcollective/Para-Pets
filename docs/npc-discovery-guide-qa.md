# World / NPC discovery guide investigation

Audited against `main` at `a34f2b84d25deb0506d525174a0cc2a64c51d2d6`.

## Existing implementation to retain

- `App.tsx` mounts the discovery guide after Begin Journey. Scene and HUD
  hosts intentionally use `pointer-events: none`; interactive portal children
  restore `auto`. Root gameplay uses the device viewport, with a centered
  native-pixel portrait surface on desktop.
- `NpcQuestDiscoveryGuide.tsx` reads the three NPC locations, directs the
  player through the current main menu and world map, measures DOM targets,
  and uses the shared spotlight. Its index is saved per player in this browser.
- `QuestGuideSpotlight.tsx` converts measured bounds into HUD coordinates.
  Pan mode keeps gestures live; tour mode advances on the highlighted NPC
  without activating its quest. `WorldLocations.tsx` owns the live hotspots.
- `questGuideOwnership.ts` suppresses secondary quest pointers during onboarding.
  Moderator/QA quest resets already publish a per-player discovery reset token.
- The desktop HUD positioning correction from PR #904 is present. It should
  be retained rather than replaced with another reference stage or overlay.

## Confirmed defect and correction

The shared spotlight rejected any target with a `pointer-events: none`
ancestor. That contradicts the existing portal design: a descendant with
computed `pointer-events: auto` is clickable through such a host. The check
could suppress both the ring/arrow and the tour's NPC hit test despite a
visible, usable target. Lonelle has a matching visibility check.

Check the target's computed pointer value, while continuing to reject hidden,
transparent, or zero-size targets/ancestors. Keep existing selectors, polling,
world coordinates, saved placements, progression, rewards and event ownership.
This correction adds no device-size gate or 390 × 844 dependency.

## Executed verification

`script/npc-discovery-smoke.mjs` runs the real discovery and shared spotlight
components, CSS, arrow asset and desktop viewport calculation in Chromium.
Navigation/hotspot markup and API responses are isolated fixtures: this is not
an authenticated full-game or production-database test.

The original spotlight fails the initial pointer assertion. The correction
passes at 320×568, 360×800, 390×844, 430×932, 800×1280, 834×1194 and 1440×900:

- Main-menu and world-map pointers render inside the gameplay surface.
- Disabled targets, transparent hosts and modal dialogs suppress pointers;
  closing a modal resumes the guide without resetting progress.
- Pointer drags reach an initially offscreen NPC; touch/mouse taps advance
  Ginny → Janson → Lonelle and save the expected index.
- Scenery taps do not advance, delayed clicks do not open NPC quests, and
  completion remains complete after reloading.

Run with the same optional Playwright installation used by the existing browser
smoke pilot: `node script/npc-discovery-smoke.mjs`. The opt-in browser workflow
also runs it. No production credentials or QA funding are used.

## Still unverified / next QA pass

Railway requested reauthentication, preventing access to configured QA account
credentials in this session. No production player or QA quest state was reset.
Live QA-account testing and physical iOS Safari / Android testing remain open.
A merged PR or a Chromium viewport pass must not close those items.

Use a dedicated QA profile to run Begin Journey, this discovery tour, Ginny's
Closet/equip flow and Lonelle's full battle/scarf/equip/return flow. Record the
exact step and viewport for any failure before changing another component.
The fixture does not validate real camera gestures, location data, server quest
transitions or reward delivery. Discovery progress remains browser-local; this
change does not introduce cross-device step synchronization. Missing NPC
locations are currently filtered from the tour and need production-data QA.
