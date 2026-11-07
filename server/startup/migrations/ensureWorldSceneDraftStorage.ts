import { sql } from "drizzle-orm";
import { db } from "../../db";

/**
 * Additive, private storage for world-authoring drafts.
 * Does not read or mutate existing world maps, Pet Park or gameplay.
 */
export async function ensureWorldSceneDraftStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS world_scene_drafts (
      world_id text PRIMARY KEY,
      ground_level integer NOT NULL DEFAULT 1 CHECK (ground_level BETWEEN 1 AND 4),
      ground_theme text NOT NULL DEFAULT 'grass'
        CHECK (ground_theme IN ('grass', 'snow', 'haunted', 'swamp', 'volcanic')),
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
}
