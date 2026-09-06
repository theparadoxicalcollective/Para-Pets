import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  HAUNTED_WOODS_FISHING_SPOTS,
  HAUNTED_WOODS_WORLD_ID,
  LEGACY_SOUL_POND_LOCATION_ID,
  SOUL_EXCHANGE_LOCATION,
} from "@shared/hauntedWoods";

const HAUNTED_CASINO_LOCATION_ID = "e2f3a4b5-0001-4000-8000-000000000001";
const HAUNTED_CASINO_BACKGROUND_PATH = "uploads/HauntedCasinoMainBG.png";

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
  const casinoBackgroundUrl = versionedWorldAssetUrl(HAUNTED_CASINO_BACKGROUND_PATH);

  await db.transaction(async (tx) => {
    const existingResult = await tx.execute(sql`
      SELECT id, pos_x, pos_y, icon_size, sort_order, flipped
      FROM world_locations
      WHERE world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND (id = ${SOUL_EXCHANGE_LOCATION.id}
          OR lower(name) IN ('soul exchange', 'the soul exchange')
          OR (id = ${LEGACY_SOUL_POND_LOCATION_ID} AND lower(name) IN ('phantom hollow', 'soul pond')))
      ORDER BY CASE WHEN id = ${SOUL_EXCHANGE_LOCATION.id} THEN 0 ELSE 1 END, created_at
    `);
    const existing = existingResult.rows as Array<any>;
    const canonical = existing.find(row => row.id === SOUL_EXCHANGE_LOCATION.id);
    const duplicates = existing.filter(row => row.id !== SOUL_EXCHANGE_LOCATION.id);
    const snapshotResult = await tx.execute(sql`SELECT value FROM game_settings WHERE key = 'admin_pos_locs__haunted_woods' FOR UPDATE`);
    let snapshot: Array<{ id: string; posX: number; posY: number }> = [];
    try { snapshot = JSON.parse(String((snapshotResult.rows[0] as any)?.value || "[]")); } catch { snapshot = []; }
    const canonicalSnapshot = snapshot.find(entry => entry.id === SOUL_EXCHANGE_LOCATION.id);
    const duplicateIds = new Set(duplicates.map(row => row.id));
    const duplicateWithSnapshot = duplicates.find(row => snapshot.some(entry => entry.id === row.id));
    const layoutSource = duplicateWithSnapshot ?? duplicates[0];
    const layoutSnapshot = layoutSource && snapshot.find(entry => entry.id === layoutSource.id);

    // A snapshot entry is the durable marker that an administrator established
    // placement. If the canonical row has none, preserve the staged/manual
    // portal's complete layout before retiring it.
    let migratedLayout: any = null;
    if (layoutSource && !canonicalSnapshot) {
      const posX = layoutSnapshot?.posX ?? layoutSource.pos_x;
      const posY = layoutSnapshot?.posY ?? layoutSource.pos_y;
      migratedLayout = { posX, posY, iconSize: layoutSource.icon_size, sortOrder: layoutSource.sort_order, flipped: layoutSource.flipped };
      if (canonical) await tx.execute(sql`UPDATE world_locations SET pos_x=${posX}, pos_y=${posY}, icon_size=${layoutSource.icon_size}, sort_order=${layoutSource.sort_order}, flipped=${layoutSource.flipped} WHERE id=${SOUL_EXCHANGE_LOCATION.id}`);
    }
    // Snapshot IDs are repaired in the same transaction, before duplicates
    // disappear. A canonical entry remains the durable admin-placement marker.
    if (duplicates.length) {
      snapshot = snapshot.filter(entry => !duplicateIds.has(entry.id));
      if (!canonicalSnapshot && migratedLayout) snapshot.push({ id: SOUL_EXCHANGE_LOCATION.id, posX: Number(migratedLayout.posX), posY: Number(migratedLayout.posY) });
      await tx.execute(sql`INSERT INTO game_settings(key,value) VALUES('admin_pos_locs__haunted_woods',${JSON.stringify(snapshot)}) ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
    }
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

    // The position snapshot is the authoritative record of an admin drag. A
    // separate world seed/reconcile can touch the canonical row before this
    // function runs, so merely noticing the snapshot is not enough: restore it
    // explicitly every startup. This keeps the Soul Exchange anchored exactly
    // where the admin placed it across deploys, restarts, and asset refreshes.
    if (canonicalSnapshot) {
      await tx.execute(sql`
        UPDATE world_locations
        SET pos_x = ${canonicalSnapshot.posX}, pos_y = ${canonicalSnapshot.posY}
        WHERE id = ${SOUL_EXCHANGE_LOCATION.id}
      `);
    } else if (!canonical && migratedLayout) {
      await tx.execute(sql`UPDATE world_locations SET pos_x=${migratedLayout.posX}, pos_y=${migratedLayout.posY}, icon_size=${migratedLayout.iconSize}, sort_order=${migratedLayout.sortOrder}, flipped=${migratedLayout.flipped} WHERE id=${SOUL_EXCHANGE_LOCATION.id}`);
    }

    // Haunted Woods now has two source-controlled fishing destinations. They
    // use the same `type = 'fishing'` contract as every other world, so the
    // existing WorldPage handoff opens FishingPage without world-specific UI.
    // ON CONFLICT intentionally avoids layout columns: after creation, admins
    // remain free to move, resize, flip, and reorder each hotspot.
    for (const fishingSpot of HAUNTED_WOODS_FISHING_SPOTS) {
      await tx.execute(sql`
        INSERT INTO world_locations (
          id, world_id, name, type, description,
          pos_x, pos_y, glow_color, icon_size, sort_order,
          is_shop, icon_url, bg_url
        ) VALUES (
          ${fishingSpot.id},
          ${fishingSpot.worldId},
          ${fishingSpot.name},
          ${fishingSpot.type},
          ${fishingSpot.description},
          ${fishingSpot.defaultPosition.x},
          ${fishingSpot.defaultPosition.y},
          ${fishingSpot.glowColor},
          ${fishingSpot.defaultIconSize},
          ${fishingSpot.defaultSortOrder},
          false,
          NULL,
          NULL
        )
        ON CONFLICT (id) DO UPDATE SET
          world_id = EXCLUDED.world_id,
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          description = EXCLUDED.description,
          glow_color = EXCLUDED.glow_color,
          is_shop = false
      `);

      const fishingSnapshot = snapshot.find(entry => entry.id === fishingSpot.id);
      if (fishingSnapshot) {
        await tx.execute(sql`
          UPDATE world_locations
          SET pos_x = ${fishingSnapshot.posX}, pos_y = ${fishingSnapshot.posY}
          WHERE id = ${fishingSpot.id}
        `);
      }
    }

    // If Haunted Woods already had pond stock from a manually-created fishing
    // spot, make that stock available from both canonical spots. This is a
    // no-op on a fresh/unstocked world and never creates fish definitions.
    await tx.execute(sql`
      INSERT INTO pond_fish (location_id, shop_item_id)
      SELECT target.id, stocked.shop_item_id
      FROM world_locations target
      CROSS JOIN (
        SELECT DISTINCT pf.shop_item_id
        FROM pond_fish pf
        JOIN world_locations source ON source.id = pf.location_id
        WHERE source.world_id = ${HAUNTED_WOODS_WORLD_ID}
          AND lower(COALESCE(source.type, '')) = 'fishing'
      ) stocked
      WHERE target.world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND target.id IN (${HAUNTED_WOODS_FISHING_SPOTS[0].id}, ${HAUNTED_WOODS_FISHING_SPOTS[1].id})
      ON CONFLICT DO NOTHING
    `);

    // Keep the stable Casino row wired to the new full-height, horizontally
    // pannable scene. Position/icon layout remains admin-owned; only its
    // presentation name/background are reconciled from source-controlled art.
    await tx.execute(sql`
      UPDATE world_locations
      SET name = 'Haunted Casino',
          bg_url = ${casinoBackgroundUrl}
      WHERE world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND id = ${HAUNTED_CASINO_LOCATION_ID}
    `);

    // Layout and its snapshot have been transferred above; deletion is last.
    await tx.execute(sql`
      DELETE FROM world_locations
      WHERE world_id = ${HAUNTED_WOODS_WORLD_ID}
        AND id <> ${SOUL_EXCHANGE_LOCATION.id}
        AND ((id = ${LEGACY_SOUL_POND_LOCATION_ID} AND lower(name) IN ('phantom hollow', 'soul pond'))
          OR lower(name) IN ('soul exchange', 'the soul exchange'))
    `);
  });

  console.log("Haunted Woods: Soul Exchange, two fishing spots, and Casino presentation reconciled.");
}
