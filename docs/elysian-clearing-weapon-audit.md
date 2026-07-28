# Elysian Clearing weapon identity audit

## Repository and production-access result

This checkout has no configured Git remote or `DATABASE_URL`, so the live production
rows and ownership/shop counts could not be queried during this pass. The repository
contains exactly one Clearing starter item definition. It was introduced by the recent
starter migration and has stable ID `a1b2c3d4-0011-4000-8000-000000000012`, image URL
`/world-assets/generated_images/pvp_battle_sword.png`, weapon slot, one star, ATK +4,
DEF +0, HP +0, and `sword_slash` style. It is free, Clearing-only, and scoped to the
Elysian Bayou Clearing location; no shop seed or other system references its ID.

Because production may contain an older, separately owned **Basic Sword** that is not
represented in this checkout, this pass uses the safe alternative rather than guessing
that row's identity. The migration idempotently renames only the recent starter's stable
ID to **Training Sword**. It does not delete, merge, re-key, or transfer inventory, so
existing ownership and loadout foreign keys remain intact. The existing per-user partial
unique index continues to make starter ownership idempotent.

`clearing-training-sword` is the documented application key; the current database has no
slug column, so grant, sale protection, ownership, and migration logic use the stable ID.
Before any future consolidation, production should be audited by ID (not name) with:

```sql
SELECT s.id, s.name, s.image_url, s.clearing_slot, s.star_rarity,
       s.atk_boost, s.def_boost, s.health_boost, s.clearing_attack_style,
       s.type, s.price, s.world_id, s.location_id, s.clearing_active,
       count(DISTINCT ui.user_id) AS owners
FROM shop_items s
LEFT JOIN user_inventory ui ON ui.shop_item_id = s.id
WHERE lower(trim(s.name)) IN ('basic sword', 'training sword')
GROUP BY s.id;
```

Any shop/listing references should then be queried by the returned IDs before considering
a mapping. If both IDs are owned, preserve both inventory rows and map only future starter
grants to the canonical stable ID; never name-match, delete, or merge owned rows.

## Art orientation and animation

The source is a 1024×1024 RGBA PNG whose blade points up and handle points down. The
right-facing shared transform rotates it from -65° windup through -135° impact to -155°
recovery. At impact the handle is upper-right and blade is lower-left/down-forward. The
left-facing transform applies one horizontal mirror before the same rotation sequence,
keeping the sword upright and moving down-forward to the left.

Timing is 90 ms windup, 70 ms impact, and 140 ms recovery (300 ms total). Target selection,
collision qualification, and the server request occur on entry to impact. A miss still
continues through impact and recovery with the equipped image visible.
