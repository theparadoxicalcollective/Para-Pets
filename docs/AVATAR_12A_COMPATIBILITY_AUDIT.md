# Avatar 12A/12 — compatibility audit and release gates

**Prepared:** November 9, 2026  
**Baseline:** `main` at `a7fa17c47d38aee571e00c94531b8cb95bad5478`, after merged PRs #1040 (moderator maintenance entrance) and #1041 (walking).  
**Scope:** scoped safety audit and account-cache correction; **not** a claim that real-device or production-db testing is complete.

## Decision

Split the last phase into **12A (audit, account isolation, regression gates), 12B (approved XP rules), and 12C (device-backed compatibility cleanup)**. 12B must not invent XP amounts, player-level thresholds or star rewards; 12C must not remove compatibility code that is still needed by live pets, quests or cave sessions before real-device verification.

## Evidence and disposition

| System | Actual code / dependency | Decision now | Verification still required |
| --- | --- | --- | --- |
| Home actor | `HomePage.tsx` uses `AVATAR_10_HOME_CUTOVER=true` and renders `HomeAvatarStage`; old pet JSX/effects remain under disabled branches | **Preserve legacy Home subtree** until 12C. Removing it now would bundle a broad Home refactor with XP work | Sign-in/first-save, supported devices, chat/support, background, tutorial and quest paths |
| Player avatar cache | Home `HomeAvatarStage` and Clearing `WalkAroundScene` were keyed by account ID; `PlayerAvatarPage` still stored its result at the shared `["/api/player-avatar"]` key | **Fix in 12A**: same account-scoped key for Home, wardrobe and walking, including first-save/equip success and error invalidation. Route provides verified `user.id` | Two-account sign-out/in test; equip with one account, switch accounts; second device/stale revision |
| Pet Care/Level Up/Power Up/Closet | Pet inventory ID routes and inventory arc remain live independently of the Home visual actor; Home's old `action=powerup` and `questHint` paths redirect to owned-pet pages | Do not delete pet records, rename pet XP or change inventory APIs | All four actions, egg hatching and speed-up, active/featured pet changes, quest handoff |
| Featured Companion / Clearing | Clearing's combat session still requires an inventory-owned featured pet ID; saved player avatar is the visible walking actor. No featured pet shows the nonblocking notice | Retain `activePetId`, pet combat stats, special activation, session checks and reward handling; no player-damage conversion | Joystick touch release/cancel, combat hitboxes, special glow, enemy/chest/rewards, no companion |
| Shared team | `/api/player/pet-team` continues to write the existing saved PvP battle group used by Raids; independent of Pet Park and the featured pet | Keep a single five-pet roster; no cave 5-pet migration | Five portraits, duplicates/listed/egg exclusion, same roster PvP/Raids, server-save errors |
| Player XP | `/api/player/progression` is GET-only; `awardPlayerXp` uses locked account rows and unique event receipts but requires a supplied `levelForTotalXp` policy; no approved earn sources are hooked up | **12B requires approved XP curve and amounts**; no client-write XP and no reuse of pet XP | Level thresholds, XP balance/overflow, event idempotency, transaction atomicity with rewards |
| World Editor / walking | World Editor draft routes in `worldSceneDraft.routes.ts` and `worldSceneContent.routes.ts` are `isAdmin` only. The walking component has an explicit `features.movement` opt-in for the live Clearing | Do not make private draft worlds public or automatically enable walking in the editor; publishing is a separate reviewed project | A future published scene needs authenticated public read/runtime binding and bounds contract |
| Maintenance / access | `shared/maintenanceAccess.ts` admits admins/moderators at maintenance login. Admin route protection remains separate | Keep the maintenance setting and role flags unchanged | Real existing admin, moderator, regular user, revoked moderator and email-unverified accounts |
| Device/runtime | Home and walking reuse viewport/world coordinates, not a restored 390×844 reference plane; desktop remains behind Coming Soon | Maintain iOS/Android phones/tablets, no desktop unlock | iPhone small/large, Android, tablet, Safari lifecycle, safe areas and overlays |
| Clothing | `server/routes/playerAvatar.routes.ts` validates player ownership/equipment, while public shop acquisition is currently blocked | Do not silently open clothing purchases or alter pet adornments | Admin fit/publish and account-owned equip, incompatibility/listing and revision conflicts |

## 12A regression contract

- One authenticated, account-specific avatar query key for **Home, player wardrobe and Clearing**, with writes and invalidations updating only the signed-in user.
- No unscoped cache entry storing an account's appearance.
- No XP mutation endpoint, player XP curve, player stars, shop release, combat rebalancing or database migration.
- Legacy pet compatibility, Murk Cave three-pet scope, admin-only world drafts, moderation access boundaries and the desktop lock remain unchanged.
- Run application typecheck, test typecheck, full test suite, production build and browser workflows on the **final PR head**. Record that as automated verification only.

## 12B — decisions required before an XP PR

1. **Level curve:** XP thresholds, starting level (currently persisted default level 1 and 0 XP), maximum level, any prestige or resets, and whether levels can be revised later.
2. **Sources and amounts:** explicit activity-by-activity XP awards (e.g. quest claim, clearing completion, daily activities), their limits/cooldowns, and which events are excluded.
3. **Idempotency:** unique server event ID for each award and transaction coupling to coins/items/essence when one action awards multiple rewards.
4. **Presentation:** when to fill a level bar. The existing five *player stars* must stay unfilled until their own earning policy is approved.
5. **Backfill:** whether existing accounts receive a one-time grant; default is **no grant** without an explicit decision.

**Do not enable XP awarding while any of these rules are undefined.** The locked progression/receipt functions are available for a later, deliberately authorized integration.

## 12C — remove old code only after a QA gate

1. Test the merged 12A and later 12B changes on **physical iOS and Android phones and tablets** in maintenance using real admin/moderator QA accounts. Do not claim hardware QA from browser emulation.
2. Compare all quest tutorials, pet menu actions, eggs, hatching/evolution, item inventory, Murk Cave and Clearing sessions to working behavior before any deletion.
3. Trace every remaining old Home function, effect, import, modal and local-state reference. Remove in small groups with explicit tests and no new rendering abstraction, leaving original coordinate systems/world-editor placements intact.
4. Confirm real mobile performance (render and image loading, low-memory Safari, navigation, touch gestures), as well as no account leak and no desktop unlock.
5. Only after this evidence, mark **Avatar 12/12 complete**. Merging code by itself is not an on-device release pass.

## Current release checklist (not yet confirmed)

- [ ] Deployed first-time character save and return Home
- [ ] Existing character + multiple layers after refresh/sign-out/account switch
- [ ] Admin drag-to-fit clothing and published base/snapshot behavior
- [ ] Shared team saves and PvP/Raid consumption
- [ ] Pet-ID menu, eggs, power-up quest redirects and Murk Cave
- [ ] Clearing walk joystick, collisions/depth, special-skill readiness and combat
- [ ] Admin/moderator/ordinary maintenance login on real accounts
- [ ] Mobile Safari, Android and tablet viewport, safe-area, memory and navigation tests
- [ ] Approved XP curve, approved earn sources and real transaction/idempotency tests (12B)
- [ ] Evidence-backed removal of dead Home code (12C)
