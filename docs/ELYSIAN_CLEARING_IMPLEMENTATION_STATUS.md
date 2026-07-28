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
| Menu combat pause | Complete and verified | Equipment/inventory menus pause the combat simulation. |
| Enemy facing | Complete and verified | Facing dead-zone and natural-orientation behavior are tested. |
| Coin and Essence HUD | Complete and verified | Clearing uses the `/api/auth/me` balance query and renders both values. |
| Correct Essence icon | Complete and verified | HUD and physical drops use the existing `attached_assets/Photoroom_20260709_23958_PM_1783626016795.png` standalone token; the bar remains separate. |
| Basic Sword grant and equip | Implemented but unverified | Transactional advisory lock, canonical ID, partial unique index, deterministic owned-weapon selection, immediate loadout response, and regression tests exist; Railway deployment must run the migration. |
| Sword/staff attack animations | Partially implemented | Attack styles and hit geometry exist; the client currently has a basic sword swing rather than complete weapon-specific art animation. |
| Collision and dodging | Partially implemented | Server range/position checks exist; full obstacle collision and a dedicated dodge action do not. |
| Expanded enemy pool | Not implemented | Intentionally excluded from this focused repair. |
| Enemy clusters | Not implemented | Intentionally excluded from this focused repair. |
| Difficulty tiers | Partially implemented | Tier rarity/scaling foundations exist; expanded tier encounters do not. |
| EXP | Complete and verified | Defeat reward is transactionally persisted and route behavior is tested. |
| Currency drops | Complete and verified | Server-created, distance-validated Coin (1–2) and Essence (10–20) pickups update persistent balances exactly once. |
| Equipment rarity by enemy tier | Partially implemented | Rarity helpers exist; current single-enemy Clearing does not supply expanded enemy tiers. |
| Bayou consumable drops | Not implemented | No production drop flow exists. |
| Treasure chest rewards | Not implemented | No production reward flow exists. |
| Equipment stat audit | Implemented but unverified | Audit helpers and tests exist; production item data has not been audited from this environment. |
| Helmet/weapon/armor/boots/charm admin support | Implemented but unverified | Shared types, schema migration, validation, admin fields, loadout, equip/unequip, sale guards, stat totals, and loot eligibility support all five slots; Railway migration remains required. |

## Production diagnosis and deployment

PR #58's starter query used a PostgreSQL `FULL JOIN` whose condition did not join the two relations with a merge/hash-joinable equality. PostgreSQL rejects that query with `FULL JOIN is only supported with merge-joinable or hash-joinable join conditions`, causing the unhandled session route rejection that the client reduced to “Combat unavailable.” The repair uses two explicit locked/ordered queries and returns safe structured errors while logging non-sensitive server context.

Deploy the application normally so essential boot migrations add `helmet_inventory_id` and `boots_inventory_id`, create the per-user canonical Basic Sword partial unique index, and seed/repair canonical item `a1b2c3d4-0011-4000-8000-000000000012`. Confirm migration logs before testing `POST /api/explore/elysian-clearing/session` on Railway. Direct Railway logs and its live schema were not accessible from this checkout, so the diagnosed PostgreSQL error is derived from the merged SQL and must be confirmed in Railway logs during deployment.
