import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Additive and rerunnable. These are *player* state tables. The Avatar
 * admin draft/publish tables and all pet inventory remain untouched. */
export async function ensurePlayerAvatarEquipmentStorage(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE player_clothing_drafts ADD COLUMN IF NOT EXISTS published_category text;
    -- Clothing saved by 08A records its published category in the catalog
    -- description. Prefer that stable snapshot over the mutable draft category:
    -- an admin may have edited a draft without pressing Save Clothing.
    UPDATE player_clothing_drafts AS clothing
      SET published_category = replace(item.description, 'Avatar clothing · ', '')
      FROM shop_items AS item
      WHERE clothing.published_category IS NULL
        AND clothing.published_segments IS NOT NULL
        AND clothing.shop_item_id = item.id
        AND item.type = 'clothing'
        AND item.description IN (
          'Avatar clothing · head', 'Avatar clothing · hair',
          'Avatar clothing · face', 'Avatar clothing · top',
          'Avatar clothing · bottom', 'Avatar clothing · shoes',
          'Avatar clothing · back', 'Avatar clothing · accessories'
        );
    -- Older designs without an 08A description retain their original
    -- category as a compatibility fallback; never overwrite a saved snapshot.
    UPDATE player_clothing_drafts SET published_category = category
      WHERE published_category IS NULL AND published_segments IS NOT NULL;

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
      category text NOT NULL CHECK (category IN ('accessories','head','hair','face','top','bottom','shoes','back')),
      inventory_id varchar NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
      equipped_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT player_avatar_equipment_owner_category_uidx UNIQUE (user_id, category),
      CONSTRAINT player_avatar_equipment_owner_inventory_uidx UNIQUE (user_id, inventory_id)
    );
    CREATE INDEX IF NOT EXISTS player_avatar_equipment_inventory_idx
      ON player_avatar_equipment(inventory_id);
    -- Existing player accounts retain their outfit/equipment records.
    -- Widen the original seven-slot CHECK only if the Accessories category
    -- has not already been added to this database.
    DO $
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'player_avatar_equipment'::regclass
          AND conname = 'player_avatar_equipment_category_check'
          AND pg_get_constraintdef(oid) NOT ILIKE '%accessories%'
      ) THEN
        ALTER TABLE player_avatar_equipment
          DROP CONSTRAINT player_avatar_equipment_category_check;
        ALTER TABLE player_avatar_equipment
          ADD CONSTRAINT player_avatar_equipment_category_check
          CHECK (category IN ('accessories','head','hair','face','top','bottom','shoes','back'));
      END IF;
    END $;
  `);
}
