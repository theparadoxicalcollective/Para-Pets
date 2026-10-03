import { and, asc, eq, sql } from "drizzle-orm";
import {
  homeDecorItems,
  houseBundleIncludedItems,
  shopItems,
  userHomeDecorInventory,
  userHouseBundleItemGrants,
  userHouseBundles,
  userInventory,
} from "@shared/schema";
import { getHouseBundleIncludedItemGrantDelta } from "@shared/housing";
import { db } from "../db";

export interface HouseBundleIncludedItemGrantSummary {
  grantedDecor: number;
  grantedObjects: number;
  entitlementsUpdated: number;
}

function emptySummary(): HouseBundleIncludedItemGrantSummary {
  return { grantedDecor: 0, grantedObjects: 0, entitlementsUpdated: 0 };
}

/**
 * Delivers every currently-active included Home Bundle item that this player
 * has not already received. Callers may safely invoke this more than once.
 *
 * The user row lock serializes bundle-delivery with the existing Home Decor
 * placement/removal paths, which use the same lock order before touching
 * inventory. The per-entitlement ledger then makes retries and concurrent
 * acquisition paths idempotent.
 */
export async function grantHouseBundleIncludedItemsInTransaction(
  tx: any,
  userId: string,
  bundleId: string,
): Promise<HouseBundleIncludedItemGrantSummary> {
  const userLock = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
  if (!userLock.rows?.[0]) return emptySummary();

  const [ownership] = await tx
    .select({ id: userHouseBundles.id })
    .from(userHouseBundles)
    .where(and(eq(userHouseBundles.userId, userId), eq(userHouseBundles.bundleId, bundleId)))
    .limit(1);
  if (!ownership) return emptySummary();

  const included = await tx
    .select()
    .from(houseBundleIncludedItems)
    .where(and(eq(houseBundleIncludedItems.bundleId, bundleId), eq(houseBundleIncludedItems.active, true)))
    .orderBy(asc(houseBundleIncludedItems.createdAt), asc(houseBundleIncludedItems.id));

  const summary = emptySummary();

  for (const entitlement of included) {
    let catalogExists = false;

    if (entitlement.itemType === "decor") {
      const [decor] = await tx
        .select({ id: homeDecorItems.id })
        .from(homeDecorItems)
        .where(eq(homeDecorItems.id, entitlement.itemId))
        .limit(1);
      catalogExists = !!decor;
    } else if (entitlement.itemType === "object") {
      const [object] = await tx
        .select({ id: shopItems.id })
        .from(shopItems)
        .where(and(eq(shopItems.id, entitlement.itemId), eq(shopItems.type, "object")))
        .limit(1);
      catalogExists = !!object;
    }

    // Never mark a broken Admin reference delivered. If its catalog item is
    // repaired later, reconciliation can still grant it exactly once.
    if (!catalogExists) continue;

    const [grant] = await tx
      .select()
      .from(userHouseBundleItemGrants)
      .where(and(
        eq(userHouseBundleItemGrants.userId, userId),
        eq(userHouseBundleItemGrants.includedItemId, entitlement.id),
      ))
      .limit(1);

    const previouslyGranted = grant?.grantedQuantity ?? 0;
    const delta = getHouseBundleIncludedItemGrantDelta(previouslyGranted, entitlement.quantity);
    const nextGrantedQuantity = Math.max(previouslyGranted, entitlement.quantity);

    if (delta > 0 && entitlement.itemType === "decor") {
      const [inventory] = await tx
        .select()
        .from(userHomeDecorInventory)
        .where(and(
          eq(userHomeDecorInventory.userId, userId),
          eq(userHomeDecorInventory.decorItemId, entitlement.itemId),
        ))
        .orderBy(asc(userHomeDecorInventory.id))
        .limit(1);

      if (inventory) {
        await tx
          .update(userHomeDecorInventory)
          .set({ quantity: sql`${userHomeDecorInventory.quantity} + ${delta}` })
          .where(eq(userHomeDecorInventory.id, inventory.id));
      } else {
        await tx.insert(userHomeDecorInventory).values({
          userId,
          decorItemId: entitlement.itemId,
          quantity: delta,
        });
      }
      summary.grantedDecor += delta;
    }

    if (delta > 0 && entitlement.itemType === "object") {
      // Do not add copies onto a listed marketplace row. An included Object
      // always arrives in a normal, usable inventory row.
      const [inventory] = await tx
        .select()
        .from(userInventory)
        .where(and(
          eq(userInventory.userId, userId),
          eq(userInventory.shopItemId, entitlement.itemId),
          eq(userInventory.isListed, false),
        ))
        .orderBy(asc(userInventory.id))
        .limit(1);

      if (inventory) {
        await tx
          .update(userInventory)
          .set({ quantity: sql`${userInventory.quantity} + ${delta}` })
          .where(eq(userInventory.id, inventory.id));
      } else {
        await tx.insert(userInventory).values({
          userId,
          shopItemId: entitlement.itemId,
          quantity: delta,
        });
      }
      summary.grantedObjects += delta;
    }

    if (grant) {
      if (nextGrantedQuantity > previouslyGranted) {
        await tx
          .update(userHouseBundleItemGrants)
          .set({ grantedQuantity: nextGrantedQuantity, grantedAt: new Date() })
          .where(eq(userHouseBundleItemGrants.id, grant.id));
        summary.entitlementsUpdated++;
      }
    } else {
      await tx.insert(userHouseBundleItemGrants).values({
        userId,
        includedItemId: entitlement.id,
        grantedQuantity: nextGrantedQuantity,
      });
      summary.entitlementsUpdated++;
    }
  }

  return summary;
}

export async function ensureHouseBundleIncludedItemsGranted(
  userId: string,
  bundleId: string,
): Promise<HouseBundleIncludedItemGrantSummary> {
  return db.transaction((tx) => grantHouseBundleIncludedItemsInTransaction(tx, userId, bundleId));
}

export async function ensureAllOwnedHouseBundleIncludedItemsGranted(
  userId: string,
): Promise<HouseBundleIncludedItemGrantSummary> {
  return db.transaction(async (tx) => {
    const userLock = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
    if (!userLock.rows?.[0]) return emptySummary();

    const owned = await tx
      .select({ bundleId: userHouseBundles.bundleId })
      .from(userHouseBundles)
      .where(eq(userHouseBundles.userId, userId))
      .orderBy(asc(userHouseBundles.purchasedAt));

    const total = emptySummary();
    for (const ownership of owned) {
      const result = await grantHouseBundleIncludedItemsInTransaction(tx, userId, ownership.bundleId);
      total.grantedDecor += result.grantedDecor;
      total.grantedObjects += result.grantedObjects;
      total.entitlementsUpdated += result.entitlementsUpdated;
    }
    return total;
  });
}
