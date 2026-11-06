# Player avatar, player progression and shared pet team — delivery tracker

**Status:** Implementation underway. This is a living record, not a claim that a feature works because its PR merged.
**Last reviewed:** 2026-11-06
**Branch policy:** Each PR starts from the latest `main`; do not stack fixes on unmerged branches.
**Device scope:** iOS/Android phones and tablets. PC gameplay remains behind Coming Soon; admin/auth exemptions stay intact.
**Excluded:** Murk Cave redesign, cave battle-party expansion, unrelated combat balancing, PC gameplay.

## Product boundaries

- **Player account:** identity and eventually independent player level/XP.
- **Avatar:** a distinct animated 2D player character (seven front-facing base parts initially).
- **Owned pets:** retain independent inventory, pet level, care, evolution, equipment and rewards.
- **Pet team:** one ordered selection of at most five eligible owned, hatched, unlisted pets for PvP/Raid and future compatible group activities.
- **Pet Park:** separate deposit/equip slots and pet-specific idle XP; not part of the battle team.
- **Murk Cave:** keeps its existing legacy active-pet and three-pet combat behavior until a separate, approved redesign.

## Delivery sequence

| PR | Scope | Status | Verified vs. outstanding |
| --- | --- | --- | --- |
| 1 | Shared pet-team backend: validate, persist, authenticated API, PvP compatibility | **In review** | Implementation and new automated tests added; CI, reviewer approval and merge pending |
| 2 | PvP and Raid consume one account-wide team; remove forced active-pet first slot | Planned | Must not alter PvP matchmaking, defensive rosters, Raids rewards or potions |
| 3 | Independent player level/XP persistence and transactional award policy | Planned | XP source policy and starting levels must be approved first |
| 4 | Admin avatar base-part editor and one shared avatar renderer | Planned | Seven transparent front-facing layers, validated sizing and positioning |
| 5 | Avatar clothing catalog, attachment, fittings and player equipment | Planned | Keep pet adornments unchanged |
| 6 | Main page avatar, player-level HUD and five pet portraits | Planned | Preserve scene/background and mobile/tablet layout |
| 7 | Per-pet action menu and Begin Journey/tutorial migration | Planned | Safely migrate in-progress tutorials; keep all pet care actions |
| 8 | Avatar presentation in supported walk-around scenes | Planned | Do not redesign Murk Cave or silently change combat rules |
| 9 | Approved XP sources and remaining avatar/combat compatibility | Planned | No duplicate XP, reward or session regressions |
| 10 | Scoped cleanup, regression verification, release hardening | Planned | Delete legacy behavior only after every dependency is migrated |

PR numbering is an implementation outline, not a commitment to batch unrelated changes. Split a PR when necessary to preserve an independently testable change.

## PR 1 contract / handoff

- Reuse `pvp_battle_groups`: **no second team table, schema change, team reset or backfill**.
- Preserve `GET/POST /api/pvp/battle-group` as compatibility APIs, and expose `GET/PUT /api/player/pet-team` for future screens.
- All saves are validated at the storage boundary, not trusted because a client picker filtered pets.
- Selection is ordered, max five, without duplicates or unowned/unhatched/listed/non-pet items.
- Writes are atomic upserts. Concurrent initial saves cannot create duplicate team rows.
- Reads resolve stale legacy IDs non-destructively. Client-visible power uses current pet stats, not an old cached value.
- Preserve existing PvP scoring, rank, tickets, rewards, battle composition, and active-pet UI in this PR.
- Do not add the main-page team selector until its own PR.

### PR 1 acceptance status

- [x] Shared domain validation and read reconciliation implemented
- [x] Account-level authenticated endpoint introduced; legacy PvP endpoint retained
- [x] Persistent save uses transaction and conflict-safe upsert
- [x] Tests added for eligibility, order, duplicates, max slots and API compatibility
- [ ] CI type checks, tests, production build verified
- [ ] PR reviewed; no unapproved regressions
- [ ] PR merged
- [ ] Live behavior verified after merge

**Known migration consideration:** Old saved teams may include pets no longer eligible. The GET projection excludes these pets without editing the saved record; a later explicit team save commits a clean lineup. Pet selection from active-pet UI and Raid-local storage remain unchanged until PR 2.

## Decisions to settle before later phases

1. Which activities award **player XP** versus XP to individual pets? Pet Park pet XP and pet-care-specific XP remain pet-owned by default.
2. Should newly introduced player levels start at 1 for everyone or recognize pre-existing accomplishments?
3. Clearing combat: should the avatar have its own combat stats/equipment, or should a selected companion power combat? Do not alter combat math before approval.
4. Which avatar base is the initial default, and when does the avatar customization become player-facing?

## Required review and testing record per PR

- Trace relevant state, storage, event and viewport paths and compare with a working implementation.
- List files changed and explain scope/exclusions.
- Test authorization, concurrent/retried actions and preservation of existing records where relevant.
- Pass `npm run check`, `npm run check:tests`, `npm test`, `npm run build`.
- Run appropriate browser smoke checks; distinguish emulator/browser results from actual iOS/Android device verification.
- Verify the PC restriction and forest-green/gold popup appearance wherever touched.
- Record CI and actual device behavior; **merged is not the same as verified working**.
- If regression appears, diagnose its responsible PR before beginning another.
