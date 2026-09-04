import { sql } from "drizzle-orm";
import { db } from "../../db";

/**
 * Bingo entry fees, rival progress, placements, and payouts must survive
 * restarts and must never be owned by the browser. This boot migration is
 * idempotent and runs before routes are registered so Railway is ready before
 * the first player opens the casino.
 */
export async function ensureHauntedBingoSchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS haunted_bingo_rounds (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      casino_date DATE NOT NULL,
      entry_cost INTEGER NOT NULL DEFAULT 0 CHECK (entry_cost >= 0),
      free_entry BOOLEAN NOT NULL DEFAULT false,
      card JSONB NOT NULL,
      deck JSONB NOT NULL,
      called JSONB NOT NULL DEFAULT '[]'::jsonb,
      marked JSONB NOT NULL DEFAULT '["2-2"]'::jsonb,
      bonuses JSONB NOT NULL DEFAULT '[]'::jsonb,
      rivals JSONB NOT NULL DEFAULT '[]'::jsonb,
      winner_order JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'active',
      base_reward INTEGER NOT NULL DEFAULT 500 CHECK (base_reward >= 0),
      bonus_reward INTEGER NOT NULL DEFAULT 0 CHECK (bonus_reward >= 0),
      paid_out_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now()
    );

    ALTER TABLE haunted_bingo_rounds
      ADD COLUMN IF NOT EXISTS rivals JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE haunted_bingo_rounds
      ADD COLUMN IF NOT EXISTS winner_order JSONB NOT NULL DEFAULT '[]'::jsonb;

    ALTER TABLE haunted_bingo_rounds
      DROP CONSTRAINT IF EXISTS haunted_bingo_rounds_status_check;
    ALTER TABLE haunted_bingo_rounds
      ADD CONSTRAINT haunted_bingo_rounds_status_check
      CHECK (status IN ('active', 'won', 'lost', 'forfeited'));

    CREATE UNIQUE INDEX IF NOT EXISTS haunted_bingo_one_active_round_uidx
      ON haunted_bingo_rounds(user_id)
      WHERE status = 'active';

    CREATE UNIQUE INDEX IF NOT EXISTS haunted_bingo_daily_free_entry_uidx
      ON haunted_bingo_rounds(user_id, casino_date)
      WHERE free_entry = true;

    CREATE INDEX IF NOT EXISTS haunted_bingo_user_history_idx
      ON haunted_bingo_rounds(user_id, created_at DESC);
  `);
}
