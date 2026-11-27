import { and, count, eq, sql } from "drizzle-orm";
import { worldSceneAssets, worldSceneInteriorItems, worldScenePlacements } from "@shared/schema";
import { WORLD_SCENE_MAX_ASSETS } from "@shared/worlds/worldSceneContent";
import type { db as database } from "./db";

// Only artwork referenced by this world's scenery or rooms consumes a scene
// slot. Keep unplaced rows and media intact; never delete existing artwork.
export function referencedWorldAssetFilter(worldId: string) {
  return and(eq(worldSceneAssets.worldId, worldId), sql<boolean>`(
    EXISTS (SELECT 1 FROM ${worldScenePlacements}
      WHERE ${worldScenePlacements.worldId} = ${worldId}
      AND ${worldScenePlacements.assetId} = ${worldSceneAssets.id})
    OR EXISTS (SELECT 1 FROM ${worldSceneInteriorItems}
      WHERE ${worldSceneInteriorItems.worldId} = ${worldId}
      AND ${worldSceneInteriorItems.assetId} = ${worldSceneAssets.id})
  )`)!;
}

export async function worldAssetCapacityAvailable(db: typeof database, worldId: string, assetId?: string) {
  // Duplicating an already-used asset never consumes another distinct slot.
  if (assetId) {
    const [used] = await db.select({ id: worldSceneAssets.id }).from(worldSceneAssets)
      .where(and(referencedWorldAssetFilter(worldId), eq(worldSceneAssets.id, assetId))).limit(1);
    if (used) return true;
  }
  const [row] = await db.select({ total: count() }).from(worldSceneAssets)
    .where(referencedWorldAssetFilter(worldId));
  return row.total < WORLD_SCENE_MAX_ASSETS;
}
