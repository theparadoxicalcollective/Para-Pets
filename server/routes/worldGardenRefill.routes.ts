import type { Express, RequestHandler } from "express";
import { and, eq, or, sql } from "drizzle-orm";
import {
  worldScenePlacements, shopItems, userInventory, users,
} from "@shared/schema";
import { GARDEN_WATER_CAPACITY, gardenItemNeedsRefill } from "@shared/garden";
import { db } from "../db";
import { isEditableWorldSceneId } from "@shared/worlds/worldSceneDraft";

/**
 * Only a marked Water Source decoration or a saved painted water_path terrain
 * tile and an owned, explicitly refillable,
 * unlisted item can participate. The inventory row is locked so a refill
 * cannot race a future garden watering transaction on the same item.
 */
export function registerWorldGardenRefillRoutes(app: Express, isAuthenticated: RequestHandler, database: typeof db = db): void {
  app.post("/api/admin/world-editor/:worldId/water-sources/:sourceId/refill", isAuthenticated, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isEditableWorldSceneId(worldId))
      return res.status(404).json({ message: "Unknown world" });
    const sourceId = req.params.sourceId;
    const inventoryId = req.body?.inventoryId;
    if (typeof sourceId !== "string" || sourceId.length < 1 || sourceId.length > 100 ||
        typeof inventoryId !== "string" || inventoryId.length < 1 || inventoryId.length > 100) {
      return res.status(400).json({ message: "Choose a water source and a refillable inventory item" });
    }
    const userId = (req.user as { id: string }).id;
    try {
      const result = await database.transaction(async tx => {
        const [player] = await tx.select({ isAdmin: users.isAdmin }).from(users)
          .where(eq(users.id, userId));
        if (!player) return { status: 404 as const, message: "Player not found" };
        if (!player.isAdmin) return { status: 403 as const, message: "World drafts are admin-only" };

        const [source] = await tx.select({
          id: worldScenePlacements.id,
        }).from(worldScenePlacements).where(and(
          eq(worldScenePlacements.id, sourceId),
          eq(worldScenePlacements.worldId, worldId),
          or(
            and(eq(worldScenePlacements.kind, "decor"), eq(worldScenePlacements.isWaterSource, true)),
            and(eq(worldScenePlacements.kind, "terrain"), eq(worldScenePlacements.effectType, "water_path")),
          ),
        ));
        if (!source) return { status: 404 as const, message: "This item is not a water source" };

        // Same row lock must be reused by garden watering to prevent
        // concurrent fill-and-consume calls from overwriting one another.
        await tx.execute(sql`SELECT id FROM user_inventory
          WHERE id = ${inventoryId} AND user_id = ${userId} FOR UPDATE`);
        const [owned] = await tx.select({
          id: userInventory.id,
          quantity: userInventory.quantity,
          isListed: userInventory.isListed,
          gardenWaterLeft: userInventory.gardenWaterLeft,
          isRefillable: shopItems.isRefillable,
          type: shopItems.type, specialType: shopItems.specialType,
          name: shopItems.name,
        }).from(userInventory)
          .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
          .where(and(eq(userInventory.id, inventoryId), eq(userInventory.userId, userId)));
        if (!owned || owned.type !== "garden_tool" || owned.specialType !== "watering_pail" ||
            !owned.isRefillable || owned.isListed || (owned.quantity ?? 1) <= 0)
          return { status: 422 as const, message: "Choose an owned, unlisted refillable item" };

        // Null represents a new, full container. Never mint an item or
        // reset an item that is already full, listed, or not refillable.
        if (!gardenItemNeedsRefill(owned))
          return { status: 409 as const, message: "This item is already full" };

        const [saved] = await tx.update(userInventory)
          .set({ gardenWaterLeft: GARDEN_WATER_CAPACITY })
          .where(and(eq(userInventory.id, owned.id), eq(userInventory.userId, userId)))
          .returning({ waterLeft: userInventory.gardenWaterLeft });
        return {
          status: 200 as const, inventoryId: owned.id, itemName: owned.name,
          waterLeft: saved.waterLeft, capacity: GARDEN_WATER_CAPACITY,
        };
      });
      if (result.status !== 200) return res.status(result.status).json({ message: result.message });
      return res.json(result);
    } catch (error) {
      console.error("[world-garden] water source refill failed", error);
      return res.status(500).json({ message: "Unable to refill this item" });
    }
  });
}
