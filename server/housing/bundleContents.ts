import { and, asc, eq, gte, sql } from "drizzle-orm";
import {
  homeDecorItems,
  houseBundleIncludedItems,
  placedHomeDecor,
  shopItems,
  userHomeDecorInventory,
  userHouseBundleItemGrants,
  userHouseBundles,
  userInventory,
  users,
} from "@shared/schema";
import { getHouseBundleIncludedItemGrantDelta } from "@shared/housing";
import { db } from "../db";

export interface HouseBundleIncludedItemGrantSummary {
  grantedDecor: number;
  grantedObjects: number;
  entitlementsUpdated: number;
}

export interface HouseBundleTemplateApplySummary {
  placedDecor: number;
  placedObjects: number;
  templatesCompleted: number;
}

function emptyGrantSummary(): HouseBundleIncludedItemGrantSummary {
  return { grantedDecor: 0, grantedObjects: 0, entitlementsUpdated: 0 };
}

function emptyTemplateSummary(): HouseBundleTemplateApplySummary {
  return { placedDecor: 0, placedObjects: 0, templatesCompleted: 0 };
}

async function lockHousingUser(tx: any, userId: string): Promise<boolean> {
  const result = await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
  return !!result.rows?.[0];
}

/**
 * Delivers every currently-active included Home Bundle item that this player
 * has not already received. Callers may safely invoke this more than once.
 *
 * Delivery first lands in normal player inventory. The first time the bundle
 * becomes active, one copy of each entitlement is moved (not copied) from that
 * inventory into the Admin-authored scene position. That split keeps purchase,
 * reward and marketplace grants safe even when a different Home is active.
 */
export async function grantHouseBundleIncludedItemsInTransaction(
  tx: any,
  userId: string,
  bundleId: string,
): Promise<HouseBundleIncludedItemGrantSummary> {
  if (!await lockHousingUser(tx, userId)) return emptyGrantSummary();

  const [ownership] = await tx
    .select({ id: userHouseBundles.id })
    .from(userHouseBundles)
    .where(and(eq(userHouseBundles.userId, userId), eq(userHouseBundles.bundleId, bundleId)))
    .limit(1);
  if (!ownership) return emptyGrantSummary();

  const included = await tx
    .select()
    .from(houseBundleIncludedItems)
    .where(and(eq(houseBundleIncludedItems.bundleId, bundleId), eq(houseBundleIncludedItems.active, true)))
    .orderBy(asc(houseBundleIncludedItems.createdAt), asc(houseBundleIncludedItems.id));

  const summary = emptyGrantSummary();

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
    if (!await lockHousingUser(tx, userId)) return emptyGrantSummary();

    const owned = await tx
      .select({ bundleId: userHouseBundles.bundleId })
      .from(userHouseBundles)
      .where(eq(userHouseBundles.userId, userId))
      .orderBy(asc(userHouseBundles.purchasedAt));

    const total = emptyGrantSummary();
    for (const ownership of owned) {
      const result = await grantHouseBundleIncludedItemsInTransaction(tx, userId, ownership.bundleId);
      total.grantedDecor += result.grantedDecor;
      total.grantedObjects += result.grantedObjects;
      total.entitlementsUpdated += result.entitlementsUpdated;
    }
    return total;
  });
}

/**
 * Applies the Admin-authored bundle scene only once per entitlement/player.
 * It MOVES one already-granted copy from inventory into placed_home_decor, so
 * opening/reloading a Home cannot manufacture a second copy. Removing the item
 * through the normal player UI sends that same copy back to inventory.
 *
 * A missing inventory copy is treated as a completed template attempt. This is
 * intentional: if a player sells/uses the included item before first opening
 * the Home, reacquiring an unrelated copy later must not unexpectedly pull it
 * out of their inventory.
 */
