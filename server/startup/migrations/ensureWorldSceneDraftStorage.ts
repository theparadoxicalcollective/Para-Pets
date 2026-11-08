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
        CHECK (ground_theme IN ('grass', 'snow', 'haunted', 'swamp', 'volcanic', 'city')),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    -- Existing installations still have the original five-theme constraint.
    -- Update it once without changing existing draft rows or touching Pet Park.
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'world_scene_drafts'::regclass
          AND conname = 'world_scene_drafts_ground_theme_check'
          AND pg_get_constraintdef(oid) NOT LIKE '%city%'
      ) THEN
        ALTER TABLE world_scene_drafts DROP CONSTRAINT world_scene_drafts_ground_theme_check;
        ALTER TABLE world_scene_drafts
          ADD CONSTRAINT world_scene_drafts_ground_theme_check
          CHECK (ground_theme IN ('grass', 'snow', 'haunted', 'swamp', 'volcanic', 'city'));
      END IF;
    END $$;
  `);
}
