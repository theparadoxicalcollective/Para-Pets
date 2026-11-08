# Player Avatar, Player Level and Shared Companion Team — Program Roadmap

**Updated:** 2026-11-08  
**Numbering:** `Avatar 01/12` through `Avatar 12/12` are *program phases/PR identifiers*, not GitHub PR numbers. If one phase must be split, use `07A/12`, `07B/12` and update this ledger.  
**Progress:** 4 of 12 phases merged; **Avatar 05/12 in implementation**. Merged does not mean verified on physical devices.  
**Branching:** Every next PR starts from the latest merged `main`; do not stack on an unmerged feature branch. The user reviews/merges after checks.  
**Supported gameplay:** iOS and Android phones/tablets. Desktop gameplay stays behind Coming Soon, with existing admin/auth exceptions.

## Approved user-facing target

1. A distinct 2D **player avatar**, not a fake pet inventory record, takes the central active-pet position on the main-page stone platform. The main page no longer shows the pet or its Pet Menu.
2. The **player's name, level and XP bar** live in the former pet name/level area *beneath the central avatar*. The top-left profile picture remains; it is not the new animated avatar or the XP location.
3. The **five curved main-page stars** remain, all empty initially. Future player-star rules are deferred and must not be inferred from pet rarity or player level.
4. The **saved five-pet team** is shown as five compact, editable portraits in the lower main-page area and is shared across PvP and Raids, with no forced active pet in slot one.
5. Each **hatched pet's inventory Select/Active button becomes Pet Menu**. Tapping it opens four buttons (Pet Care, Level Up, Power Up, Closet) as a small garden-tool-like expansion arc; reuse uploaded icon art and existing pet pages, keeping actions scoped to that *pet inventory ID*. Eggs retain inventory-based hatching and speed-up.
6. Admin Realm → Add Character gains an **Avatar** tab. Default front-facing base parts: head, open eyes, body, left arm, right arm, left leg, right leg. Each part supports relative placement, pivot, order and an animated preview.
7. Admin item catalog gains a distinct **clothing** type (current `costume` means pet adornment). Avatar clothing fitting/equipment follow part pivots and remain separate from pet adornments.

## Explicit boundaries

- Owned pets keep individual care, levels, power-ups, adornments, evolution and inventory records.
- **Murk Cave redesign is deferred.** Keep its three-pet roster, existing active-pet compatibility, per-pet progress and combat behavior intact for now. Do not quietly expand it to five.
- Pet Park deposit/equip slots and its pet XP remain independent of the battle team.
- Existing player worlds stay live. New World Editor scenes are private admin drafts until an independent publishing project; avoid binding the avatar renderer to unpublished editor content.
- Continue native device-viewport positioning and mobile Safari lifecycle/memory protection. Never restore 390 × 844 hard constraints or enable desktop gameplay.
- No forced changes to PvP matchmaking, Raid tickets, boss HP, potions, currencies or combat rewards.
- Player XP sources, starting levels, Clearing combat stats and future player-star progression require separate, explicit design decisions.

## Numbered delivery ledger

| Program PR | Implemented feature/scope | Code/PR status | CI/behavior verification |
| --- | --- | --- | --- |
| **Avatar 01/12** | Server-authoritative five-pet team, existing PvP table, validation and account API | **Merged — GitHub #995** | CI passed; post-merge live-device verification not recorded |
| **Avatar 02/12** | PvP and Raids consume/edit the **same** roster; no active-pet slot lock; Raid battle consumes saved-team snapshot | **Merged — GitHub #1028** | User confirms checks passed; deployed mobile/tablet verification not recorded |
| **Avatar 03/12** | Pet-ID routing for Level Up, Care, Closet, Power Up and egg workflows; safely extract only Home-coupled pet logic | **Merged — GitHub #1029** | CI passed; user confirms merged; physical device verification not recorded |
| **Avatar 04/12** | Inventory Pet Menu expanding arc, each owned hatched pet's Select becomes Pet Menu; existing art | **Merged — GitHub #1030** | User confirms merge; physical device verification not recorded |
| **Avatar 05/12** | Account player-level/XP persistence, server receipts, profile API; no reward source cutover | **Open GitHub PR #1031** (`feature/avatar-05-player-progression-foundation`) | Code and focused tests added; CI, review, and device verification pending |
| **Avatar 06/12** | Admin Avatar tab, default avatar base, seven transparent parts with transforms/pivots | Planned | Save/reload, image boundaries, role checks and device editing |
| **Avatar 07/12** | One lightweight PlayerCharacterRenderer with idle/walk; same rendering in admin preview and game | Planned | Motion/pivots/depth, low-memory lifecycle tests |
| **Avatar 08/12** | Avatar clothing type, fitting editor, owned equipment and wardrobe | Planned; split into 08A/08B if necessary | Ownership, equip/unequip, animation follow; pet adornments unchanged |
| **Avatar 09/12** | Main page lower HUD: player name/XP, five unfilled stars, five saved team portraits | Planned | Small-phone/tablet layout, empty team, long names, safe-area |
| **Avatar 10/12** | Central avatar replaces Home active pet; main-page pet menu removed; onboarding/quest pointers migrate | Planned | Guarded coordinated release after 03–09; preserve welcome rewards |
| **Avatar 11/12** | Avatar walking in existing exploration scenes; separate actor visuals from combat source | Planned | Camera/bounds/ordering/clearing-session tests; no new world publishing |
| **Avatar 12/12** | Approved player XP awards, legacy compatibility audit, performance regression and cleanup | Planned; split if necessary | No duplicated XP; all mobile/tablet acceptance gates |

