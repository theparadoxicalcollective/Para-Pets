# Player Avatar, Player Level and Shared Companion Team — Program Roadmap

**Updated:** 2026-11-09  
**Numbering:** `Avatar 01/12` through `Avatar 12/12` are *program phases/PR identifiers*, not GitHub PR numbers. If one phase must be split, use `07A/12`, `07B/12` and update this ledger.  
**Progress:** 7 of 12 main phases merged; **08A/12 (#1035) also merged**, and **08B/12 implemented on a review branch**. The 08/12 sub-stages count together as one main phase once 08A–08C have merged; CI or merge is not real-device verification.  
**Branching:** Every next PR starts from the latest merged `main`; do not stack on an unmerged feature branch. The user reviews/merges after checks.  
**Supported gameplay:** iOS and Android phones/tablets. Desktop gameplay stays behind Coming Soon, with existing admin/auth exceptions.

## Approved user-facing target

1. A distinct 2D **player avatar**, not a fake pet inventory record, takes the central active-pet position on the main-page stone platform. The main page no longer shows the pet or its Pet Menu.
2. The **player's name, level and XP bar** live in the former pet name/level area *beneath the central avatar*. The top-left profile picture remains; it is not the new animated avatar or the XP location.
3. The **five curved main-page stars** remain, all empty initially. Future player-star rules are deferred and must not be inferred from pet rarity or player level.
4. The **saved five-pet team** is shown as five compact, editable portraits in the lower main-page area and is shared across PvP and Raids, with no forced active pet in slot one.
5. Each **hatched pet's inventory Select/Active button becomes Pet Menu**. Tapping it opens four buttons (Pet Care, Level Up, Power Up, Closet) as a small garden-tool-like expansion arc; reuse uploaded icon art and existing pet pages, keeping actions scoped to that *pet inventory ID*. Eggs retain inventory-based hatching and speed-up.
6. Admin Realm → Add Character has an **Avatar** tab with **eight front-facing animation base parts**: head, torso/top, left/right arm, left/right leg, left/right foot. Original 06/12 Body artwork is a reusable Torso source; its Eyes artwork remains archived for later Face clothing. Base part transforms are artwork-relative.
7. Admin Avatar → **Create Clothing** creates a distinct `clothing` shop item (never pet `costume`/adornment). Each clothing item has a name, one of seven wardrobe categories (head, hair, face, top, bottom, shoes, back), and up to eight separately uploaded/fitted transparent segments anchored to base parts. The player Avatar page has a top-centered preview, seven circular equipment buttons, and a horizontally scrollable owned-item inventory beneath it.
8. Tapping the avatar on Home opens the player Avatar page. Before a player has saved their first avatar, Home shows a gently animated gold **Design Character** circle at the character position, linked to that page. A published *global base* is not evidence that a specific player has created their character.

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
| **Avatar 05/12** | Account player-level/XP persistence, server receipts, profile API; no reward source cutover | **Merged — GitHub #1031** | CI passed; user confirms merge; deployed progression read/mobile verification not recorded |
| **Avatar 06/12** | Original seven-part admin Avatar draft/publish editor | **Merged — GitHub #1032** | User confirms CI/merge; real phone/tablet publish flow unverified; anatomy superseded by 07A |
| **Avatar 07A/12** | Align merged admin anatomy to eight base anchors; preserve legacy Body/Eyes; define separate seven-category, eight-segment clothing contract | **Merged — GitHub #1033** | User confirms merge; mobile/tablet anatomy verification not recorded |
| **Avatar 07B/12** | One lightweight PlayerCharacterRenderer with idle/walk anchored to new eight-part rig; shared with admin preview | **Merged — GitHub #1034** | User confirms merge; physical phone/tablet animation/placement verification not recorded |
| **Avatar 08A/12** | Admin Create Clothing: one named item with multiple part images, **drag-to-fit live avatar viewer**, scale/rotate, depth, and category selection | **Merged — GitHub #1035** | User confirms merge; actual phone/tablet fitting and deployed DB behavior not yet verified |
| **Avatar 08B/12** | Explicit per-user first-save avatar, immutable published base snapshot, owned clothing API, seven secure equip/unequip slots | **Open GitHub PR #1036** (`feature/avatar-08b-player-ownership-equipment`) | CI, account isolation, item listings/transfers, stale revisions and deployed API QA pending |
| **Avatar 08C/12** | Player Avatar page: top-centered character viewer, seven circular category buttons, scrollable owned clothing row under viewer | Planned | Thumb targets, narrow phones/tablets, empty states, equip previews, persistence, navigation |
| **Avatar 09/12** | Main page lower HUD: player name/XP, five unfilled stars, five saved team portraits | Planned | Small-phone/tablet layout, empty team, long names, safe-area |
| **Avatar 10/12** | Home avatar replaces active pet; tap avatar opens Avatar page; before player creates one show animated gold **Design Character** circle; remove Home Pet Menu only after pet routes are verified | Planned | Safe-area, gold animation/reduced motion, player created-state, quest guidance, welcome gifts, legacy Murk compatibility |
| **Avatar 11/12** | Avatar walking in existing exploration scenes; separate actor visuals from combat source | Planned | Camera/bounds/ordering/clearing-session tests; no new world publishing |
| **Avatar 12/12** | Approved player XP awards, legacy compatibility audit, performance regression and cleanup | Planned; split if necessary | No duplicated XP; all mobile/tablet acceptance gates |

**Do not mark a phase complete because its PR merged.** Record separately: code implemented → CI passed → merged → live behavior verified. A feature may be marked *released and verified* only with recorded behavior evidence.

## Updated avatar architecture — approved November 9, 2026

**Two orthogonal systems, not one overloaded inventory object:**

- **Animation anatomy — eight parts:** head, torso/top, left/right arms, left/right legs, left/right feet. This is reusable body art with part-relative coordinates and pivots. All animations and segmented garments use these same anchors; no second character-stage coordinate system.
- **Clothing wardrobe — seven independent categories:** Head, Hair, Face, Top, Bottom, Shoes, Back Accessory. These are the player's *menu/equip slots*, not physical skeleton segments. **One named owned item holds multiple images/segments**: Forest Wanderer Pants is one Bottom item with left- and right-leg images; Top typically has torso plus two sleeves; Shoes typically has left/right foot artwork. Admin upload boxes start from those category presets, but optional/atypical outfit segments are allowed.
- **Clothing rendering:** Each uploaded segment has its own **part-local** position, width, pivot, rotation, and front/behind plane; the eight-part rig is its animation parent. The left pants image follows the left leg, and the right pants image follows the right leg through walks/turns. The order Head → Hair → Face → Top → Bottom → Shoes → Back is the requested **player control order**, not fixed visual draw order. Back accessories may draw behind the torso even though their menu button is last. Do not position clothing in overall-viewport coordinates or make each segment a separate inventory item.
- **08A Clothing fit editor interaction:** Admin selects a named clothing item and category, uploads a PNG/WebP for an attachment (e.g. Left Leg or Right Leg), then sees it **immediately layered over the assembled avatar**. Selecting that piece enables finger/pointer dragging directly on the preview, plus size, rotation, pivot, small-step positioning and front/behind adjustments. Unselected avatar base parts should not move. The editor converts the visual drag into **attachment-part-local transforms** (including when the base part is rotated/scaled), so each garment follows its assigned animated limb. Tapping other items does not silently lose unsaved adjustments; Save Clothing persists all segments as one catalog item, and reloading the editor reconstructs the same fit. Offer a neutral idle/walk preview from the shared 07B renderer where available, without duplicating a second animation system. For phone/tablet, touch targets must remain usable, scroll works outside the fit canvas, and long image assets must not clip interactive controls.
- **Global base vs. player creation:** A published admin base is available to design with but does not automatically set a per-user saved appearance. The main-page Design Character prompt is shown until an explicit account-owned first-save event, not until a global base is published.
- **Persistence:** `shop_items` remains the source catalog for clothing type `clothing`; item segment definitions attach to that catalog item. Owned clothing comes from `user_inventory`; equipment saves by account/slot and validates ownership. **Pet costumes remain separate.**
- **Prior artwork:** Existing 06/12 draft Body maps to Torso/Top as a compatibility preview; original Body and Eyes remain stored, not automatically deleted. Original published seven-part snapshots remain intact until a complete eight-part base is deliberately published.
- **Navigation:** The Home avatar and the gold create-circle both open the same player Avatar page. The seven circular part/category buttons around the top-centered viewer select a matching scrollable clothing inventory below; selection previews and equip/unequip persist to the account.
- **Out of scope:** Murk Cave redesign, player-star awards, desktop gameplay, XP source awards and legacy removal are deferred to their planned stages.

### Avatar 07A/12 — compatibility and data-contract acceptance

- [x] Trace merged #1032 editor, published snapshot and existing profile avatars, pet costumes and shop inventory before editing.
- [x] Replace default seven-part editor vocabulary with eight animation anchors and matching part placement defaults.
- [x] Add legacy-aware readers for stored Body/Eyes; retain both original images in drafts, preview Body as Torso until replaced, never silently delete Eyes.
- [x] Require eight resolved base parts for publication; store only eight current layers in newly published snapshots, leaving previous published snapshots unchanged until explicit republish.
- [x] Define shared strict clothing categories and up-to-eight segmented attachments, including **part-local transforms**, front/behind planes and sensible per-category upload defaults; do not register a second store/renderer or activate clothing prematurely.
- [x] Add tests for old draft preservation, modern publish gating, segmented clothing validation and stable base layering.
- [ ] CI type checks, test suite, build and smoke tests on latest PR head.
- [ ] Admin phone/tablet QA: old Body preview, Eyes archive, new left/right foot uploads, saving/republishing, reload and no data loss.
- [ ] Merge and separately record actual production behavior.

**07B should not start until 07A code is merged and the anatomy compatibility path is verified.**

## Avatar 07B/12 — shared eight-part renderer and animation preview

**Scope:** Create **one** lightweight player-character image compositor for gameplay/editor reuse. Its input is the already approved eight-part, artwork-relative rig and its mode is `static`, `idle` or `walk`.

- [x] Trace current 07A part transformations, admin drag preview, pet idle/walk motion, and WalkAround movement bounds; leave those working systems untouched.
- [x] Extract eight-part image layering from `PlayerCharacterPartsPreview` into one `PlayerCharacterRenderer`, with deterministic zIndex and original x/y/width/pivot/rotation untouched.
- [x] Add subtle idle breath/head/arm/foot motion and mirrored walk arm/leg/foot cycles using CSS transforms with no timers, canvas redraws, or network calls. Respect `prefers-reduced-motion`.
- [x] Keep static mode as the editor's default. Add Edit, Idle and Walk admin preview controls; switch to motion modes without persisting or moving base placements.
- [x] Preserve existing draft save/publish lifecycle and legacy Body/Eyes compatibility. No fresh DB schema, route, or session tracking.
- [x] Add regression contracts for one compositor, independent static placement, CSS animation coupling, touch editing, and absence of pet/desktop/cutover changes.
- [ ] Confirm latest-commit TypeScript checks, test compilation, full tests, build and browser smoke on GitHub.
- [ ] Manual admin-device behavior: partially uploaded rig, different base dimensions, idle/walk motion, pivots, layer overlap, edit drag after previewing, orientation changes, reduced motion on phones/tablets.
- [ ] Merge only after review. Track deployed behavior separately.

**Deferred:** Clothes/attachments in **08A/12** (part-relative drag-to-fit admin); ownership in **08B**; player avatar page in **08C**; Home switch in **10/12**; walking in active game scenes in **11/12**. This PR does not enable PC gameplay or migrate pet animation logic.

## Avatar 08A/12 — admin clothing creation, fitting and guarded catalog publication

**Scope:** Admin Realm → Add Character → Avatar → Create Clothing. A named clothing item can contain up to eight fitted transparent images, each attached to one eight-part animation anchor. For example, one Bottom item can contain independent left/right pant-leg art. User ownership and equip controls remain 08B/08C.

- [x] Use the 07A garment shape and 07B **shared** character renderer, not PetAnimator, PetCostume equipment, a parallel stage, or legacy iPhone reference coordinates.
- [x] Add a lazy-loaded clothing editor within the existing Avatar tab, with forest-green and gold controls, clothing name, seven inventory category choices, eight optional part upload boxes, and sensible per-category defaults.
- [x] Live editor uses an existing **published eight-part base**. Finger/pointer dragging maps through inverse base-part rotation into that body's own image coordinates, so only the selected clothing image moves; the base anatomy remains fixed.
- [x] Add numeric controls for position, size, rotation and pivots plus front/behind plane selection, and preview Idle/Walk using the shared renderer and the same attached segment images.
- [x] Save/replace images **one at a time** through the game's existing PNG media processor. Save each segment to a private draft; preserve other clothing images and reject stale revision writes. Unsaved placements cannot disappear merely by switching pieces.
- [x] Add a private `player_clothing_drafts` schema and rerunnable migration, separate from pet adornments. An explicit **Save Clothing** transaction validates one or more segments and creates/updates a **single shop_items record with type `clothing`**, associated with one published avatar base version.
- [x] Keep catalog SKU in a reserved **unreleased** world and reject direct shop purchase, generic item creation/editing and deletion of clothing while 08B player ownership is unimplemented. Do not create a catalog item for an incomplete draft.
- [x] Add tests for two-leg item modeling, rotation-inverted pointer mapping, upload validation, admin authorization, DB revision guards, shop gate, and reuse of the one shared renderer.
- [ ] Latest head passes TypeScript, test compilation, full automated suite, production build and public-route smoke.
- [ ] Manual phone/tablet test: create outfit, upload multiple images, drag each piece, rotate body base, save/reload, change clothing slot, depth preview, save item, retry and stale-revision conflicts.
- [ ] Merge and independently verify deployed database and on-device behavior.

**Deferred:** No player can buy, equip, trade or create a character from this PR. That belongs to **08B** (account-owned clothing/equipment) and **08C** (player wardrobe). The Home create-circle and page cutover remain **10/12**. No PC gameplay changes.

## Avatar 08B/12 — player-created identity and authoritative wardrobe storage

**Scope:** Account-owned character creation, base snapshots, inventory lookup and seven secure clothing equipment slots. No player wardrobe screen yet, no Home avatar cutover, no new shop purchases, and no pet adornment changes.

- [x] Confirm Avatar 08A (#1035) is merged and trace authoritative `user_inventory`, shop catalog, published clothing design records, account auth, and pet closet ownership patterns.
- [x] New `player_avatar_profiles` row is created **only by explicit first-save action**, never on login or when the admin publishes a default base. Until then, the `GET /api/player-avatar` response reports `created:false`, allowing the later animated Design Character Home prompt.
- [x] First save retains a copy of the **eight published body parts** and the chosen base publication timestamp. A later admin republish cannot silently rewrite player anatomy or break compatible clothing.
- [x] One saved outfit is still one catalog item, although its published segment images may animate with separate limbs. Equipment is seven account-owned category slots linked to existing **inventory record IDs**, not bare catalog IDs.
- [x] `GET /api/player-avatar` reports created state, selected character base, current revision, strictly owned clothing definitions and equipped items. Listed, revoked, malformed or incompatible items cannot appear as wearable.
- [x] Transaction-safe first save (idempotent same-base retry), base switch (clears equipment references but preserves inventory), equip and unequip. Revision checks reject stale-device edits; server validates owner, quantity, unlisted status, category, published definition and base version before equipping.
- [x] New additive boot migration with owner/category uniqueness, inventory FK cascade and per-player snapshot; no inventory or player data reset.
- [x] Separate **Avatar Clothing** taxonomy/category from pet Adornments and Specials. Bag remains view-only; no additional pet action flows.
- [x] Preserve published clothing category separately from draft category, so unfinished admin edits do not change an owned item's slot.
- [x] Add focused tests for creation state, revision guards, ownership/isListed/quantity, category matching, base published version and no premature shop or Home cutover.
- [ ] Latest GitHub PR commit passes app TypeScript, test compilation, full suite, production build and public-route smoke.
- [ ] On deployed authenticated QA accounts: no avatar -> `created:false`, first save and retry, account isolation, fitted owned outfit equip/unequip, wrong user/item/category rejects, sold/listed item becomes unavailable, base republish snapshot stability, and stale revision conflicts.
- [ ] User reviews/merges the PR. CI and merging do not substitute for real phone/tablet behavior testing.

**Deferred:** Player-facing Avatar page with seven circular wardrobe selectors and a scrollable owned-inventory row (**08C/12**); five-slot Home HUD (**09/12**); clickable Home avatar / gold Design Character circle (**10/12**); exploration/combat/XP awards later. Ordinary shop clothing purchases stay blocked until acquisition/eligibility policy is separately approved.

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

## Avatar 06/12 acceptance contract

**Scope:** Admin Realm → Add Character → Avatar adds a dedicated seven-part avatar base editor with draft/published separation. No main-page character is rendered until Avatar 07/12 and the later cutover.

- [x] Add independent `player_character_bases` with one saved JSONB draft of exactly seven part types, separate published part snapshot, revision, timestamps, and one-default partial unique index. Additive idempotent migration runs before API registration.
- [x] Add distinct shared `playerCharacter` domain rather than extending pet templates or the existing `/api/users/avatars` profile-photo batch route.
- [x] Seven front-facing parts: head, open eyes, body, left arm/right arm, left leg/right leg. Save relative x/y, width, per-part pivot, rotation and layer order.
- [x] Reuse existing transparent PNG image processor; accept only bounded PNG/WebP upload data, store processed media URL, not base64, in a draft. Allow replacing a part without losing other placements.
- [x] Build a separate lazy-loaded responsive admin editor and shared static parts preview, with tap/drag positioning, numerical transform controls, per-part Save, and explicit default Publish.
- [x] Admin-only list, create, rename, part write/remove and publish endpoints; authenticated read-only published default; prevent stale draft overwrites using revision checks.
- [x] Require seven complete parts to publish, copy draft to published snapshot atomically, serialize competing publishes, and preserve earlier published artwork while editing a new draft.
- [x] Validate part types and transform bounds server-side and include focused tests.
- [ ] Latest PR commit: `npm run check`, `npm run check:tests`, `npm test`, `npm run build`, and browser smoke workflow complete.
- [ ] Admin device QA on iOS and Android phones/tablets: seven uploads, revisions, drag, pivots, scale/rotation, publish, draft edit after publish, reload, authorization and error messaging.
- [ ] Post-merge live behavior and database migration verification separately recorded. Do not mark released from merge alone.

**Deferred:** Avatar idle/walk renderer (07/12), clothing (08/12), main-page HUD and avatar replacement (09–10/12), world exploration (11/12) and XP awards (12/12). PC gameplay stays locked. No pet systems were migrated in this phase.

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
