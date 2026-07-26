import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { homeDecorItems, placedHomeDecor, userHomeDecorInventory, users, type PlacedHomeDecor } from "@shared/schema";

export type DecorPlacementInput = { xPct: number; yPct: number; size: number; flipped: boolean; location?: string };
export interface DecorTransactionOperations {
  place(userId: string, decorItemId: string, data: DecorPlacementInput): Promise<PlacedHomeDecor>;
  remove(userId: string, placementId: string): Promise<{ decorItemId: string }>;
}
export const executeDecorPlacement = (userId: string, decorItemId: string, data: DecorPlacementInput, operations: DecorTransactionOperations = postgresDecorOperations) => operations.place(userId, decorItemId, data);
export const executeDecorRemoval = (userId: string, placementId: string, operations: DecorTransactionOperations = postgresDecorOperations) => operations.remove(userId, placementId);

const postgresDecorOperations: DecorTransactionOperations = {
  async place(userId, decorItemId, data) {
    return db.transaction(async tx => {
      // Housing lock order: user, decor inventory rows by id, then placement.
      const user = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
      if (!user.rows[0]) throw new Error("User not found");
      const [catalog] = await tx.select({ id: homeDecorItems.id }).from(homeDecorItems).where(eq(homeDecorItems.id, decorItemId)).for("share");
      if (!catalog) throw new Error("Decor item not found");
      const rows = await tx.select().from(userHomeDecorInventory)
        .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, decorItemId)))
        .orderBy(userHomeDecorInventory.id).for("update");
      const inventory = rows[0];
      if (!inventory) throw new Error("Not enough in inventory");
      const consumed = await tx.update(userHomeDecorInventory).set({ quantity: sql`${userHomeDecorInventory.quantity} - 1` })
        .where(and(eq(userHomeDecorInventory.id, inventory.id), eq(userHomeDecorInventory.userId, userId), gte(userHomeDecorInventory.quantity, 1)))
        .returning({ quantity: userHomeDecorInventory.quantity });
      if (!consumed[0]) throw new Error("Not enough in inventory");
      if (consumed[0].quantity === 0) await tx.delete(userHomeDecorInventory).where(and(eq(userHomeDecorInventory.id, inventory.id), eq(userHomeDecorInventory.quantity, 0)));
      const [placement] = await tx.insert(placedHomeDecor).values({ userId, decorItemId, xPct: data.xPct, yPct: data.yPct, size: data.size, flipped: data.flipped, location: data.location ?? "outside" }).returning();
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
      const inventoryRows = await tx.select().from(userHomeDecorInventory)
        .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, placement.decorItemId)))
        .orderBy(userHomeDecorInventory.id).for("update");
      if (inventoryRows[0]) await tx.update(userHomeDecorInventory).set({ quantity: sql`${userHomeDecorInventory.quantity} + 1` }).where(eq(userHomeDecorInventory.id, inventoryRows[0].id));
      else await tx.insert(userHomeDecorInventory).values({ userId, decorItemId: placement.decorItemId, quantity: 1 });
      const removed = await tx.delete(placedHomeDecor).where(and(eq(placedHomeDecor.id, placementId), eq(placedHomeDecor.userId, userId))).returning({ decorItemId: placedHomeDecor.decorItemId });
      if (!removed[0]) throw new Error("Placed decor not found");
      return removed[0];
    });
  },
};
