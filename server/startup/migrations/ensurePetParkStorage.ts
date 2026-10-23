import { db } from "../../db";
import { sql } from "drizzle-orm";

/**
 * Idempotent, additive Pet Park storage migration. Runs before routes listen.
 * Park defaults closed. This migration never touches legacy Central tables,
 * credits rewards, or unlocks player slots.
 */
export async function ensurePetParkStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pet_park_settings (
      id varchar PRIMARY KEY DEFAULT 'main' CHECK (id = 'main'),
      enabled_for_players boolean NOT NULL DEFAULT false,
      background_url text,
      coins_per_hour integer NOT NULL DEFAULT 0,
      essence_per_hour integer NOT NULL DEFAULT 0,
      pet_xp_per_hour integer NOT NULL DEFAULT 0,
      updated_at timestamp NOT NULL DEFAULT now()
    );
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS coins_per_hour integer NOT NULL DEFAULT 0;
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS essence_per_hour integer NOT NULL DEFAULT 0;
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS pet_xp_per_hour integer NOT NULL DEFAULT 0;
    INSERT INTO pet_park_settings (id, enabled_for_players)
    VALUES ('main', false) ON CONFLICT (id) DO NOTHING;

    UPDATE pet_park_settings SET background_url = '/world-assets/uploads/PetPark.JPG'
      WHERE id = 'main' AND background_url IS NULL;

    CREATE TABLE IF NOT EXISTS pet_park_scene_items (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL CHECK (kind IN ('decor', 'sleep_spot', 'effect')),
      image_url text,
      effect_type text,
      x_pct real NOT NULL DEFAULT 0.5 CHECK (x_pct BETWEEN 0 AND 1),
      y_pct real NOT NULL DEFAULT 0.5 CHECK (y_pct BETWEEN 0 AND 1),
      size integer NOT NULL DEFAULT 100 CHECK (size BETWEEN 1 AND 1000),
      flipped boolean NOT NULL DEFAULT false,
      layer integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    );

    ALTER TABLE pet_park_scene_items ADD COLUMN IF NOT EXISTS effect_type text;
    ALTER TABLE pet_park_scene_items DROP CONSTRAINT IF EXISTS pet_park_scene_items_kind_check;
    ALTER TABLE pet_park_scene_items ADD CONSTRAINT pet_park_scene_items_kind_check
      CHECK (kind IN ('decor', 'sleep_spot', 'effect'));

    CREATE TABLE IF NOT EXISTS pet_park_buildings (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL DEFAULT 'Building',
      image_url text NOT NULL,
      interior_image_url text,
      x_pct real NOT NULL DEFAULT 0.5 CHECK (x_pct BETWEEN 0 AND 1),
      y_pct real NOT NULL DEFAULT 0.5 CHECK (y_pct BETWEEN 0 AND 1),
      size integer NOT NULL DEFAULT 120 CHECK (size BETWEEN 1 AND 1000),
      flipped boolean NOT NULL DEFAULT false,
      layer integer NOT NULL DEFAULT 0,
      max_pets integer NOT NULL DEFAULT 3 CHECK (max_pets BETWEEN 1 AND 3),
      interior_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS pet_park_player_slots (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      unlocked_slots integer NOT NULL DEFAULT 1 CHECK (unlocked_slots BETWEEN 1 AND 3),
      updated_at timestamp NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS pet_park_deposits (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pet_inventory_id varchar NOT NULL REFERENCES user_inventory(id) ON DELETE CASCADE,
      slot_number integer NOT NULL CHECK (slot_number BETWEEN 1 AND 3),
      checkpoint_at timestamp NOT NULL DEFAULT now(),
      paused_at timestamp,
      paused_duration_ms integer NOT NULL DEFAULT 0 CHECK (paused_duration_ms >= 0),
      withdrawn_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    );
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS building_id varchar REFERENCES pet_park_buildings(id) ON DELETE SET NULL;
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS interior_x_pct real NOT NULL DEFAULT 0.5 CHECK (interior_x_pct BETWEEN 0 AND 1);
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS interior_y_pct real NOT NULL DEFAULT 0.72 CHECK (interior_y_pct BETWEEN 0 AND 1);
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS pose text NOT NULL DEFAULT 'idle' CHECK (pose IN ('idle', 'sit', 'sleep'));

    CREATE UNIQUE INDEX IF NOT EXISTS pet_park_deposits_slot_active_uidx
      ON pet_park_deposits (user_id, slot_number) WHERE withdrawn_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS pet_park_deposits_pet_active_uidx
      ON pet_park_deposits (pet_inventory_id) WHERE withdrawn_at IS NULL;

    CREATE TABLE IF NOT EXISTS pet_park_reward_claims (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      deposit_id varchar NOT NULL REFERENCES pet_park_deposits(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      interval_start_at timestamp NOT NULL,
      interval_end_at timestamp NOT NULL,
      earned_duration_ms integer NOT NULL CHECK (earned_duration_ms >= 0 AND earned_duration_ms <= 86400000),
      coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
      essence integer NOT NULL DEFAULT 0 CHECK (essence >= 0),
      pet_xp integer NOT NULL DEFAULT 0 CHECK (pet_xp >= 0),
      claimed_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT pet_park_claim_interval_order CHECK (interval_end_at >= interval_start_at)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS pet_park_claim_interval_uidx
      ON pet_park_reward_claims (deposit_id, interval_start_at, interval_end_at);
  `);
}
