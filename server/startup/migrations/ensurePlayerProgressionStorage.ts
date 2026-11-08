import { sql } from "drizzle-orm";
import { db } from "../../db";

/**
 * Additive, rerunnable schema setup before API registration. No pet XP
 * conversion, historical reward backfill, or new player XP awards.
 * Existing accounts remain virtual Level 1 / 0 XP until an authorized
 * server-side award is introduced in a later program phase.
 */
export async function ensurePlayerProgressionStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS player_progression (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      level integer NOT NULL DEFAULT 1 CHECK (level >= 1),
      total_xp integer NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS player_xp_receipts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source text NOT NULL,
      event_id varchar(160) NOT NULL,
      amount integer NOT NULL CHECK (amount BETWEEN 1 AND 1000000),
      level_after integer NOT NULL CHECK (level_after >= 1),
      total_xp_after integer NOT NULL CHECK (total_xp_after >= 0),
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS player_xp_receipts_owner_source_event_uidx
      ON player_xp_receipts (user_id, source, event_id);
  `);
}
