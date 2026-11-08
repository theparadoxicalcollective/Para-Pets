import { db } from "../../db";
import { sql } from "drizzle-orm";

/** Additive, private world-scene authoring storage; no Pet Park or live-world rows. */
export async function ensureWorldSceneContentStorage(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS world_scene_assets (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      world_id text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('decor', 'building')),
      name text NOT NULL,
      image_url text NOT NULL,
      tap_image_url text,
      interior_image_url text,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT world_scene_assets_id_world_unique UNIQUE (id, world_id)
    );
    CREATE INDEX IF NOT EXISTS world_scene_assets_world_idx ON world_scene_assets (world_id);

    CREATE TABLE IF NOT EXISTS world_scene_placements (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      world_id text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('decor', 'building', 'effect', 'terrain')),
      asset_id varchar,
      effect_type text,
      terrain_key text,
      x_pct real NOT NULL DEFAULT 0.5 CHECK (x_pct BETWEEN 0 AND 1),
      y_pct real NOT NULL DEFAULT 0.5 CHECK (y_pct BETWEEN 0 AND 1),
      size integer NOT NULL DEFAULT 100 CHECK (size BETWEEN 1 AND 1000),
      flipped boolean NOT NULL DEFAULT false,
      layer integer NOT NULL DEFAULT 0,
      decor_effects jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_water_source boolean NOT NULL DEFAULT false,
      is_shop boolean NOT NULL DEFAULT false,
      shop_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      shop_item_placements jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT world_scene_placements_asset_fk FOREIGN KEY (asset_id, world_id)
        REFERENCES world_scene_assets (id, world_id) ON DELETE RESTRICT,
      CONSTRAINT world_scene_placements_id_world_unique UNIQUE (id, world_id),
      CONSTRAINT world_scene_placements_kind_asset_check CHECK (
        (kind IN ('decor','building') AND asset_id IS NOT NULL AND effect_type IS NULL AND terrain_key IS NULL)
        OR (kind IN ('effect','terrain') AND asset_id IS NULL AND effect_type IS NOT NULL)
      )
    );
    ALTER TABLE world_scene_placements ADD COLUMN IF NOT EXISTS effect_color text;
    ALTER TABLE world_scene_placements
      ADD COLUMN IF NOT EXISTS shop_item_placements jsonb NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS world_scene_placements_world_idx ON world_scene_placements (world_id);
    CREATE UNIQUE INDEX IF NOT EXISTS world_scene_terrain_cell_unique
      ON world_scene_placements (world_id, terrain_key) WHERE terrain_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS world_scene_interior_items (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      world_id text NOT NULL,
      building_id varchar NOT NULL,
      kind text NOT NULL CHECK (kind IN ('decor','effect')),
      asset_id varchar,
      effect_type text,
      x_pct real NOT NULL CHECK (x_pct BETWEEN 0 AND 1),
      y_pct real NOT NULL CHECK (y_pct BETWEEN 0 AND 1),
      size integer NOT NULL CHECK (size BETWEEN 1 AND 1000),
      flipped boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT world_scene_interior_building_fk FOREIGN KEY (building_id, world_id)
        REFERENCES world_scene_placements (id, world_id) ON DELETE CASCADE,
      CONSTRAINT world_scene_interior_asset_fk FOREIGN KEY (asset_id, world_id)
        REFERENCES world_scene_assets (id, world_id) ON DELETE RESTRICT,
      CONSTRAINT world_scene_interior_kind_check CHECK (
        (kind = 'decor' AND asset_id IS NOT NULL AND effect_type IS NULL)
        OR (kind = 'effect' AND asset_id IS NULL AND effect_type IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS world_scene_interior_building_idx
      ON world_scene_interior_items (world_id, building_id);
  `);
}
