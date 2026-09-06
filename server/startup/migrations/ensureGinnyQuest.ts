import { sql } from "drizzle-orm";
import { db } from "../../db";

/**
 * Persistent, once-per-player state for Ginny's Haunted Woods Mini Pet quest.
 * This runs before route registration so a fresh database cannot serve a
 * partially available quest feature.
 */
export async function ensureGinnyQuestSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_ginny_mini_pet_quests (
      user_id VARCHAR PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      choice TEXT NOT NULL CHECK (choice IN ('bat', 'ghost')),
      mini_pet_shop_item_id VARCHAR NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
      mini_pet_inventory_id VARCHAR NOT NULL REFERENCES user_inventory(id) ON DELETE RESTRICT,
      accepted_at TIMESTAMP NOT NULL DEFAULT now(),
      completed_at TIMESTAMP NULL,
      reward_claimed_at TIMESTAMP NULL,
      CHECK (reward_claimed_at IS NULL OR completed_at IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS user_ginny_mini_pet_quests_inventory_idx
      ON user_ginny_mini_pet_quests(mini_pet_inventory_id);
  `);
}
