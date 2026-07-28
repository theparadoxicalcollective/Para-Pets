# Elysian Bayou Clearing implementation status

Status reflects repository and automated-test verification on 2026-07-28. It does not claim Railway runtime verification where production access was unavailable.

| Feature | Status | Evidence / remaining work |
|---|---|---|
| Responsive background and camera | Complete and verified | Aspect-preserving world sizing and camera clamp tests pass. |
| Pet size | Complete and verified | Clearing-specific pet sizing is configured and covered by layout tests. |
| Movement boundaries | Complete and verified | Radius-aware bounds and server position validation are tested. |
| Inventory placement | Complete and verified | Fixed HUD inventory entry and modal are implemented. |
| Total Equipment Power | Complete and verified | Five-slot totals are returned and displayed. |
| Focus outline | Complete and verified | Equipment controls include keyboard focus styles. |
| Back label | Complete and verified | Equipment selection includes a visible Back control. |
| Menu combat pause | Complete and verified | Equipment, inventory, and chest-reward dialogs pause combat; pause duration shifts enemy timers so no queued impact fires on close. |
| Enemy facing | Complete and verified | Facing dead-zone and natural-orientation behavior are tested. |
| Coin and Essence HUD | Complete and verified | Clearing uses the `/api/auth/me` balance query and renders both values. |
| Correct Essence icon | Complete and verified | HUD and physical drops use the existing `attached_assets/Photoroom_20260709_23958_PM_1783626016795.png` standalone token; the bar remains separate. |
| Basic Sword grant and equip | Implemented but unverified | Transactional advisory lock, canonical ID, partial unique index, deterministic owned-weapon selection, immediate loadout response, and regression tests exist; Railway deployment must run the migration. |
| Sword/staff attack animations | Partially implemented | Attack styles and hit geometry exist; the client currently has a basic sword swing rather than complete weapon-specific art animation. |
| Simple attack misses | Complete for current melee enemy | The wraith winds up and checks current pixel distance at impact, then always enters recovery. Movement can cause a miss. No dodge action, stamina, i-frames, or queued post-dialog hit was added. Projectile roles remain scoped to the next phase. |
| Expanded enemy pool | Not implemented | Intentionally excluded from this focused repair. |
| Enemy clusters | Not implemented | Intentionally excluded from this focused repair. |
| Difficulty tiers | Partially implemented | Tier rarity/scaling foundations exist; expanded tier encounters do not. |
| EXP | Complete and verified | EXP is stored in the durable chest bundle on defeat and granted only by atomic Collect All. |
| Currency rewards | Complete and verified | Existing Coin (1–2) or Essence (10–20) amounts are stored in the chest; normal defeats no longer create or auto-collect loose currency icons. |
| Equipment rarity by enemy tier | Partially implemented | Rarity helpers exist; current single-enemy Clearing does not supply expanded enemy tiers. |
| Bayou consumable drops | Not implemented | No production drop flow exists. |
| Treasure chest rewards | Implemented and programmatically verified | One durable server bundle/chest is created per enemy ID, restored into a new active session, opened only by tap/click, and atomically claimed by Collect All. Authenticated runtime visual verification remains. |
| Multiple equipment rewards | Implemented and verified | The unchanged 6% expected equipment rate is split into independent 5% first-item and 1% second-item chances, capped at two equipment entries. |
| Chest rarity sparkle | Implemented and verified | Equipment rarity 3/4/5 selects restrained rare/epic/legendary points; currency alone selects none. Animation respects reduced motion and does not glow the chest canvas. |
| Equipment stat audit | Implemented but unverified | Audit helpers and tests exist; production item data has not been audited from this environment. |
| Helmet/weapon/armor/boots/charm admin support | Implemented but unverified | Shared types, schema migration, validation, admin fields, loadout, equip/unequip, sale guards, stat totals, and loot eligibility support all five slots; Railway migration remains required. |

## Production diagnosis and deployment

PR #58's starter query used a PostgreSQL `FULL JOIN` whose condition did not join the two relations with a merge/hash-joinable equality. PostgreSQL rejects that query with `FULL JOIN is only supported with merge-joinable or hash-joinable join conditions`, causing the unhandled session route rejection that the client reduced to “Combat unavailable.” The repair uses two explicit locked/ordered queries and returns safe structured errors while logging non-sensitive server context.

Deploy the application normally so essential boot migrations add `helmet_inventory_id` and `boots_inventory_id`, create the per-user canonical Basic Sword partial unique index, and seed/repair canonical item `a1b2c3d4-0011-4000-8000-000000000012`. Confirm migration logs before testing `POST /api/explore/elysian-clearing/session` on Railway. Direct Railway logs and its live schema were not accessible from this checkout, so the diagnosed PostgreSQL error is derived from the merged SQL and must be confirmed in Railway logs during deployment.


## Chest reward implementation notes

`clearing_reward_chests` stores owner, active session, Clearing, defeated enemy, rewarded pet, world position, JSON reward bundle, highest equipment rarity, creation, expiration, and claim timestamps. The JSON bundle contains EXP, Coins, Essence, an equipment array, and a future-compatible consumables array. Unique `(user_id, defeated_enemy_id)` identity makes defeat retries produce one chest. Claim locks the chest and rewarded pet, validates the stored equipment list, applies every value, and sets `claimed_at` in one transaction. A retry returns `alreadyClaimed`. Clearing equipment has no capacity limit or overflow/mail system, so every validated reward is inserted rather than discarded.

Unclaimed bundles are retained for seven days and reassigned to a newly created Clearing session when the owner returns. Leaving a session therefore does not lose a pending reward. Expiry cleanup is intentionally not automatic; a future durable pending-reward policy should be approved before changing retention.

The existing `attached_assets/hub_chest_opened.png` artwork is displayed at 48 CSS pixels inside a 56×56 CSS-pixel keyboard-accessible tap target. Nearby chests receive a stable small offset derived from the defeated enemy ID. Reward rows use 36-pixel currency icons, including the standalone paw-medallion Essence asset, while equipment uses separate 48-pixel cards. The dialog is width-bounded, vertically scrollable, and limited to 82vh.

## Recommended next contained phase (not implemented)

**Scope:** add a small production-reviewed roster of enemy species; explicitly assign melee and non-homing projectile roles; introduce normal, tough, and elite variants; tune small group composition/spawn pacing; then balance tier-aware chest probabilities, equipment rarity/stat budgets, and mobile rendering cost. Do not add dodge buttons, rolls, stamina, parries, combos, or precision controls.

**Acceptance checklist:**

- [ ] At least two visually distinct species have documented natural facing and assets.
- [ ] Melee attacks retain windup/current-distance impact/recovery behavior.
- [ ] Projectile attacks commit one visible trajectory, hit only on hurtbox intersection, and clean up on hit, expiry, bounds, pause, and session end.
- [ ] Normal/tough/elite health, damage, size, rarity caps, and reward chances are tested.
- [ ] Groups remain readable and bounded on narrow, standard, and tall phones.
- [ ] Spawn pacing prevents unavoidable overlapping impacts after menus close.
- [ ] Multi-reward probability simulations preserve approved average economy values.
- [ ] Equipment rarity/stat tables pass budget and production-item eligibility audits.
- [ ] Several simultaneous enemies, projectiles, effects, and chests meet the agreed mobile performance budget.
- [ ] Authenticated screenshots/recordings cover each role, tier, group, and phone size.
