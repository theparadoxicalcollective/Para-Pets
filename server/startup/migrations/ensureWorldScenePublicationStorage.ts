import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Additive, disabled-by-default. Never touches existing live worlds or drafts. */
export async function ensureWorldScenePublicationStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS world_scene_publications (
      world_id text PRIMARY KEY,
      active boolean NOT NULL DEFAULT false,
      updated_at timestamp NOT NULL DEFAULT now()
    );
  `);
}
