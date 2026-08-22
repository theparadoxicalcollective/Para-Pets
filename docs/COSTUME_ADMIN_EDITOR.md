# Costume admin editor contract

This PR establishes the admin-side contract for creating and configuring costume items without changing player equipment or runtime rendering.

## Item type

`shop_items.type = "costume"` is a first-class item type. Costume artwork uses the normal `image_url` field so the same image is available to inventory and the future renderer.

## Pet editor workflow

The pet-parts editor should expose a **Costume** control. It lists saved costume items with their image and name. Selecting one creates an editable costume placement for the current pet template/view.

The editor must support:

- selecting front or side view;
- dragging the costume artwork in normalized/template coordinates;
- choosing the pet-part anchor the costume follows;
- setting front/back depth;
- saving the placement without changing the underlying pet part artwork.

The placement is saved through the dedicated costume definition tables established by the costume data foundation. It must not be converted into a normal `pet_template_parts` row.

## Rendering contract

The admin editor is a configuration tool, not a separate renderer. It should use the same normalized/template coordinate space and anchor semantics that the runtime renderer will consume. Do not save device pixels or viewport-specific coordinates.

A costume can have an independent placement for each supported view. Front/back controls depth relative to the pet's normal part layers; the selected anchor controls which animated pet part the costume follows.

## Safety

This PR intentionally does not add equip/unequip routes, coin purchases, player costume slots, or runtime costume rendering. Those belong to later PRs so an unfinished costume configuration cannot affect existing pets.
