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
    const existingResult = await tx.execute(sql`
      SELECT id, pos_x, pos_y, icon_size, sort_order, flipped
      FROM world_locations
      WHERE world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND (id = ${SOUL_EXCHANGE_LOCATION.id}
          OR lower(name) IN ('soul exchange', 'the soul exchange'))
      ORDER BY CASE WHEN id = ${SOUL_EXCHANGE_LOCATION.id} THEN 0 ELSE 1 END, created_at
    `);
    const existing = existingResult.rows as Array<any>;
    const canonical = existing.find(row => row.id === SOUL_EXCHANGE_LOCATION.id);
    const duplicate = existing.find(row => row.id !== SOUL_EXCHANGE_LOCATION.id);
    const snapshotResult = await tx.execute(sql`SELECT value FROM game_settings WHERE key = 'admin_pos_locs__haunted_woods' FOR UPDATE`);
    let snapshot: Array<{ id: string; posX: number; posY: number }> = [];
    try { snapshot = JSON.parse(String((snapshotResult.rows[0] as any)?.value || "[]")); } catch { snapshot = []; }
    const canonicalSnapshot = snapshot.find(entry => entry.id === SOUL_EXCHANGE_LOCATION.id);
    const duplicateSnapshot = duplicate && snapshot.find(entry => entry.id === duplicate.id);

    // A snapshot entry is the durable marker that an administrator established
    // placement. If the canonical row has none, preserve the staged/manual
    // portal's complete layout before retiring it.
    let migratedLayout: any = null;
    if (duplicate && !canonicalSnapshot) {
      const posX = duplicateSnapshot?.posX ?? duplicate.pos_x;
      const posY = duplicateSnapshot?.posY ?? duplicate.pos_y;
      if (canonical) {
        await tx.execute(sql`UPDATE world_locations SET pos_x=${posX}, pos_y=${posY}, icon_size=${duplicate.icon_size}, sort_order=${duplicate.sort_order}, flipped=${duplicate.flipped} WHERE id=${SOUL_EXCHANGE_LOCATION.id}`);
      }
      migratedLayout = { posX, posY, iconSize: duplicate.icon_size, sortOrder: duplicate.sort_order, flipped: duplicate.flipped };
      snapshot = snapshot.filter(entry => entry.id !== duplicate.id);
      snapshot.push({ id: SOUL_EXCHANGE_LOCATION.id, posX: Number(posX), posY: Number(posY) });
    } else if (duplicate) {
      snapshot = snapshot.filter(entry => entry.id !== duplicate.id);
    }
    if (duplicate || duplicateSnapshot) {
      await tx.execute(sql`INSERT INTO game_settings(key,value) VALUES('admin_pos_locs__haunted_woods',${JSON.stringify(snapshot)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    }
    // Retire only the known obsolete placeholder. The name guard prevents an
    // administrator-repurposed location from being deleted unexpectedly.
    await tx.execute(sql`
      DELETE FROM world_locations
      WHERE id = ${LEGACY_SOUL_POND_LOCATION_ID}
        AND world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND lower(name) IN ('phantom hollow', 'soul pond')
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
    if (!canonical && migratedLayout) {
      await tx.execute(sql`UPDATE world_locations SET pos_x=${migratedLayout.posX}, pos_y=${migratedLayout.posY}, icon_size=${migratedLayout.iconSize}, sort_order=${migratedLayout.sortOrder}, flipped=${migratedLayout.flipped} WHERE id=${SOUL_EXCHANGE_LOCATION.id}`);
    }

    // Layout and its snapshot have been transferred above; deletion is last.
    await tx.execute(sql`
      DELETE FROM world_locations
      WHERE world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND id <> ${SOUL_EXCHANGE_LOCATION.id}
        AND lower(name) IN ('soul exchange', 'the soul exchange')
    `);
  });

  console.log("Haunted Woods: Soul Exchange portal reconciled.");
}
