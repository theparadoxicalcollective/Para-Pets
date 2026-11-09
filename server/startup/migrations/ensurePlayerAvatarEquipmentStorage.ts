import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Additive and rerunnable. These are *player* state tables. The Avatar
 * admin draft/publish tables and all pet inventory remain untouched. */
export async function ensurePlayerAvatarEquipmentStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS player_avatar_profiles (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      base_id varchar NOT NULL REFERENCES player_character_bases(id),
      base_published_at timestamp NOT NULL,
      base_parts jsonb NOT NULL,
      revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS player_avatar_equipment (
      user_id varchar NOT NULL REFERENCES player_avatar_profiles(user_id) ON DELETE CASCADE,
      category text NOT NULL CHECK (category IN ('head','hair','face','top','bottom','shoes','back')),
      inventory_id varchar NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
      equipped_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT player_avatar_equipment_owner_category_uidx UNIQUE (user_id, category),
      CONSTRAINT player_avatar_equipment_owner_inventory_uidx UNIQUE (user_id, inventory_id)
    );
    CREATE INDEX IF NOT EXISTS player_avatar_equipment_inventory_idx
      ON player_avatar_equipment(inventory_id);
  `);
}
