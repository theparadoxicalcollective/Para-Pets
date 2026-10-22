# Pet Park — Phase 1 dependency audit and replacement contract

Status: **planning / no production cutover**. Keeper's Central currently displays a black screen according to player observation; root cause is **not verified**. Do not equate a passing unit test with rendered gameplay verification.

## Confirmed product decisions
- Replace the Keeper's Central destination with **Pet Park** when the replacement is ready.
- One free deposited-pet slot; slots 2 and 3 unlock with coins. Maximum 3 deposited pets per player.
- Each deposited pet accrues its **own pet experience**, plus coins and essence for the owning player.
- Rewards are **manually collected**. No automatic wallet credit on background timers.
- Admin edits park background, park decor and interactive spots (initially sleeping; extensible).
- Only one pet can occupy or reserve each interactive spot.
- Pets reuse home-style pet artwork, evolved form and equipped visual layers where supported. Idle rest, short bounded hops/floats, and spot interactions are cosmetic and must not determine earned rewards.

## Verified existing dependency map
| Surface | Current implementation | Cutover guidance |
| --- | --- | --- |
| Navigation / modal | `client/src/components/FloatingNav.tsx`: `RIGHT_ITEMS` contains `keepers` labelled Central; `showKeepers` renders `PetWorldPage` through `ViewportModalPortal`; `keepers` is staff-locked | Replace destination only after Pet Park loads for normal players; retain modal close/nav behavior. |
| Existing Central gameplay | `client/src/pages/PetWorldPage.tsx` (large component), `WORLD_ID = "pet_world"`, authored 1080 × 691 world canvas, joystick, camera, doors, decor and multiplayer state | Do not rename this component or reuse its camera as Pet Park; preserve for rollback until dependencies are cleared. |
| World API | `server/routes.ts` world decor/location handlers, `/api/world/pet_world/position-stream`, `active-pets`, `pet-position` | Audit consumers before disabling; not a Pet Park pet-deposit API. |
| Central-specific API | `server/routes.ts` `kc-kill-reward`, `kc-enemies`, `kc-doors`, door decor and shop handlers | Mark candidates for eventual retirement; check any other clients and reward effects first. |
| Database | `shared/schema.ts` `keepersCentralEnemies`, `kcDoors`, `kcDoorDecorPlacements`, `worldDecorItems`, `worldDecorPlacements` | **Do not drop** or repurpose tables in Phase 1; inspect live dependencies and migration history before eventual retirement. |
| Admin entry | `client/src/pages/AdminPage.tsx` uses section-key navigation, lazy editor loader, and `HomeBundleSection` | Add dedicated Pet Park section later; reuse editing patterns, not a copy of all home bundle state. |
| Home scene editing | `client/src/components/HomeBundleSection.tsx`, `client/src/lib/homeCrossDevice.ts`, home decor routes | Reuse scene-relative placement, sizing, upload, selection and drag concepts; don't mutate existing home bundle catalog or placements. |
| Pet visuals | `client/src/components/PetAnimator.tsx` supports idle, walk, house, static and sleep modes | Prefer existing visual pipeline; use lightweight park-only position scheduler with reduced-motion support. |
| Pet/account persistence | `shared/schema.ts` `userInventory` pet level fields and `users` essence; existing coin balance is part of user model | Pet XP must use the established pet progression contract; rewards must be server-authoritative and transactionally claimed. |
| Tests | `test/petCentralExpandedCamera.test.ts`, `test/petCentralFloatingJoystick.test.ts` | Retain until Central is actually retired. Replace with park viewport and interaction tests at cutover. |

