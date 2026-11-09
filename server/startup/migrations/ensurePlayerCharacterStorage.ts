import { sql } from "drizzle-orm";
import { db } from "../../db";

/**
 * Additive player-character storage. Drafts are private and never become the
 * live default without an explicit, complete seven-part publish operation.
 */
export async function ensurePlayerCharacterStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS player_character_bases (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
      draft_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
      published_parts jsonb,
      is_default boolean NOT NULL DEFAULT false,
      revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now(),
      published_at timestamp
    );
    CREATE UNIQUE INDEX IF NOT EXISTS player_character_only_one_default_idx
      ON player_character_bases (is_default) WHERE is_default = true;
  `);
}
