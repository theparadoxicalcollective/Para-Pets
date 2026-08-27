import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  playerFishInventory,
  playerMarketListings,
  shopItems,
  userInventory,
  users,
  type PlayerMarketListing,
} from "@shared/schema";
import { petEquippedCostumes } from "@shared/costumeSchema";

type MarketTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MarketplaceErrorCode =
  | "not_found" | "wrong_owner" | "not_active" | "already_sold"
  | "already_cancelled" | "insufficient_funds" | "item_not_owned"
  | "invalid_price" | "invalid_quantity" | "unsupported_item"
  | "listing_limit" | "own_listing" | "already_collected" | "conflict";

export class MarketplaceError extends Error {
  constructor(public readonly code: MarketplaceErrorCode, message: string) {
    super(message);
    this.name = "MarketplaceError";
  }
}

const assertPrice = (price: number) => {
  if (typeof price !== "number" || !Number.isInteger(price) || price < 1 || price > 1_000_000) {
    throw new MarketplaceError("invalid_price", "Price must be between 1 and 1,000,000 coins");
  }
};

async function lockUser(tx: MarketTx, userId: string) {
  const result = await tx.execute(sql`SELECT id, username, market_extra_slots FROM users WHERE id = ${userId} FOR UPDATE`);
  const row = result.rows[0] as any;
  if (!row) throw new MarketplaceError("not_found", "User not found");
  return row;
}

async function assertSlotAvailable(tx: MarketTx, sellerId: string, extraSlots: number) {
  const result = await tx.execute(sql`
    SELECT count(*)::int AS count FROM player_market_listings
    WHERE seller_id = ${sellerId} AND status IN ('active', 'sold')
  `);
  const totalSlots = 25 + (extraSlots ?? 0);
  if (Number((result.rows[0] as any)?.count ?? 0) >= totalSlots) {
    throw new MarketplaceError("listing_limit", `You've reached your listing limit (${totalSlots} slots). Collect sold coins or buy more slots.`);
  }
}

export async function createInventoryListing(input: { actorId: string; inventoryId: string; price: number }): Promise<PlayerMarketListing> {
  assertPrice(input.price);
  return db.transaction(async (tx) => {
    const actor = await lockUser(tx, input.actorId);
    const [inventory] = await tx.select().from(userInventory)
      .where(eq(userInventory.id, input.inventoryId)).for("update");
    if (!inventory || inventory.userId !== input.actorId) throw new MarketplaceError("item_not_owned", "Item not found in your inventory");
    if (inventory.isListed) throw new MarketplaceError("conflict", "Item is already listed");
    if (inventory.quantity < 1) throw new MarketplaceError("invalid_quantity", "Invalid inventory quantity");
    const [equippedCostume] = await tx.select({ id: petEquippedCostumes.id })
      .from(petEquippedCostumes)
      .where(eq(petEquippedCostumes.costumeInventoryId, inventory.id))
      .limit(1);
    if (equippedCostume) throw new MarketplaceError("conflict", "Unequip this costume before listing it");
    const [item] = await tx.select().from(shopItems).where(eq(shopItems.id, inventory.shopItemId));
    if (!item) throw new MarketplaceError("unsupported_item", "Item data not found");
    if (item.type === "pet" && inventory.isHatched) {
      throw new MarketplaceError("unsupported_item", "Hatch your pet into an egg first before listing — use the Revert to Egg option.");
    }
    await assertSlotAvailable(tx, input.actorId, Number(actor.market_extra_slots ?? 0));
    const updated = await tx.update(userInventory).set({ isListed: true })
      .where(and(eq(userInventory.id, inventory.id), eq(userInventory.userId, input.actorId), eq(userInventory.isListed, false))).returning();
    if (updated.length !== 1) throw new MarketplaceError("conflict", "Item is already listed");
    const itemType = item.type === "pet" ? "pet_egg" : item.type === "fishing" && item.fishingType ? item.fishingType : item.type;
    const [listing] = await tx.insert(playerMarketListings).values({
      sellerId: input.actorId, sellerName: actor.username, inventoryId: inventory.id,
      shopItemId: item.id, itemName: item.name,
      itemImageUrl: item.type === "pet" ? (item.eggImageUrl ?? item.imageUrl) : item.imageUrl,
      itemType, price: input.price,
    }).returning();
    return listing;
  });
}