**Do not mark a phase complete because its PR merged.** Record separately: code implemented → CI passed → merged → live behavior verified. A feature may be marked *released and verified* only with recorded behavior evidence.

## Avatar 02/12 implementation contract and acceptance

- PvP and Raid lobby selection must use `GET/PUT /api/player/pet-team` with the server roster; do not add a new team database or migrate the old Raid localStorage roster over a saved PvP team.
- Both screens can add/remove any eligible pet from **all five slots**, including the first. The old `activePetId` remains available only for features not yet migrated.
- Shared account-scoped query and serialized writes prevent a rapid earlier selection response from restoring an older roster in the same client.
- Failed saves display a clear error and roll back to the most recent server-confirmed roster; loading cannot be treated as an empty saved roster.
- Raid battle uses a one-time confirmed roster snapshot for that active session, never `raid:petIds:v1` or an arbitrary first-five fallback; potion selections remain unchanged.
- PvP battle start and Raid ticket consumption must not begin while the team save is pending or with zero selected pets.
- Keep PvP opponents/defender handling, tickets, ranks and outcomes unchanged; keep Raid boss, rewards and potions unchanged; **Murk Cave untouched**.

## Avatar 03/12 acceptance contract

**Scope:** Prepare the existing pet actions for the inventory Pet Menu in Avatar 04/12, without prematurely deleting the active-pet main-page implementation.

- [x] Review existing Pet Care, Level Up, Closet, Power Up, inventory egg hatching and server ownership checks.
- [x] Pet Care and Level Up already target their own inventory IDs; add allowlisted return-to-Pets navigation for future inventory menu entry.
- [x] Closet already accepts an explicit inventory ID; retain its existing Home/Pet House entry and give inventory-launched actions a safe return-to-Pets option.
- [x] Introduce a **pet-ID Power Up route** reusing the existing `PetPowerUpPage` and `/api/pet/:inventoryId/power-up` / `use-special` endpoints; do not duplicate the complex power-up renderer or server logic.
- [x] Share existing Power Up item stacking/capacity rules between Home and the pet-ID route, retaining the first owned inventory row as the consume target.
- [x] Preserve inventory-independent egg hatch-check and hatch-time item use by owned inventory ID; do not change either endpoint or any egg interaction while the Home page is still active.
- [x] Define pet-action URLs for the inventory Pet Menu to use in Avatar 04/12, with `?from=pets` as an allowlisted return marker.
- [x] Restrict all newly routable action pages to hatched pets, leaving inventory egg handling to the existing egg interface.
- [ ] CI type check, test compilation, full test suite and production build.
- [ ] Manually verify on phone and tablet: direct owned pet routes, egg deep-links, correct pet/images, Power Up consume and evolution refresh, route close behavior, old Home actions, nonblocking inventory hatch flow.
- [ ] Merge only after review; record deployed behavior separately.

**Deferred to 04/12:** Replace inventory Select with expanding Pet Menu. This PR does not expose a second player-facing Pet Menu or remove Home's existing controls.

## Avatar 04/12 acceptance contract

**Scope:** Hatched owned pets now open Pet Care, Level Up, Power Up and Closet directly through the prepared inventory-ID routes. The old Home Pet Menu remains alive until Avatar 10/12.

