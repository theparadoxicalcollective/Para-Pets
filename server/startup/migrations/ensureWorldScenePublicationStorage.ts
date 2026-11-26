import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Additive, disabled-by-default. Never touches existing live worlds or drafts. */
export async function ensureWorldScenePublicationStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS world_scene_publications (
      world_id text PRIMARY KEY,
      active boolean NOT NULL DEFAULT false,
      snapshot jsonb,
      published_at timestamp,
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
  // Additive compatibility if the table was created by an earlier PR build.
  await db.execute(sql`
    ALTER TABLE world_scene_publications
      ADD COLUMN IF NOT EXISTS snapshot jsonb,
      ADD COLUMN IF NOT EXISTS published_at timestamp;
  `);
}