export async function createFishListing(input: { actorId: string; fishInventoryId: string; price: number }): Promise<PlayerMarketListing> {
  assertPrice(input.price);
  return db.transaction(async (tx) => {
    const actor = await lockUser(tx, input.actorId);
    const [fish] = await tx.select().from(playerFishInventory)
      .where(eq(playerFishInventory.id, input.fishInventoryId)).for("update");
    if (!fish || fish.userId !== input.actorId) throw new MarketplaceError("item_not_owned", "Fish not found in your inventory");
    if (fish.inAquarium) throw new MarketplaceError("unsupported_item", "Remove the fish from your aquarium before listing it");
    const [item] = await tx.select().from(shopItems).where(eq(shopItems.id, fish.shopItemId));
    if (!item) throw new MarketplaceError("unsupported_item", "Fish item data not found");
    await assertSlotAvailable(tx, input.actorId, Number(actor.market_extra_slots ?? 0));
    const removed = await tx.delete(playerFishInventory)
      .where(and(eq(playerFishInventory.id, fish.id), eq(playerFishInventory.userId, input.actorId))).returning();
    if (removed.length !== 1) throw new MarketplaceError("conflict", "Fish is no longer owned");
    const [escrow] = await tx.insert(userInventory).values({ userId: input.actorId, shopItemId: fish.shopItemId, isListed: true }).returning();
    const [listing] = await tx.insert(playerMarketListings).values({
      sellerId: input.actorId, sellerName: actor.username, inventoryId: escrow.id,
      shopItemId: item.id, itemName: item.name, itemImageUrl: item.imageUrl,
      itemType: "fish", price: input.price,
    }).returning();
    return listing;
  });
}

export async function buyListing(input: { actorId: string; listingId: string }): Promise<{ price: number; replayed: boolean }> {
  return db.transaction(async (tx) => {
    const [listing] = await tx.select().from(playerMarketListings)
      .where(eq(playerMarketListings.id, input.listingId)).for("update");
    if (!listing) throw new MarketplaceError("not_found", "Listing not found");
    if (listing.status === "sold" && listing.buyerId === input.actorId) return { price: listing.price, replayed: true };
    if (listing.status === "sold") throw new MarketplaceError("already_sold", "This item was just purchased by someone else");
    if (listing.status !== "active") throw new MarketplaceError("not_active", "This item is no longer available");
    if (listing.sellerId === input.actorId) throw new MarketplaceError("own_listing", "You cannot buy your own listing");
    await lockUser(tx, input.actorId);
    const debit = await tx.update(users).set({ coins: sql`${users.coins} - ${listing.price}` })
      .where(and(eq(users.id, input.actorId), gte(users.coins, listing.price))).returning({ coins: users.coins });
    if (debit.length !== 1) throw new MarketplaceError("insufficient_funds", "Not enough coins");
    const [escrow] = await tx.select().from(userInventory).where(eq(userInventory.id, listing.inventoryId)).for("update");
    if (!escrow || escrow.userId !== listing.sellerId || !escrow.isListed) throw new MarketplaceError("conflict", "Listed item is no longer in escrow");
    const [equippedCostume] = await tx.select({ id: petEquippedCostumes.id })
      .from(petEquippedCostumes)
      .where(eq(petEquippedCostumes.costumeInventoryId, escrow.id))
      .limit(1);
    if (equippedCostume) throw new MarketplaceError("conflict", "Listed costume is still equipped");
    if (listing.itemType === "fish") {
      await tx.insert(playerFishInventory).values({ userId: input.actorId, shopItemId: escrow.shopItemId });
      const removed = await tx.delete(userInventory).where(and(eq(userInventory.id, escrow.id), eq(userInventory.isListed, true))).returning();
      if (removed.length !== 1) throw new MarketplaceError("conflict", "Fish transfer conflicted");
    } else {
      const hatchStartedAt = listing.itemType === "pet_egg"
        ? new Date(Date.now() - (((await tx.select({ hatchTime: shopItems.hatchTime }).from(shopItems).where(eq(shopItems.id, escrow.shopItemId)))[0]?.hatchTime ?? 24) * 3_600_000 + 2_000))
        : escrow.hatchStartedAt;
      const moved = await tx.update(userInventory).set({ userId: input.actorId, isListed: false, hatchStartedAt })
        .where(and(eq(userInventory.id, escrow.id), eq(userInventory.userId, listing.sellerId), eq(userInventory.isListed, true))).returning();
      if (moved.length !== 1) throw new MarketplaceError("conflict", "Item transfer conflicted");
    }
    const sold = await tx.update(playerMarketListings).set({ status: "sold", buyerId: input.actorId })
      .where(and(eq(playerMarketListings.id, listing.id), eq(playerMarketListings.status, "active"))).returning();
    if (sold.length !== 1) throw new MarketplaceError("conflict", "Listing state conflicted");
    return { price: listing.price, replayed: false };
  });
}

