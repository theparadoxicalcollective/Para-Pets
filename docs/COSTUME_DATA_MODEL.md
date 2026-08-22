# Costume data model

This document defines the persistence layer for the costume feature. It intentionally keeps costumes separate from accessories and from `pet_template_parts`.

## Item

A costume is a normal `shop_items` record with `type = "costume"`. Its `image_url` is the canonical artwork shown in inventory and used by the renderer.

## Player ownership

A costume is owned through the existing `user_inventory` table, exactly like other inventory items. Costume ownership is therefore separate from whether the costume is currently equipped.

## Per-pet slot unlocks

`user_inventory.costume_extra_slots` stores the number of additional costume slots unlocked for that pet inventory record.

- Base: 1 slot
- Extra slot 1: 5,000 coins
- Extra slot 2: 10,000 coins
- Maximum: 2 extra slots / 3 total slots

This is deliberately stored on the pet inventory row, not the user row, so two pets owned by the same player can have different unlocked costume capacity.

## Equipped costume

`pet_equipped_costumes` maps a player's costume inventory item to a specific pet and slot. A unique `(pet_inventory_id, slot)` constraint prevents two costumes from occupying one slot. A unique `(costume_inventory_id)` constraint prevents one physical inventory item from being equipped to multiple pets at once.

## Costume placement

`pet_costume_definitions` stores the admin-authored placement for a costume on a pet template. Placements are JSON because the shared contract already supports one placement per view and the shape is expected to evolve as the pet editor gains more part/animation capabilities.

The placement records contain the anchor pet-part key, normalized/template coordinates, dimensions, pivot, view (`front`/`side`), and depth (`front`/`back`). Runtime renderers should resolve the anchor part and then apply the saved offset instead of treating the coordinates as device pixels.

## Compatibility

No existing accessory table or accessory slot is changed by this PR. Existing pets have `costume_extra_slots = 0`, which resolves to the one free costume slot. No costume rows means no visual costume is rendered.
