import { sql } from "drizzle-orm";
import { db } from "../../db";

export async function ensureBeauPrizeWheelSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS beau_prize_wheel_spins (
      action_id UUID PRIMARY KEY,
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      spin_day DATE NOT NULL,
      was_free BOOLEAN NOT NULL,
      coin_cost INTEGER NOT NULL CHECK (coin_cost >= 0),
      slot_index INTEGER NOT NULL CHECK (slot_index BETWEEN 0 AND 7),
      reward JSONB NOT NULL,
      response JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS beau_prize_wheel_user_day_idx
    ON beau_prize_wheel_spins(user_id, spin_day, created_at)
  `);
}
