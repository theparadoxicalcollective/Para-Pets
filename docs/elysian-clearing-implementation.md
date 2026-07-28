# Elysian Clearing implementation and data audit

## Repository audit (2026-07-28)

The existing Clearing uses `WalkAroundScene`, `ElysianClearingCombat`, the
Clearing equipment/currency/ground-drop hooks and routes, and the shared
Clearing equipment types. This change extends those modules; it does not add a
second scene or inventory. The artwork inspected in the repository includes
the 2886×4331 `ElysianClearingBackground.jpeg`, `icon_coin.png`, the standalone
Essence token `Photoroom_20260709_24152_PM_1783626130265.png`, `icon_bag.png`,
and the existing hub chest assets. No new binary assets were added.

The environment supplied for this review had no `DATABASE_URL`, so production
enemy, equipment, and Bayou shop rows could not be truthfully enumerated or
changed. The admin-safe `auditClearingEquipment` function reports malformed
rarity/slots, missing art, negative stats, duplicate names, stat-budget
outliers, and unresolved weapon styles when run against production-backed
rows. A production operator must review that output and curate consumables;
there is deliberately no automatic conversion of all pets or shop products.

## Balance configuration

Equipment drop chance remains independently configured at 6%. Conditional on
an equipment drop, rarity is **Normal 76/20/4/0/0**, **Tough 35/45/18/2/0**,
and **Elite 0/48/42/9/1** percent for one through five stars. Thus normal
enemies cannot drop four/five-star equipment and five-star drops are elite-only.
Currency remains a physical server-created drop: 1–2 Coins or 10–20 Essence.

Clearing-only displayed power uses slot-specific weights:

| Slot | ATK | DEF | HP |
|---|---:|---:|---:|
| Weapon | 2.00 | 0.35 | 0.04 |
| Armor | 0.35 | 2.00 | 0.06 |
| Charm | 1.00 | 1.00 | 0.05 |

Rounded target power bands for rarities 1–5 are 2–18, 8–32, 18–52, 35–80,
and 58–120. Power is assessment-only and is never added as raw damage.

## Data operation and pause behavior

Essential boot adds `clearing_attack_style` and `clearing_active` idempotently.
Session creation transactionally creates/identifies the canonical one-star
Basic Sword (ATK +4), grants it only if the user owns no Clearing weapon, and
fills an empty weapon slot without overwriting a selection. An advisory lock
serializes concurrent session creation.

Menus freeze local AI/action clocks; unpause shifts their remaining deadlines
and adds a 250 ms safety grace. Server drop expiry deliberately follows wall
clock time during a menu pause, matching reconnect/session behavior rather
than extending valuable server records client-side.

## Production follow-up

Before enabling curated consumable drops, query Elysian Bayou shop inventory
for active grantable edible/consumable/power-up rows priced below 100 Coins and
exclude premium, limited, bound, quest/admin, deprecated, and monetized rows.
No eligible-item names are claimed here because production was unavailable.
Likewise, enemy templates require an explicit Bayou allowlist and verified
natural-facing metadata before production spawn-pool expansion.
