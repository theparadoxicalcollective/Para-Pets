import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  HAUNTED_WOODS_WORLD_ID,
  LEGACY_SOUL_POND_LOCATION_ID,
  SOUL_EXCHANGE_LOCATION,
} from "@shared/hauntedWoods";

function versionedWorldAssetUrl(relativePath: string): string {
  const absolutePath = path.join(process.cwd(), "attached_assets", relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Haunted Woods asset is missing: ${relativePath}`);
  }
  const version = Math.floor(fs.statSync(absolutePath).mtimeMs / 1000);
  return `/world-assets/${relativePath}?v=${version}`;
}

/**
 * Keeps the Haunted Woods foundation deterministic on both established and
 * fresh databases. Presentation fields are refreshed from source-controlled
 * assets, while admin-controlled position, size, flip, and sort order remain
 * untouched after the location has been created.
 */
export async function reconcileHauntedWoodsWorld(): Promise<void> {
  const portalIconUrl = versionedWorldAssetUrl(SOUL_EXCHANGE_LOCATION.iconAssetPath);
  const backgroundUrl = versionedWorldAssetUrl(SOUL_EXCHANGE_LOCATION.backgroundAssetPath);

  await db.transaction(async (tx) => {
    // Retire only the known obsolete placeholder. The name guard prevents an
    // administrator-repurposed location from being deleted unexpectedly.
    await tx.execute(sql`
      DELETE FROM world_locations
      WHERE id = ${LEGACY_SOUL_POND_LOCATION_ID}
        AND world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND lower(name) IN ('phantom hollow', 'soul pond')
    `);

    // Avoid duplicate Soul Exchange entries if one was manually staged before
    // the canonical location ID was introduced.
    await tx.execute(sql`
      DELETE FROM world_locations
      WHERE world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND id <> ${SOUL_EXCHANGE_LOCATION.id}
        AND lower(name) IN ('soul exchange', 'the soul exchange')
    `);

    await tx.execute(sql`
      INSERT INTO world_locations (
        id, world_id, name, type, description,
        pos_x, pos_y, glow_color, icon_size, sort_order,
        is_shop, icon_url, bg_url
      ) VALUES (
        ${SOUL_EXCHANGE_LOCATION.id},
        ${SOUL_EXCHANGE_LOCATION.worldId},
        ${SOUL_EXCHANGE_LOCATION.name},
        ${SOUL_EXCHANGE_LOCATION.type},
        ${SOUL_EXCHANGE_LOCATION.description},
        ${SOUL_EXCHANGE_LOCATION.defaultPosition.x},
        ${SOUL_EXCHANGE_LOCATION.defaultPosition.y},
        ${SOUL_EXCHANGE_LOCATION.glowColor},
        ${SOUL_EXCHANGE_LOCATION.defaultIconSize},
        ${SOUL_EXCHANGE_LOCATION.defaultSortOrder},
        false,
        ${portalIconUrl},
        ${backgroundUrl}
      )
      ON CONFLICT (id) DO UPDATE SET
        world_id = EXCLUDED.world_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        description = EXCLUDED.description,
        glow_color = EXCLUDED.glow_color,
        is_shop = false,
        icon_url = EXCLUDED.icon_url,
        bg_url = EXCLUDED.bg_url
    `);
  });

  console.log("Haunted Woods: Soul Exchange portal reconciled.");
}