- [x] Reuse the approved uploaded menu/action images and the *visual interaction* of garden-tool bubbles, without importing garden state or mutations.
- [x] Put one menu trigger where Select/Active used to appear on every hatched pet in the main Pets inventory. Show the four action bubbles in a compact viewport-HUD arc, mirroring toward the available screen space and flipping down when near the top.
- [x] Only one menu open at once, with outside pointer dismissal that doesn't block underlying scroll/click, keyboard Escape and scroll/resize dismissal.
- [x] Each action passes the selected **owned pet inventory row ID** into the matching /pet-care, /pet-level-up, /pet-power-up or /equip-accessories route with an inventory return marker; action pages remain responsible for ownership/hatching validation.
- [x] Egg hatching, hatch-check and hatch-time items stay unchanged. No pet action menu for unhatched eggs.
- [x] **Temporary compatibility:** a small “Show on Main” link remains on hatched pet cards while the current Home active pet and Murk Cave still depend on the legacy activePetId field. This is not a fifth bubble or an automatic active-pet selection. Remove it during Avatar 10/12 after verifying legacy feature migration.
- [x] Keep existing Home Pet Menu, quest spotlights, petting and modal routing for now; do not remove pet-specific behaviors early.
- [x] Add viewport geometry, target-ID, active-pet compatibility, touch/scroll and egg regression assertions.
- [ ] Confirm type check, test compilation, full tests, build, and existing public-route smoke checks on the **PR head commit**.
- [ ] Manual phone/tablet verification: menu on top/bottom/left/right cards; no clipping and pass-through scroll; tap-outside and Escape dismissal; correct pet on all four destination pages; Closet close returns to inventory; eggs still hatch; main pet can still be changed for the old Home.
- [ ] Merge after review; separately record post-merge live verification.

**Deferred:** Player level, main-page team HUD, avatar art/clothing, replacement of Home active pet, and Murk Cave redesign.

## Avatar 05/12 acceptance contract

**Scope:** Independent account player level/XP foundation, read-only profile API, and transactional duplicate-resistant award mechanics. This phase **does not give players XP** or change any active-pet reward source.

- [x] Add `player_progression` and `player_xp_receipts` with account-ownership foreign keys, a unique (user, source, event) receipt key, safe nonnegative XP constraints, and additive idempotent startup migration.
- [x] Existing accounts without a progression record read as **Level 1, 0 XP**; no forced backfill or conversion of historical pet XP and no writes during a profile read.
- [x] Add authenticated **GET /api/player/progression** with private/no-store response. Do not accept user-provided account ID or expose a POST/PUT client XP award route.
- [x] Add internal receipt-bound award function using a transaction, progression-row lock, source/event idempotency key, XP validation, overflow protection and monotone level verification. A future trusted reward handler must explicitly supply its approved level curve.
- [x] Leave `nextLevelTotalXp` and `xpToNextLevel` null until the experience curve is agreed; these are not copied from the active pet.
- [x] Preserve all pet progression, economic, combat, PvP/Raid, Murk Cave, Pet Park and World Editor behavior unchanged.
- [x] Add pure operation tests for receipt retry, duplicate/different amount, bad input, overflow and level monotonicity, plus route/migration contracts.
- [ ] CI check, test compilation, full tests, production build and browser smoke results verified on latest commit.
- [ ] PR merge/review and production GET behavior checked for existing and new accounts; physical phone/tablet testing separately recorded.

**Decisions before activating XP sources:** confirm which activities award player versus pet XP, whether existing account accomplishments should receive credit, and the actual progression curve/cap. An internal award service alone does not mean rewards are enabled.

## QA acceptance for every PR

- Inspect the current code and compare against working behavior before editing. Change the smallest complete unit; no parallel duplicate renderers/services.
- Include domain tests for owner scope, invalid rows, duplicated IDs, async races and retry paths where relevant. Review actual UI event wiring rather than only text snapshots.
- Run `npm run check`, `npm run check:tests`, `npm test`, `npm run build`. Record CI results.
- Run targeted phone/tablet browser smoke tests, then physically verify relevant flows on an iPhone, Android phone and tablet where available. Emulation is **not** proof of real-device success.
- Confirm PC Coming Soon, forest-green/gold UI, current navigation/viewport, Pet Park, World Editor and unrelated features remain intact.
- On regression, investigate the responsible PR before stacking changes. Track merged and verified outcomes separately.

## Remaining design decisions

1. Player XP: which general rewards transfer from active-pet progression to account XP; which remain individual pet XP?
2. Initial player level for existing players; level curve/cap.
3. Clearing combat actor/stats: player avatar or selected companion? Do not change combat formula until agreed.
4. Avatar default artwork/base selection and whether a player customization screen launches with first-time onboarding.
5. Future star-award rules — not part of the first release.

## Historical context

- #995 introduced `server/petTeam.ts`, `server/routes/playerPetTeam.routes.ts` and server-side validation. No player-facing team UI was added at that stage.
- #1002 retired the old Begin Journey walkthrough. Later onboarding should build on `WelcomeGiftScreen` rather than resurrect the old active-egg selection tutorial.
- #1014–#1027 developed and stabilized the private World Editor and Pet Park tools. Do not publish those draft worlds as a side effect of the avatar program.
