import { sql } from "drizzle-orm";
import { db } from "../db";

const GUARD_TABLE = "startup_dynamic_world_location_guard";

/**
 * Legacy non-critical startup still contains an old Haunted Woods cleanup that
 * predates admin-placeable NPCs and deletes every non-canonical world location.
 * Preserve dynamic NPC rows around that legacy pass so a deploy/restart cannot
 * erase an NPC an admin intentionally placed.
 *
 * The guard stores full rows as jsonb rather than mirroring the world_locations
 * schema. jsonb_populate_record restores against the current table composite
 * type, so future world-location columns do not require this compatibility
 * guard to be kept in sync manually.
 */
export async function preserveDynamicWorldLocationsDuringLegacyStartup(
  runLegacyStartup: () => Promise<void>,
): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${GUARD_TABLE} (
      id VARCHAR PRIMARY KEY,
      payload JSONB NOT NULL,
      protected_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `));

  // Recover anything left by a process that died after the legacy cleanup but
  // before its finally block could restore the NPCs.
  await restoreGuardedNpcRows();

  await db.execute(sql.raw(`DELETE FROM ${GUARD_TABLE}`));
  await db.execute(sql.raw(`
    INSERT INTO ${GUARD_TABLE} (id, payload)
    SELECT id, to_jsonb(wl)
    FROM world_locations wl
    WHERE lower(COALESCE(type, '')) = 'npc'
    ON CONFLICT (id) DO UPDATE
      SET payload = EXCLUDED.payload,
          protected_at = now()
  `));

  try {
    await runLegacyStartup();
  } finally {
    await restoreGuardedNpcRows();
    await db.execute(sql.raw(`DELETE FROM ${GUARD_TABLE}`));
  }
}

async function restoreGuardedNpcRows(): Promise<void> {
  await db.execute(sql.raw(`
    INSERT INTO world_locations
    SELECT restored.*
    FROM ${GUARD_TABLE} guard
    CROSS JOIN LATERAL jsonb_populate_record(
      NULL::world_locations,
      guard.payload
    ) AS restored
    ON CONFLICT (id) DO NOTHING
  `));
}
