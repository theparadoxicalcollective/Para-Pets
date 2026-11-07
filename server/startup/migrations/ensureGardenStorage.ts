import { db } from "../../db";
import { sql } from "drizzle-orm";

/** Additive garden storage; no seeds, fruits, currency, player plots, or
 * equipment are minted by migration. Can be safely rerun on startup. */
export async function ensureGardenStorage(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE shop_items
      ADD COLUMN IF NOT EXISTS is_refillable boolean NOT NULL DEFAULT false;
    ALTER TABLE pet_park_scene_items
      ADD COLUMN IF NOT EXISTS is_water_source boolean NOT NULL DEFAULT false;
    ALTER TABLE user_inventory
      ADD COLUMN IF NOT EXISTS garden_water_left integer;
    DO $garden$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_inventory_garden_water_left_check'
          AND conrelid = 'user_inventory'::regclass
      ) THEN
        ALTER TABLE user_inventory
          ADD CONSTRAINT user_inventory_garden_water_left_check
          CHECK (garden_water_left IS NULL OR garden_water_left BETWEEN 0 AND 100);
      END IF;
    END
    $garden$;

    CREATE TABLE IF NOT EXISTS garden_crops (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      seed_item_id varchar NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
      fruit_item_id varchar NOT NULL REFERENCES shop_items(id) ON DELETE RESTRICT,
      planted_image_url text,
      seedling_image_url text,
      partial_image_url text,
      grown_image_url text,
      picked_image_url text,
      stage_placements jsonb NOT NULL DEFAULT '{}'::jsonb,
      planted_drops integer NOT NULL DEFAULT 10 CHECK (planted_drops BETWEEN 1 AND 1000),
      seedling_drops integer NOT NULL DEFAULT 10 CHECK (seedling_drops BETWEEN 1 AND 1000),
      partial_drops integer NOT NULL DEFAULT 10 CHECK (partial_drops BETWEEN 1 AND 1000),
      grown_drops integer NOT NULL DEFAULT 10 CHECK (grown_drops BETWEEN 1 AND 1000),
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    );
    -- Existing production gardens predate per-stage placements.
    ALTER TABLE garden_crops
      ADD COLUMN IF NOT EXISTS stage_placements jsonb NOT NULL DEFAULT '{}'::jsonb;
    CREATE UNIQUE INDEX IF NOT EXISTS garden_crops_seed_unique ON garden_crops(seed_item_id);
    CREATE UNIQUE INDEX IF NOT EXISTS garden_crops_fruit_unique ON garden_crops(fruit_item_id);

    CREATE TABLE IF NOT EXISTS garden_player_plots (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plot_item_id varchar NOT NULL REFERENCES pet_park_scene_items(id) ON DELETE CASCADE,
      crop_id varchar REFERENCES garden_crops(id) ON DELETE RESTRICT,
      phase text NOT NULL DEFAULT 'empty'
        CHECK (phase IN ('empty','tilled','planted','seedling','partial','grown','picked')),
      water_applied integer NOT NULL DEFAULT 0 CHECK (water_applied >= 0),
      harvest_ready boolean NOT NULL DEFAULT false,
      picked_until timestamp,
      passive_growth_at timestamp,
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT garden_plot_plant_requires_crop
        CHECK (phase IN ('empty','tilled') OR crop_id IS NOT NULL)
    );
    -- Existing active crops start their slow-growth clock at deployment,
    -- not retroactively from an old watering timestamp.
    ALTER TABLE garden_player_plots
      ADD COLUMN IF NOT EXISTS passive_growth_at timestamp;
    UPDATE garden_player_plots
      SET passive_growth_at = now()
      WHERE passive_growth_at IS NULL AND
        phase IN ('planted', 'seedling', 'partial', 'grown') AND
        harvest_ready = false;
    -- Keep response and mutation in the same transaction so duplicate HTTP
    -- requests can never double-charge a pail or double-award fruit.
    CREATE TABLE IF NOT EXISTS garden_action_receipts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id varchar NOT NULL,
      plot_item_id varchar NOT NULL REFERENCES pet_park_scene_items(id) ON DELETE CASCADE,
      action text NOT NULL CHECK (action IN ('hoe','plant','water','harvest')),
      inventory_id varchar NOT NULL,
      result jsonb NOT NULL,
      created_at timestamp NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS garden_action_receipts_owner_request_uidx
      ON garden_action_receipts(user_id, request_id);

    CREATE UNIQUE INDEX IF NOT EXISTS garden_player_plot_unique
      ON garden_player_plots(user_id,plot_item_id);
    CREATE INDEX IF NOT EXISTS garden_player_plots_owner_idx
      ON garden_player_plots(user_id);
  `);
}