## Phase gates / recommended PR sequence
1. **This PR — audit contract only.** No route, feature flag, DB, gameplay or reward changes. Record current dependencies and acceptance criteria.
2. **Data contract and migration.** Add independent park configuration/decor/interactive-spot tables and player slot/deposit/reward-ledger tables. Add migrations with safe defaults; do not reuse KC tables. Define rates, unlock prices, accrual cap, and XP level handling before writing reward logic.
3. **Admin editor.** Dedicated Pet Park section with background upload, decor editor and scene-relative interactive spot placement. Validate inputs and admin authorization. Reuse home editor patterns; avoid copying its entire component.
4. **Park player shell.** Implement a responsive, native-viewport park scene with safe empty/unconfigured state, loading/error states, and modal navigation. Do not enable for general players until smoke-tested.
5. **Deposits and unlocks.** Server-authoritative ownership validation, 3-slot cap, unlock purchases using existing coin transaction conventions, duplicate-pet prevention and pet retrieval.
6. **Visual motion and spots.** Cosmetic bounded hop/float/rest loop; deterministic single-occupant spot reservation and release; animations do not control accrual.
7. **Manual reward claim.** Accrue from persisted server timestamps with maximum cap. One atomic claim per accrual interval; ledger prevents double-claim on retries and concurrent requests. Grant coin/essence and each pet's XP through existing reward/progression functions.
8. **Cutover and retirement.** Replace staff-only Central nav with player-facing Pet Park after end-to-end tests. Verify links, modal close, touch/pointer, iOS/Android/tablet/PC layouts, and authenticated gameplay. Only then remove unused Central code/routes; table removal requires separate backup/migration review.

## Safety and testing requirements
- Investigate before editing and compare working home/editor/pet systems.
- Keep each PR limited to one coherent behavior. No 390 × 844 reference plane; scene coordinates belong to park artwork, UI to the current viewport.
- Never derive reward amounts from client animation frames or local device time.
- No deposits of pets not owned by the authenticated player; no simultaneous deposits of the same pet; check all inventory/active-pet restrictions before implementing.
- Persist unlocks, deposits and claim checkpoints. On retrieval, define whether accrued rewards must be claimed first (decision pending).
- Do not touch production database content during planning. Migration deployment requires review and rollback plan.
- Test admin editing, zero/one/three pets, concurrent spot reservation, coin insufficiency, repeated claims, server restart, offline accrual, keyboard and orientation, pointer drag, modal close, and responsive viewports.
- Distinguish automated tests from actual device verification; CI passing is not proof that Central's black-screen issue is fixed.
- Product parameters still pending: slot 2/3 unlock prices; coins/essence/XP rates; accrual cap; pet retrieval claim policy; whether pet XP can level automatically.

## Admin-controlled availability / under-construction gate
- Pet Park has a persisted, server-authoritative `enabledForPlayers` setting, **false by default** until explicitly published by an admin.
- The player navigation entry stays visible when closed. Opening it displays a themed **"Pet Park — Under Construction"** view, not the old black-screen Central or a broken empty scene.
- Admins can access the full editor and preview the unpublished park regardless of the player gate. Admin preview is not a substitute for production authorization.
- All player mutations (slot purchases, deposits, withdrawals and reward claims) must validate availability on the server. A hidden button alone is insufficient.
- When a live park is closed for maintenance, **do not discard deposits or accrued rewards**. Define and test whether accrual pauses at the closure timestamp or continues; preserve claim checkpoints and provide a safe way to retrieve pets. Do not implement a blanket API denial that traps deposited pets.
- Recheck availability at mutation time to avoid races with the admin switch; invalidate/refetch availability in clients after admin updates. Require existing admin authorization and audit setting changes.
- For future game pages, prefer a small reusable availability-gate contract (enabled flag, closed message, admin override, server mutation policy) after the Pet Park implementation proves it works. Avoid a broad feature-flag framework or changes to other pages in this phase.
- Acceptance tests: defaults closed; closed player sees message; admin can edit/preview; opening grants access; closing blocks new deposits/unlocks; existing deposits/rewards remain safe; unauthorized clients cannot toggle; toggling during a claim cannot double-award.
