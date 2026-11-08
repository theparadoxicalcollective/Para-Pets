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
      enabled_for_moderators boolean NOT NULL DEFAULT false,
      background_url text,
      ground_level integer NOT NULL DEFAULT 1 CHECK (ground_level BETWEEN 1 AND 4),
      ground_theme text NOT NULL DEFAULT 'grass' CHECK (ground_theme IN ('grass','snow','haunted','swamp','volcanic')),
      coins_per_hour integer NOT NULL DEFAULT 0,
      essence_per_hour integer NOT NULL DEFAULT 0,
      pet_xp_per_hour integer NOT NULL DEFAULT 0,
      updated_at timestamp NOT NULL DEFAULT now()
    );
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS enabled_for_moderators boolean NOT NULL DEFAULT false;
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS ground_theme text NOT NULL DEFAULT 'grass';
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS coins_per_hour integer NOT NULL DEFAULT 0;
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS essence_per_hour integer NOT NULL DEFAULT 0;
    ALTER TABLE pet_park_settings ADD COLUMN IF NOT EXISTS pet_xp_per_hour integer NOT NULL DEFAULT 0;
    INSERT INTO pet_park_settings (id, enabled_for_players)
    VALUES ('main', false) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS pet_park_scene_items (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      kind text NOT NULL CHECK (kind IN ('decor', 'sleep_spot', 'effect', 'terrain')),
      image_url text,
      tap_image_url text,
      effect_type text,
      x_pct real NOT NULL DEFAULT 0.5 CHECK (x_pct BETWEEN 0 AND 1),
      y_pct real NOT NULL DEFAULT 0.5 CHECK (y_pct BETWEEN 0 AND 1),
      size integer NOT NULL DEFAULT 100 CHECK (size BETWEEN 1 AND 1000),
      flipped boolean NOT NULL DEFAULT false,
      layer integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now()
    );

    ALTER TABLE pet_park_scene_items ADD COLUMN IF NOT EXISTS effect_type text;
    ALTER TABLE pet_park_scene_items ADD COLUMN IF NOT EXISTS effect_color text;
    -- Additive and nullable: existing decorations retain their normal image.
    ALTER TABLE pet_park_scene_items ADD COLUMN IF NOT EXISTS tap_image_url text;
    ALTER TABLE pet_park_scene_items ADD COLUMN IF NOT EXISTS appearance_group_id varchar;
    ALTER TABLE pet_park_scene_items ADD COLUMN IF NOT EXISTS decor_effects jsonb NOT NULL DEFAULT '[]'::jsonb;
    -- Older duplicates copied the original processed image URL verbatim.
    -- Recover these links once without changing artwork or placement. Newly
    -- created decorations receive an explicit UUID group ID.
    UPDATE pet_park_scene_items AS item
      SET appearance_group_id = source.group_id
      FROM (
        SELECT image_url, MIN(id) AS group_id
        FROM pet_park_scene_items
        WHERE kind = 'decor' AND image_url IS NOT NULL
        GROUP BY image_url
      ) AS source
      WHERE item.kind = 'decor' AND item.image_url = source.image_url
        AND item.appearance_group_id IS NULL;
    CREATE INDEX IF NOT EXISTS pet_park_scene_items_appearance_group_idx
      ON pet_park_scene_items (appearance_group_id)
      WHERE kind = 'decor';
    ALTER TABLE pet_park_scene_items DROP CONSTRAINT IF EXISTS pet_park_scene_items_kind_check;
    ALTER TABLE pet_park_scene_items ADD CONSTRAINT pet_park_scene_items_kind_check
      CHECK (kind IN ('decor', 'sleep_spot', 'effect', 'terrain'));

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
      max_pets integer NOT NULL DEFAULT 10 CHECK (max_pets BETWEEN 10 AND 25),
      exterior_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
      interior_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_shop boolean NOT NULL DEFAULT false,
      shop_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      shop_item_placements jsonb NOT NULL DEFAULT '[]'::jsonb,
      interior_darkness integer NOT NULL DEFAULT 35,
      interior_night_darkness integer,
      night_interior_image_url text,
      created_at timestamp NOT NULL DEFAULT now()
    );
    ALTER TABLE pet_park_buildings ADD COLUMN IF NOT EXISTS exterior_effects jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE pet_park_buildings ADD COLUMN IF NOT EXISTS is_shop boolean NOT NULL DEFAULT false;
    ALTER TABLE pet_park_buildings ADD COLUMN IF NOT EXISTS shop_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE pet_park_buildings ADD COLUMN IF NOT EXISTS shop_item_placements jsonb NOT NULL DEFAULT '[]'::jsonb;
    -- Additive default: existing rooms gain soft ambience without placement changes.
    ALTER TABLE pet_park_buildings ADD COLUMN IF NOT EXISTS interior_darkness integer NOT NULL DEFAULT 35;
    -- Null preserves existing rooms' identical day and nighttime brightness.
    ALTER TABLE pet_park_buildings ADD COLUMN IF NOT EXISTS interior_night_darkness integer;
    ALTER TABLE pet_park_buildings ADD COLUMN IF NOT EXISTS night_interior_image_url text;

    -- Existing parks may have 1–3-pet buildings. Raise those capacities to
    -- ten before enforcing the new range; no occupants are displaced, and
    -- no deposits or reward checkpoints are altered.
    -- CREATE TABLE IF NOT EXISTS alone never updates existing constraints.
    ALTER TABLE pet_park_buildings DROP CONSTRAINT IF EXISTS pet_park_buildings_max_pets_check;
    UPDATE pet_park_buildings SET max_pets = 10 WHERE max_pets < 10;
    ALTER TABLE pet_park_buildings ALTER COLUMN max_pets SET DEFAULT 10;
    ALTER TABLE pet_park_buildings ADD CONSTRAINT pet_park_buildings_max_pets_check
      CHECK (max_pets BETWEEN 10 AND 25);
    -- Player slot limits (1–3) are separate and stay unchanged.

    -- Park-only activity for scene crowd control. One small row per owner,
    -- never an equipment, reward, public-profile or online-status change.
    CREATE TABLE IF NOT EXISTS pet_park_presence (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen_at timestamp NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS pet_park_presence_recent_idx
      ON pet_park_presence (last_seen_at DESC);

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
      show_in_park boolean NOT NULL DEFAULT true,
      park_x_pct real CHECK (park_x_pct BETWEEN 0 AND 1),
      park_y_pct real CHECK (park_y_pct BETWEEN 0 AND 1),
      checkpoint_at timestamp NOT NULL DEFAULT now(),
      paused_at timestamp,
      paused_duration_ms integer NOT NULL DEFAULT 0 CHECK (paused_duration_ms >= 0),
      withdrawn_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    );
    -- Existing deposited pets keep their prior public visibility after upgrade.
    -- New deposits explicitly set false when equipped into an idle earning slot.
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS show_in_park boolean NOT NULL DEFAULT true;
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS park_x_pct real CHECK (park_x_pct BETWEEN 0 AND 1);
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS park_y_pct real CHECK (park_y_pct BETWEEN 0 AND 1);
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS building_id varchar REFERENCES pet_park_buildings(id) ON DELETE SET NULL;
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS room_effect_id varchar;
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS interior_x_pct real NOT NULL DEFAULT 0.5 CHECK (interior_x_pct BETWEEN 0 AND 1);
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS interior_y_pct real NOT NULL DEFAULT 0.72 CHECK (interior_y_pct BETWEEN 0 AND 1);
    ALTER TABLE pet_park_deposits ADD COLUMN IF NOT EXISTS pose text NOT NULL DEFAULT 'idle' CHECK (pose IN ('idle', 'sit', 'sleep'));

    -- Existing shop buildings must not continue housing pets after upgrading.
    -- Idle display leaves deposits and their reward checkpoints intact.
    UPDATE pet_park_deposits SET building_id = NULL, room_effect_id = NULL,
      show_in_park = false, park_x_pct = NULL, park_y_pct = NULL, pose = 'idle'
      WHERE withdrawn_at IS NULL AND building_id IN
        (SELECT id FROM pet_park_buildings WHERE is_shop = true);

    CREATE UNIQUE INDEX IF NOT EXISTS pet_park_deposits_slot_active_uidx
      ON pet_park_deposits (user_id, slot_number) WHERE withdrawn_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS pet_park_deposits_pet_active_uidx
      ON pet_park_deposits (pet_inventory_id) WHERE withdrawn_at IS NULL;
    -- Building and room occupancy must stay cheap as the number of players
    -- grows. This partial index covers the same active-deposit predicate
    -- used by capacity checks, scene reads and building deletion.
    CREATE INDEX IF NOT EXISTS pet_park_deposits_building_active_idx
      ON pet_park_deposits (building_id, room_effect_id)
      WHERE withdrawn_at IS NULL AND building_id IS NOT NULL;

    -- Efficiently pick the lowest publicly displayed slot per owner without
    -- scanning idle, withdrawn or indoor pets for each 30-second park refresh.
    -- Keeps all three equipped slots and all indoor occupancy untouched.
    CREATE INDEX IF NOT EXISTS pet_park_deposits_outdoor_first_active_idx
      ON pet_park_deposits (user_id, slot_number, created_at, id)
      WHERE withdrawn_at IS NULL AND show_in_park = true
        AND building_id IS NULL AND park_x_pct IS NOT NULL AND park_y_pct IS NOT NULL;

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

    -- One-time upgrade: retain the center-relative placement of existing
    -- buildings, decor and positioned pets from the earlier reference-art stage.
    -- Legacy background URLs are retained for rollback, but not displayed.
    DO $migration$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'pet_park_settings' AND column_name = 'ground_level'
      ) THEN
        ALTER TABLE pet_park_settings
          ADD COLUMN ground_level integer NOT NULL DEFAULT 1 CHECK (ground_level BETWEEN 1 AND 4);
        UPDATE pet_park_scene_items
          SET x_pct = 0.5 + (x_pct - 0.5) * 1100.0 / 1800.0,
              y_pct = 0.5 + (y_pct - 0.5) * 1700.0 / 2700.0;
        UPDATE pet_park_buildings
          SET x_pct = 0.5 + (x_pct - 0.5) * 1100.0 / 1800.0,
              y_pct = 0.5 + (y_pct - 0.5) * 1700.0 / 2700.0;
        UPDATE pet_park_deposits
          SET park_x_pct = 0.5 + (park_x_pct - 0.5) * 1100.0 / 1800.0,
              park_y_pct = 0.5 + (park_y_pct - 0.5) * 1700.0 / 2700.0
          WHERE park_x_pct IS NOT NULL AND park_y_pct IS NOT NULL;
      END IF;
    END
    $migration$;
  `);
}
