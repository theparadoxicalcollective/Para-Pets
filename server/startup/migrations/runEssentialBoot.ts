import { db } from "../../db";
import { sql } from "drizzle-orm";

/** Schema work that must finish before routes are registered and the listener starts. */
export async function runEssentialBoot(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
  } catch (err) { console.error("Session table setup error (non-fatal):", err); }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS media_blobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        mime_type text NOT NULL,
        data text NOT NULL,
        created_at timestamp DEFAULT now()
      )
    `);
  } catch (err) { console.error("media_blobs table setup error (non-fatal):", err); }

  const migrations: Array<[string, ReturnType<typeof sql>]> = [
    ["watcher_shoutouts_enabled migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS watcher_shoutouts_enabled boolean NOT NULL DEFAULT true`],
    ["is_bot migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false`],
    ["pvp_battle_groups.attack_power migration error (non-fatal):", sql`ALTER TABLE pvp_battle_groups ADD COLUMN IF NOT EXISTS attack_power integer NOT NULL DEFAULT 0`],
    ["users.molten_blocks_high_score migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS molten_blocks_high_score INTEGER NOT NULL DEFAULT 0`],
    ["users.essence early migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS essence INTEGER NOT NULL DEFAULT 0`],
    ["users.raid_total_damage early migration error (non-fatal):", sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS raid_total_damage INTEGER NOT NULL DEFAULT 0`],
    ["molten_blocks_drop_items migration error (non-fatal):", sql`CREATE TABLE IF NOT EXISTS molten_blocks_drop_items (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      shop_item_id VARCHAR NOT NULL,
      rarity VARCHAR(16) NOT NULL DEFAULT 'common',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )`],
  ];
  for (const [errorMessage, statement] of migrations) {
    try { await db.execute(statement); }
    catch (err) { console.error(errorMessage, err); }
  }
}
