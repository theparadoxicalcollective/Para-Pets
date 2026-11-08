# Player Avatar, Player Level and Shared Companion Team — Program Roadmap

**Updated:** 2026-11-08  
**Numbering:** `Avatar 01/12` through `Avatar 12/12` are *program phases/PR identifiers*, not GitHub PR numbers. If one phase must be split, use `07A/12`, `07B/12` and update this ledger.  
**Progress:** 1 of 12 phases merged; **Avatar 02/12 in implementation**. A merged PR does not mean the feature is confirmed on physical devices.  
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
| **Avatar 02/12** | PvP and Raids consume/edit the **same** roster; no active-pet slot lock; Raid battle consumes saved-team snapshot | **Implementation on `feature/avatar-02-shared-pvp-raid-team`** | Automated checks and mobile/tablet verification pending |
| **Avatar 03/12** | Pet-ID routing for Level Up, Care, Closet, Power Up and egg workflows; safely extract only Home-coupled pet logic | Planned | Preserve pet-targeted mutations, rewards and page navigation |
| **Avatar 04/12** | Inventory Pet Menu expanding arc, each owned hatched pet's Select becomes Pet Menu; existing art | Planned | Popup hit areas/scroll/viewport tests; preserve eggs |
| **Avatar 05/12** | Account player-level/XP persistence, server receipts, profile API; no reward source cutover | Planned | Transaction/retry tests; decide starting level and XP curve first |
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
