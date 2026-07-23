import { and, eq, sql } from "drizzle-orm";
import { userInventory } from "@shared/schema";

/** Returns the remaining stack quantity, or null when that use is invalid. */
export function remainingQuantityAfterConsumption(quantity: number, amount = 1): number | null {
  if (!Number.isInteger(quantity) || !Number.isInteger(amount) || quantity < amount || amount < 1) return null;
  return quantity - amount;
}

/**
 * Consume exactly one unit from an owned stack within the caller's transaction.
 * A guarded UPDATE makes the operation safe when two requests race for the last
 * unit; the row is removed only after that update leaves it at zero.
 */
export async function tryConsumeOneFromInventory(
  tx: any,
  userId: string,
  inventoryId: string,
): Promise<{ consumed: boolean; remainingQuantity: number }> {
  const [updated] = await tx
    .update(userInventory)
    .set({ quantity: sql`${userInventory.quantity} - 1` })
    .where(and(
      eq(userInventory.id, inventoryId),
      eq(userInventory.userId, userId),
      sql`${userInventory.quantity} > 0`,
    ))
    .returning({ quantity: userInventory.quantity });

  if (!updated) return { consumed: false, remainingQuantity: 0 };

  // The SQL guard above already establishes this result; keeping the value
  // check explicit also prevents a malformed row from being treated as usable.
  const remainingQuantity = remainingQuantityAfterConsumption(updated.quantity + 1);
  if (remainingQuantity === null) throw new Error("Invalid inventory quantity after consumption");
  if (remainingQuantity === 0) {
    await tx.delete(userInventory).where(and(
      eq(userInventory.id, inventoryId),
      eq(userInventory.userId, userId),
    ));
  }
  return { consumed: true, remainingQuantity };
}

/** Consume a requested number of units from one owned stack in a transaction. */
export async function tryConsumeInventoryQuantity(
  tx: any,
  userId: string,
  inventoryId: string,
  quantity: number,
): Promise<boolean> {
  if (!Number.isInteger(quantity) || quantity < 1) return false;
  const [updated] = await tx
    .update(userInventory)
    .set({ quantity: sql`${userInventory.quantity} - ${quantity}` })
    .where(and(
      eq(userInventory.id, inventoryId),
      eq(userInventory.userId, userId),
      sql`${userInventory.quantity} >= ${quantity}`,
    ))
    .returning({ quantity: userInventory.quantity });
  if (!updated) return false;
  const remainingQuantity = remainingQuantityAfterConsumption(updated.quantity + quantity, quantity);
  if (remainingQuantity === null) throw new Error("Invalid inventory quantity after consumption");
  if (remainingQuantity === 0) {
    await tx.delete(userInventory).where(and(
      eq(userInventory.id, inventoryId),
      eq(userInventory.userId, userId),
    ));
  }
  return true;
}
