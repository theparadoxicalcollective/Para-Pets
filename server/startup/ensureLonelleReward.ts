import { sql } from "drizzle-orm";
import { db } from "../db";

/** Supply the quest reward only when Administration has not created it already. */
export async function ensureLonelleReward(): Promise<void> {
  await db.execute(sql`
    INSERT INTO shop_items (name, description, price, type, adornment_slot, world_id, image_url)
    SELECT 'Firefly Cluster', 'Three playful fireflies to decorate your pet.', 0,
           'costume', 'right_hand', '__quest_rewards__', '/lonelle-firefly-cluster.webp'
    WHERE NOT EXISTS (
      SELECT 1 FROM shop_items WHERE type='costume' AND LOWER(TRIM(name))='firefly cluster'
    )
  `);
}
