---
name: Molten Blocks drop items
description: Item drop mechanic in Molten Blocks — key decisions about table management, drop rate, and close button fix.
---

## Runtime table
`molten_blocks_drop_items` is a runtime table (raw SQL CREATE TABLE in `server/index.ts`, both pre-route and background IIFE). Also declared in `shared/schema.ts` so drizzle-kit treats it as tracked. Do NOT run `db:push` on it.

## Drop mechanics
- Every 20 blocks placed (`blocksLockedRef.current % 20 === 0`), one random cell of the locked piece gets an item.
- Weighted pick: common=6, uncommon=3, rare=1 (`pickDropItem` in MoltenBlocksPage.tsx).
- Item board (`itemBoardRef`) is a parallel `ItemCell[][]` (same ROWS×COLS dimensions as the main board).
- On line clear: items in cleared rows are collected BEFORE the timeout, awarded after via POST `/api/games/molten-blocks/award-item`.
- `clearItemBoardLines` mirrors `clearLines` logic using the locked board snapshot.
- `resetBoard` must reset `itemBoardRef` too — already done.

## Close button fix
The `position: absolute; top: 12; right: 14` button inside the Overlay was invisible (too low contrast: `#a06a30` on dark bg). Fix: use an in-flow flex div at the top of the Overlay's children with `justifyContent: flex-end`. This guarantees visibility.

**Why:** Absolutely positioned elements inside a flex container can be rendered behind other stacking contexts or simply hard to see at low contrast on mobile screens.

## Award flow
`POST /api/games/molten-blocks/award-item { shopItemId }` validates the item is in the active drop pool, then calls `storage.addToInventory(userId, shopItemId)`. Invalidates `/api/inventory` on client.

## Admin UI
`MoltenBlocksItemsSection` component at the bottom of AdminPage.tsx — uses `ItemPickerModal` for item selection, then a rarity picker dialog before adding. Section key: `"molten_blocks"`.
