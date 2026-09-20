import { sql } from "drizzle-orm";
import { db } from "../../db";

/** Keep first-time chapters and repeatable daily runs separate. */
export async function ensureJansonQuestsSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_janson_quests (
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_key TEXT NOT NULL CHECK (quest_key IN ('catch_fish', 'sell_fish')),
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
      accepted_at TIMESTAMP NOT NULL DEFAULT now(),
      completed_at TIMESTAMP NULL,
      reward_claimed_at TIMESTAMP NULL,
      PRIMARY KEY (user_id, quest_key),
      CHECK (reward_claimed_at IS NULL OR completed_at IS NOT NULL)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_janson_daily_quests (
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_day DATE NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
      accepted_at TIMESTAMP NOT NULL DEFAULT now(),
      completed_at TIMESTAMP NULL,
      reward_claimed_at TIMESTAMP NULL,
      PRIMARY KEY (user_id, quest_day),
      CHECK (reward_claimed_at IS NULL OR completed_at IS NOT NULL)
    )
  `);
}
