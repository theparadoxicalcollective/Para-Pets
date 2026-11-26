import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Additive, disabled-by-default. Never removes existing world data. */
export async function ensureWorldScenePublicationStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS world_scene_publications (
      world_id text PRIMARY KEY,
      active boolean NOT NULL DEFAULT false,
      first_enabled_at timestamp,
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
  // Safe for databases that already hold a publication state table.
  await db.execute(sql`
    ALTER TABLE world_scene_publications
      ADD COLUMN IF NOT EXISTS first_enabled_at timestamp;
  `);
}
