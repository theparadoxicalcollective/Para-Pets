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

The cached loadout response now carries the starter's application key
`clearing-training-sword` alongside inventory ID and shop-item ID. Other Clearing items
receive a deterministic `clearing-item:<shop-item-id>` compatibility key until a persisted
slug column is approved; the client never derives identity from the mutable display name.

## Clearing pet presentation refinement

The Clearing-only responsive sprite canvas is now `clamp(140px, 37vw, 168px)`, additionally
capped at 20.5% of viewport height. This yields 140 px on a 320×568 phone, 144.3 px on a
390×844 phone, and 159.1 px on a 430×932 phone. The prior responsive range was 116–142 px,
so the standard-phone canvas increases about 20%. The feet anchor is 82%, intentional
visual half-width is 34%, and the gameplay hurtbox radius is only 22% of the sprite canvas.
The hand-based sword origin moves 20% of sprite size forward and 57% upward; the reserved
staff/projectile origin moves 28% forward and 48% upward.

Pet templates have varying transparent padding, so a universal pixel-derived visual-height
ratio would be misleading. The target is approximately 90–100% of the normal wraith's
visible artwork after the standard-phone adjustment and remains a required device check
with representative production pets. Narrow/standard/tall sizes, bounds, feet geometry,
mirrored origins, camera clamping, and attack phases are covered programmatically; actual
left/right edge compositing and HUD overlap remain manual checks in an authenticated build.
