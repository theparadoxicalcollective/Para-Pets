import { sql } from "drizzle-orm";
import { db } from "../../db";

/** An additive, rerunnable schema for private design drafts. No clothes are
 * distributed, equipped or exposed in public shop APIs in Avatar 08A. */
export async function ensurePlayerClothingStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS player_clothing_drafts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      base_id varchar NOT NULL REFERENCES player_character_bases(id),
      base_published_at timestamp NOT NULL,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      category text NOT NULL CHECK (category IN ('head','hair','face','top','bottom','shoes','back')),
      draft_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
      published_segments jsonb,
      shop_item_id varchar UNIQUE REFERENCES shop_items(id) ON DELETE SET NULL,
      revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      published_at timestamp
    );
    CREATE INDEX IF NOT EXISTS player_clothing_drafts_base_idx ON player_clothing_drafts(base_id);
  `);
}