export async function cancelListing(input: { actorId: string; listingId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [listing] = await tx.select().from(playerMarketListings).where(eq(playerMarketListings.id, input.listingId)).for("update");
    if (!listing) throw new MarketplaceError("already_cancelled", "Listing not found or already cancelled");
    if (listing.sellerId !== input.actorId) throw new MarketplaceError("wrong_owner", "Only the seller can cancel this listing");
    if (listing.status === "sold") throw new MarketplaceError("already_sold", "Listing has already sold");
    if (listing.status !== "active") throw new MarketplaceError("not_active", "Listing is not active");
    const [escrow] = await tx.select().from(userInventory).where(eq(userInventory.id, listing.inventoryId)).for("update");
    if (!escrow || escrow.userId !== input.actorId || !escrow.isListed) throw new MarketplaceError("conflict", "Listed item is no longer in escrow");
    if (listing.itemType === "fish") {
      await tx.insert(playerFishInventory).values({ userId: input.actorId, shopItemId: escrow.shopItemId });
      await tx.delete(userInventory).where(and(eq(userInventory.id, escrow.id), eq(userInventory.isListed, true)));
    } else {
      await tx.update(userInventory).set({ isListed: false }).where(and(eq(userInventory.id, escrow.id), eq(userInventory.isListed, true)));
    }
    const removed = await tx.delete(playerMarketListings).where(and(eq(playerMarketListings.id, listing.id), eq(playerMarketListings.status, "active"))).returning();
    if (removed.length !== 1) throw new MarketplaceError("conflict", "Cancellation conflicted");
  });
}

export async function collectProceeds(input: { actorId: string; listingId: string }): Promise<{ coinsEarned: number; newBalance: number }> {
  return db.transaction(async (tx) => {
    const [listing] = await tx.select().from(playerMarketListings).where(eq(playerMarketListings.id, input.listingId)).for("update");
    if (!listing) throw new MarketplaceError("already_collected", "Listing not found or coins already collected");
    if (listing.sellerId !== input.actorId) throw new MarketplaceError("wrong_owner", "Only the seller can collect these proceeds");
    if (listing.status !== "sold") throw new MarketplaceError("not_active", "Listing proceeds are not ready");
    await lockUser(tx, input.actorId);
    const [credited] = await tx.update(users).set({
      coins: sql`${users.coins} + ${listing.price}`,
      totalCoinsEarned: sql`${users.totalCoinsEarned} + ${listing.price}`,
    }).where(eq(users.id, input.actorId)).returning({ coins: users.coins });
    if (!credited) throw new MarketplaceError("conflict", "Seller balance could not be credited");
    const removed = await tx.delete(playerMarketListings).where(and(eq(playerMarketListings.id, listing.id), eq(playerMarketListings.status, "sold"))).returning();
    if (removed.length !== 1) throw new MarketplaceError("conflict", "Proceeds collection conflicted");
    return { coinsEarned: listing.price, newBalance: credited.coins };
  });
}

