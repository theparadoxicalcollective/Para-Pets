import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { homeDecorItems, petHousePositions, placedHomeDecor, shopItems, userHomeDecorInventory, userInventory, users, type PlacedHomeDecor } from "@shared/schema";

export type DecorPlacementInput = { xPct: number; yPct: number; flipped: boolean; location?: string };
export interface DecorTransactionOperations {
  place(userId: string, decorItemId: string, data: DecorPlacementInput): Promise<PlacedHomeDecor>;
  remove(userId: string, placementId: string): Promise<{ decorItemId: string }>;
}
export const executeDecorPlacement = (userId: string, decorItemId: string, data: DecorPlacementInput, operations: DecorTransactionOperations = postgresDecorOperations) => operations.place(userId, decorItemId, data);
export const executeDecorRemoval = (userId: string, placementId: string, operations: DecorTransactionOperations = postgresDecorOperations) => operations.remove(userId, placementId);

export async function executeStoreAllHomeScene(userId: string): Promise<{ returnedDecor: number; returnedObjects: number; returnedPets: number }> {
  return db.transaction(async tx => {
    const user = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    if (!user.rows[0]) throw new Error("User not found");

    const placements = await tx.select().from(placedHomeDecor)
      .where(eq(placedHomeDecor.userId, userId))
      .orderBy(placedHomeDecor.id)
      .for("update");

    let returnedDecor = 0;
    let returnedObjects = 0;

    for (const placement of placements) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${placement.decorItemId}))`);

      const [decorCatalog] = await tx
        .select({ id: homeDecorItems.id })
        .from(homeDecorItems)
        .where(eq(homeDecorItems.id, placement.decorItemId))
        .for("share");

      if (decorCatalog) {
        const inventoryRows = await tx.select().from(userHomeDecorInventory)
          .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, placement.decorItemId)))
          .orderBy(userHomeDecorInventory.id)
          .for("update");

        if (inventoryRows[0]) {
          await tx.update(userHomeDecorInventory)
            .set({ quantity: sql`${userHomeDecorInventory.quantity} + 1` })
            .where(eq(userHomeDecorInventory.id, inventoryRows[0].id));
        } else {
          await tx.insert(userHomeDecorInventory).values({ userId, decorItemId: placement.decorItemId, quantity: 1 });
        }
        returnedDecor++;
        continue;
      }

      const [objectCatalog] = await tx
        .select({ id: shopItems.id })
        .from(shopItems)
        .where(and(eq(shopItems.id, placement.decorItemId), eq(shopItems.type, "object")))
        .for("share");
      if (!objectCatalog) throw new Error("Placed decor item not found");

      const inventoryRows = await tx.select().from(userInventory)
        .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, placement.decorItemId)))
        .orderBy(userInventory.id)
        .for("update");

      if (inventoryRows[0]) {
        await tx.update(userInventory)
          .set({ quantity: sql`COALESCE(${userInventory.quantity}, 0) + 1` })
          .where(eq(userInventory.id, inventoryRows[0].id));
      } else {
        await tx.insert(userInventory).values({ userId, shopItemId: placement.decorItemId, quantity: 1 });
      }
      returnedObjects++;
    }

    if (placements.length > 0) {
      await tx.delete(placedHomeDecor).where(eq(placedHomeDecor.userId, userId));
    }

    const petPlacements = await tx.select({ inventoryId: petHousePositions.inventoryId })
      .from(petHousePositions)
      .where(eq(petHousePositions.userId, userId))
      .for("update");
    if (petPlacements.length > 0) {
      await tx.delete(petHousePositions).where(eq(petHousePositions.userId, userId));
    }

    return {
      returnedDecor,
      returnedObjects,
      returnedPets: petPlacements.length,
    };
  });
}

const postgresDecorOperations: DecorTransactionOperations = {
  async place(userId, decorItemId, data) {
    return db.transaction(async tx => {
      // Housing lock order: user, source inventory row, then placement.
      const user = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      if (!user.rows[0]) throw new Error("User not found");

      const [decorCatalog] = await tx
        .select({ id: homeDecorItems.id, homeSceneSize: homeDecorItems.homeSceneSize })
        .from(homeDecorItems)
        .where(eq(homeDecorItems.id, decorItemId))
        .for("share");

      let adminSize: number;

      if (decorCatalog) {
        adminSize = decorCatalog.homeSceneSize;
        const rows = await tx.select().from(userHomeDecorInventory)
          .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, decorItemId)))
          .orderBy(userHomeDecorInventory.id).for("update");
        const inventory = rows[0];
        if (!inventory) throw new Error("Not enough in inventory");
        const consumed = await tx.update(userHomeDecorInventory).set({ quantity: sql`${userHomeDecorInventory.quantity} - 1` })
          .where(and(eq(userHomeDecorInventory.id, inventory.id), eq(userHomeDecorInventory.userId, userId), gte(userHomeDecorInventory.quantity, 1)))
          .returning({ quantity: userHomeDecorInventory.quantity });
        if (!consumed[0]) throw new Error("Not enough in inventory");
        if (consumed[0].quantity === 0) {
          await tx.delete(userHomeDecorInventory)
            .where(and(eq(userHomeDecorInventory.id, inventory.id), eq(userHomeDecorInventory.quantity, 0)));
        }
      } else {
        const [objectCatalog] = await tx
          .select({ id: shopItems.id, homeSceneSize: shopItems.homeSceneSize })
          .from(shopItems)
          .where(and(eq(shopItems.id, decorItemId), eq(shopItems.type, "object")))
          .for("share");
        if (!objectCatalog) throw new Error("Decor item not found");
        adminSize = objectCatalog.homeSceneSize;

        const rows = await tx.select().from(userInventory)
          .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, decorItemId)))
          .orderBy(userInventory.id).for("update");
        const inventory = rows[0];
        if (!inventory) throw new Error("Not enough in inventory");
        const consumed = await tx.update(userInventory).set({ quantity: sql`COALESCE(${userInventory.quantity}, 1) - 1` })
          .where(and(eq(userInventory.id, inventory.id), eq(userInventory.userId, userId), gte(userInventory.quantity, 1)))
          .returning({ quantity: userInventory.quantity });
        if (!consumed[0]) throw new Error("Not enough in inventory");
        if ((consumed[0].quantity ?? 0) === 0) {
          await tx.delete(userInventory)
            .where(and(eq(userInventory.id, inventory.id), eq(userInventory.userId, userId)));
        }
      }

      const [placement] = await tx.insert(placedHomeDecor).values({
        userId,
        decorItemId,
        xPct: data.xPct,
        yPct: data.yPct,
        size: Math.max(60, Math.min(500, adminSize)),
        flipped: data.flipped,
        location: data.location ?? "outside",
      }).returning();
      return placement;
    });
  },
  async remove(userId, placementId) {
    return db.transaction(async tx => {
      const user = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      if (!user.rows[0]) throw new Error("User not found");
      const [placement] = await tx.select().from(placedHomeDecor).where(eq(placedHomeDecor.id, placementId)).for("update");
      if (!placement || placement.userId !== userId) throw new Error("Placed decor not found");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${placement.decorItemId}))`);

      const [decorCatalog] = await tx
        .select({ id: homeDecorItems.id })
        .from(homeDecorItems)
        .where(eq(homeDecorItems.id, placement.decorItemId))
        .for("share");

      if (decorCatalog) {
        const inventoryRows = await tx.select().from(userHomeDecorInventory)
          .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, placement.decorItemId)))
          .orderBy(userHomeDecorInventory.id).for("update");
        if (inventoryRows[0]) {
          await tx.update(userHomeDecorInventory)
            .set({ quantity: sql`${userHomeDecorInventory.quantity} + 1` })
            .where(eq(userHomeDecorInventory.id, inventoryRows[0].id));
        } else {
          await tx.insert(userHomeDecorInventory).values({ userId, decorItemId: placement.decorItemId, quantity: 1 });
        }
      } else {
        const [objectCatalog] = await tx
          .select({ id: shopItems.id })
          .from(shopItems)
          .where(and(eq(shopItems.id, placement.decorItemId), eq(shopItems.type, "object")))
          .for("share");
        if (!objectCatalog) throw new Error("Placed decor item not found");

        const inventoryRows = await tx.select().from(userInventory)
          .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, placement.decorItemId)))
          .orderBy(userInventory.id).for("update");
        if (inventoryRows[0]) {
          await tx.update(userInventory)
            .set({ quantity: sql`COALESCE(${userInventory.quantity}, 0) + 1` })
            .where(eq(userInventory.id, inventoryRows[0].id));
        } else {
          await tx.insert(userInventory).values({ userId, shopItemId: placement.decorItemId, quantity: 1 });
        }
      }

      const removed = await tx.delete(placedHomeDecor)
        .where(and(eq(placedHomeDecor.id, placementId), eq(placedHomeDecor.userId, userId)))
        .returning({ decorItemId: placedHomeDecor.decorItemId });
      if (!removed[0]) throw new Error("Placed decor not found");
      return removed[0];
    });
  },
};
