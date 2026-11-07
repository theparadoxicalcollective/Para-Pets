import { sql } from "drizzle-orm";
import { db } from "../../db";

/**
 * Additive world-scoped garden plots and idempotency receipts.
 * No player inventory or Pet Park tables are copied or modified.
 * A world garden can reference only a terrain placement in its own world.
 */
export async function ensureWorldGardenStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS world_garden_player_plots (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      world_id text NOT NULL,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plot_item_id varchar NOT NULL,
      crop_id varchar REFERENCES garden_crops(id) ON DELETE RESTRICT,
      phase text NOT NULL DEFAULT 'empty'
        CHECK (phase IN ('empty','tilled','planted','seedling','partial','grown','picked')),
      water_applied integer NOT NULL DEFAULT 0 CHECK (water_applied >= 0),
      harvest_ready boolean NOT NULL DEFAULT false,
      picked_until timestamp,
      passive_growth_at timestamp,
      updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT world_garden_plot_plant_requires_crop
        CHECK (phase IN ('empty','tilled') OR crop_id IS NOT NULL),
      CONSTRAINT world_garden_plot_scene_fk FOREIGN KEY (plot_item_id, world_id)
        REFERENCES world_scene_placements (id, world_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS world_garden_player_plot_unique
      ON world_garden_player_plots (user_id, world_id, plot_item_id);
    CREATE INDEX IF NOT EXISTS world_garden_player_owner_idx
      ON world_garden_player_plots (user_id, world_id);

    CREATE TABLE IF NOT EXISTS world_garden_action_receipts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      world_id text NOT NULL,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id varchar NOT NULL,
      plot_item_id varchar NOT NULL,
      action text NOT NULL CHECK (action IN ('hoe','plant','water','harvest')),
      inventory_id varchar NOT NULL,
      result jsonb NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT world_garden_receipt_scene_fk FOREIGN KEY (plot_item_id, world_id)
        REFERENCES world_scene_placements (id, world_id) ON DELETE CASCADE
    );
    -- One request ID cannot debit shared inventory twice in different worlds.
    CREATE UNIQUE INDEX IF NOT EXISTS world_garden_action_owner_request_uidx
      ON world_garden_action_receipts (user_id, request_id);
    CREATE INDEX IF NOT EXISTS world_garden_action_owner_world_idx
      ON world_garden_action_receipts (user_id, world_id);
  `);
}
