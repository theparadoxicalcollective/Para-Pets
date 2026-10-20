import { sql, type SQL } from "drizzle-orm";

type FishInventoryDatabase = { execute: (statement: SQL) => Promise<unknown> };

/** Transfer legacy ownership, never copy it. A single statement rolls back both
 * deletion and insertion on failure. DELETE row locks make repeat/concurrent
 * reads safe. Existing aquarium copies are separate owned fish, not evidence
 * that a remaining generic stack has already been transferred. */
export async function reconcileLegacyFishInventory(db: FishInventoryDatabase, userId: string): Promise<void> {
  await db.execute(sql`
    WITH moved AS (
      DELETE FROM user_inventory ui
      USING shop_items item
      WHERE ui.user_id = ${userId}
        AND ui.shop_item_id = item.id
        AND item.type = 'fishing' AND item.fishing_type = 'fish'
        AND ui.is_listed = false AND ui.quantity > 0
        AND NOT EXISTS (
          SELECT 1 FROM player_market_listings listing
          WHERE listing.inventory_id = ui.id AND listing.status = 'active'
        )
      RETURNING ui.user_id, ui.shop_item_id, ui.quantity, ui.acquired_at
    )
    INSERT INTO player_fish_inventory (user_id, shop_item_id, caught_at)
    SELECT moved.user_id, moved.shop_item_id, moved.acquired_at
    FROM moved CROSS JOIN LATERAL generate_series(1, moved.quantity)
  `);
}