export async function applyActiveHouseBundleIncludedItemTemplates(
  userId: string,
  expectedBundleId?: string,
): Promise<HouseBundleTemplateApplySummary> {
  return db.transaction(async (tx) => {
    if (!await lockHousingUser(tx, userId)) return emptyTemplateSummary();

    const [user] = await tx
      .select({ activeHouseBundleId: users.activeHouseBundleId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const bundleId = user?.activeHouseBundleId ?? null;
    if (!bundleId || (expectedBundleId && bundleId !== expectedBundleId)) return emptyTemplateSummary();

    const [ownership] = await tx
      .select({ id: userHouseBundles.id })
      .from(userHouseBundles)
      .where(and(eq(userHouseBundles.userId, userId), eq(userHouseBundles.bundleId, bundleId)))
      .limit(1);
    if (!ownership) return emptyTemplateSummary();

    const included = await tx
      .select()
      .from(houseBundleIncludedItems)
      .where(and(eq(houseBundleIncludedItems.bundleId, bundleId), eq(houseBundleIncludedItems.active, true)))
      .orderBy(asc(houseBundleIncludedItems.createdAt), asc(houseBundleIncludedItems.id));

    const summary = emptyTemplateSummary();

    for (const entitlement of included) {
      const [grant] = await tx
        .select()
        .from(userHouseBundleItemGrants)
        .where(and(
          eq(userHouseBundleItemGrants.userId, userId),
          eq(userHouseBundleItemGrants.includedItemId, entitlement.id),
        ))
        .limit(1);

      if (!grant || grant.grantedQuantity < 1 || grant.templateAppliedAt) continue;

      let consumed = false;

      if (entitlement.itemType === "decor") {
        const [inventory] = await tx
          .select()
          .from(userHomeDecorInventory)
          .where(and(
            eq(userHomeDecorInventory.userId, userId),
            eq(userHomeDecorInventory.decorItemId, entitlement.itemId),
          ))
          .orderBy(asc(userHomeDecorInventory.id))
          .for("update")
          .limit(1);

        if (inventory) {
          const [updated] = await tx
            .update(userHomeDecorInventory)
            .set({ quantity: sql`${userHomeDecorInventory.quantity} - 1` })
            .where(and(
              eq(userHomeDecorInventory.id, inventory.id),
              eq(userHomeDecorInventory.userId, userId),
              gte(userHomeDecorInventory.quantity, 1),
            ))
            .returning({ quantity: userHomeDecorInventory.quantity });
          if (updated) {
            consumed = true;
            if (updated.quantity === 0) {
              await tx.delete(userHomeDecorInventory)
                .where(and(eq(userHomeDecorInventory.id, inventory.id), eq(userHomeDecorInventory.quantity, 0)));
            }
          }
        }
      } else if (entitlement.itemType === "object") {
        const [inventory] = await tx
          .select()
          .from(userInventory)
          .where(and(
            eq(userInventory.userId, userId),
            eq(userInventory.shopItemId, entitlement.itemId),
            eq(userInventory.isListed, false),
          ))
          .orderBy(asc(userInventory.id))
          .for("update")
          .limit(1);

        if (inventory) {
          const [updated] = await tx
            .update(userInventory)
            .set({ quantity: sql`${userInventory.quantity} - 1` })
            .where(and(
              eq(userInventory.id, inventory.id),
              eq(userInventory.userId, userId),
              eq(userInventory.isListed, false),
              gte(userInventory.quantity, 1),
            ))
            .returning({ quantity: userInventory.quantity });
          if (updated) {
            consumed = true;
            if ((updated.quantity ?? 0) === 0) {
              await tx.delete(userInventory)
                .where(and(
                  eq(userInventory.id, inventory.id),
                  eq(userInventory.userId, userId),
                  eq(userInventory.isListed, false),
                ));
            }
          }
        }
      }

      if (consumed) {
        await tx.insert(placedHomeDecor).values({
          userId,
          decorItemId: entitlement.itemId,
          xPct: Math.max(0.02, Math.min(0.98, entitlement.xPct)),
          yPct: Math.max(0.02, Math.min(0.98, entitlement.yPct)),
          size: Math.max(60, Math.min(500, entitlement.size)),
          flipped: entitlement.flipped,
          location: entitlement.buildingId ?? "outside",
        });
        if (entitlement.itemType === "decor") summary.placedDecor++;
        else summary.placedObjects++;
      }

      await tx
        .update(userHouseBundleItemGrants)
        .set({ templateAppliedAt: new Date() })
        .where(eq(userHouseBundleItemGrants.id, grant.id));
      summary.templatesCompleted++;
    }

    return summary;
  });
}
