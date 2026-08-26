# Para Pets Costume Feature Architecture

## Purpose

This document defines the safe rollout plan for costumes. The costume system should be additive and independent from the existing accessory equipment system so existing accessories, pet parts, animations, and inventory behavior remain unchanged.

## Rollout

### PR 1 — Foundation

This PR adds the shared costume contract and constants only. It establishes the rules that later player/admin work must use:

- 3 costume slots per pet.
- Slot 1 is unlocked by default.
- Slot 2 costs 5,000 coins.
- Slot 3 costs 10,000 coins.
- Costume placement is defined per pet template and costume item.
- Front and side views may have independent placements.
- Every placement is anchored to an existing pet part.
- Placement uses normalized/template coordinates, never device pixels.
- Depth is explicit: `front` renders above the pet parts and `back` renders behind them.

### PR 2 — Data model + server API

Add dedicated costume data structures rather than overloading accessory tables:

1. Add a per-pet costume-slot unlock field to `user_inventory` (base = 1; max extra = 2).
2. Add a dedicated `pet_equipped_costumes` table with `petInventoryId`, `costumeInventoryId`, and `slot`.
3. Add a dedicated costume-placement table keyed by `shopItemId` + `petTemplateId` + `view` (or an equivalent normalized relationship).
4. Add `costume` as a valid shop-item type in server validation.
5. Add server-authoritative endpoints for unlocking slots, equipping, unequipping, and reading costume definitions.
6. Validate ownership of the costume inventory item and prevent one inventory item from being equipped to multiple pets at the same time.
7. Charge coins server-side and make slot unlock operations idempotent/transactional.

Do not reuse `pet_equipped_accessories` for costumes.

### PR 3 — Admin costume editor

Extend the existing admin item database and pet template editor:

- Add `Costume` to the item-type selector.
- Add a Costume control to the pet parts editor.
- List all saved costume items with image + name.
- Place the selected costume over the pet.
- Allow dragging, proportional resizing, and rotation using the existing editor coordinate system.
- Keep the save action reachable while editing on mobile.
- Allow selecting the costume on the canvas to edit it.
- Choose an anchor from the pet's existing part keys.
- Toggle `Front` / `Back` depth.
- Support independent Front and Side placement.
- Save placement to the server.
- Reuse the existing pet editor's coordinate normalization, pivot, and rendering behavior instead of creating a second editor/renderer.

### PR 4 — Player costume slots and inventory UI

- Add a Costumes section below Accessories on the pet inventory card.
- Render three slots.
- Slot 1 is immediately usable.
- Locked slot 2 shows its 5,000-coin unlock affordance.
- Locked slot 3 shows its 10,000-coin unlock affordance.
- Empty unlocked slots use the greyed-out Drakeplate Cuirass image rather than a plus sign.
- Clicking an empty unlocked slot opens the player's costume inventory.
- Only `type = costume` inventory items appear in the costume picker.
- Equipping assigns the selected inventory item to that pet/slot.
- Unequipping removes the visual costume while returning the inventory item to the available costume pool.

### PR 5 — Centralized costume rendering

Integrate costume rendering into the existing pet rendering/animation pipeline so a costume uses the same template-space coordinates and anchor movement everywhere the pet is rendered.

The renderer should resolve:

`equipped costume -> costume item -> pet template -> view placement -> anchor part transform -> depth`

This should be shared by inventory previews, Pet Care, Pet House, world scenes, combat, PvP, and any other screen that renders the same pet template. Avoid screen-specific costume positioning.

## Why this structure

A costume is an inventory item, but its visual placement is template-specific. Keeping those concepts separate prevents a costume's artwork or ownership record from being coupled to one pet's current screen position.

For example:

`Dragon Helmet` -> `Pet Template: Ember Drake` -> `Front view` -> `Head` anchor -> normalized offset -> `Front` depth.

When that same pet animates, the costume follows the Head part. When the pet is rendered at a different device size, the same normalized placement is used. When a player equips the costume to another pet, that pet uses its own saved template placement.

## Important compatibility rules

- Do not change existing accessory slot behavior.
- Do not replace the existing `pet_template_parts` table with costume rows.
- Do not store device-specific pixel coordinates for costumes.
- Do not make the client authoritative for coin purchases or equipment ownership.
- Do not bake costume pixels into assembled pet images; costumes must remain removable inventory items.
- Existing pets/templates with no costume definitions must render exactly as they do today.
- Existing accessories must continue to render exactly as they do today.

## Future extensions

This structure leaves room for later costume features such as multiple costume pieces, animation-aware costumes, limited/event costumes, costume collections, and costume effects without redesigning the basic ownership/placement model.
