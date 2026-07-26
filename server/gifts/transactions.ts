import { and, eq, gt, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { gifts, homeDecorItems, shopItems, userHomeDecorInventory, userInventory, users, type Gift } from "@shared/schema";

type GiftTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SendGiftInput = {
  senderId: string; receiverId: string; message?: string; coinAmount: number;
  itemType?: string; shopItemInventoryId?: string; decorItemId?: string;
  itemQuantity?: number; itemName?: string; itemImageUrl?: string; shopItemId?: string;
};

export interface GiftTransactionOperations {
  send(input: SendGiftInput): Promise<Gift>;
  accept(giftId: string, receiverId: string): Promise<Gift>;
}

export const executeSendGift = (input: SendGiftInput, operations: GiftTransactionOperations = postgresGiftOperations) =>
  operations.send(input);
export const executeAcceptGift = (giftId: string, receiverId: string, operations: GiftTransactionOperations = postgresGiftOperations) =>
  operations.accept(giftId, receiverId);

async function lockUsers(tx: GiftTx, ids: string[]) {
  const ordered = [...new Set(ids)].sort();
  const result = await tx.execute(sql`SELECT id FROM users WHERE id IN (${sql.join(ordered.map(id => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`);
  if (result.rows.length !== ordered.length) throw new Error("User not found");
}

async function grantDecor(tx: GiftTx, userId: string, decorItemId: string, quantity: number) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${decorItemId}))`);
  const rows = await tx.select().from(userHomeDecorInventory)
    .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, decorItemId)))
    .orderBy(userHomeDecorInventory.id).for("update");
  if (rows[0]) {
    await tx.update(userHomeDecorInventory).set({ quantity: sql`${userHomeDecorInventory.quantity} + ${quantity}` })
      .where(eq(userHomeDecorInventory.id, rows[0].id));
  } else {
    await tx.insert(userHomeDecorInventory).values({ userId, decorItemId, quantity });
  }
}

const postgresGiftOperations: GiftTransactionOperations = {
  async send(input) {
    const quantity = input.itemQuantity ?? 1;
    if (!Number.isSafeInteger(input.coinAmount) || input.coinAmount < 0) throw new Error("coinAmount must be >= 0");
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("itemQuantity must be >= 1");
    if (input.senderId === input.receiverId) throw new Error("Cannot send gift to yourself");
    if (input.itemType != null && input.itemType !== "shop_item" && input.itemType !== "decor") throw new Error("Unsupported gift item type");

    return db.transaction(async tx => {
      // Global gift-transfer lock order: users by id, then inventory rows by id.
      await lockUsers(tx, [input.senderId, input.receiverId]);
      if (input.coinAmount > 0) {
        const debited = await tx.update(users).set({ coins: sql`${users.coins} - ${input.coinAmount}` })
          .where(and(eq(users.id, input.senderId), gte(users.coins, input.coinAmount))).returning({ id: users.id });
        if (debited.length !== 1) throw new Error("Insufficient coins");
      }

      let shopItemId: string | null = null;
      let decorItemId: string | null = null;
      if (input.itemType === "shop_item") {
        if (!input.shopItemInventoryId) throw new Error("Item not found in inventory");
        const [inventory] = await tx.select().from(userInventory).where(eq(userInventory.id, input.shopItemInventoryId)).for("update");
        if (!inventory || inventory.userId !== input.senderId || inventory.isListed) throw new Error("Item not found in inventory");
        shopItemId = inventory.shopItemId;
        const [catalog] = await tx.select({ id: shopItems.id }).from(shopItems).where(eq(shopItems.id, shopItemId)).for("share");
        if (!catalog) throw new Error("Item data not found");
        const consumed = await tx.update(userInventory).set({ quantity: sql`${userInventory.quantity} - ${quantity}` })
          .where(and(eq(userInventory.id, inventory.id), eq(userInventory.userId, input.senderId), eq(userInventory.isListed, false), gte(userInventory.quantity, quantity)))
          .returning({ quantity: userInventory.quantity });
        if (consumed.length !== 1) throw new Error("Not enough in inventory");
        if (consumed[0].quantity === 0) await tx.delete(userInventory).where(and(eq(userInventory.id, inventory.id), eq(userInventory.quantity, 0)));
      } else if (input.itemType === "decor") {
        if (!input.decorItemId) throw new Error("Not enough in inventory");
        decorItemId = input.decorItemId;
        const [catalog] = await tx.select({ id: homeDecorItems.id }).from(homeDecorItems).where(eq(homeDecorItems.id, decorItemId)).for("share");
        if (!catalog) throw new Error("Decor item not found");
        const rows = await tx.select().from(userHomeDecorInventory)
          .where(and(eq(userHomeDecorInventory.userId, input.senderId), eq(userHomeDecorInventory.decorItemId, decorItemId)))
          .orderBy(userHomeDecorInventory.id).for("update");
        const inventory = rows[0];
        if (!inventory) throw new Error("Not enough in inventory");
        const consumed = await tx.update(userHomeDecorInventory).set({ quantity: sql`${userHomeDecorInventory.quantity} - ${quantity}` })
          .where(and(eq(userHomeDecorInventory.id, inventory.id), gte(userHomeDecorInventory.quantity, quantity))).returning({ quantity: userHomeDecorInventory.quantity });
        if (consumed.length !== 1) throw new Error("Not enough in inventory");
        if (consumed[0].quantity === 0) await tx.delete(userHomeDecorInventory).where(and(eq(userHomeDecorInventory.id, inventory.id), eq(userHomeDecorInventory.quantity, 0)));
      }

      const [gift] = await tx.insert(gifts).values({
        senderId: input.senderId, receiverId: input.receiverId, message: input.message ?? null,
        coinAmount: input.coinAmount, itemType: input.itemType ?? null, shopItemId,
        shopItemInventoryId: input.shopItemInventoryId ?? null, decorItemId, itemQuantity: quantity,
        itemName: input.itemName ?? null, itemImageUrl: input.itemImageUrl ?? null, status: "pending",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).returning();
      return gift;
    });
  },

  async accept(giftId, receiverId) {
    return db.transaction(async tx => {
      // Acceptance starts with the unique gift row, then the receiver and grant inventory.
      const [gift] = await tx.select().from(gifts).where(eq(gifts.id, giftId)).for("update");
      if (!gift || gift.receiverId !== receiverId) throw new Error("Gift not found");
      if (gift.status === "accepted") return gift;
      if (gift.status !== "pending" || (gift.expiresAt && gift.expiresAt <= new Date())) throw new Error("Gift not found");
      if (!Number.isSafeInteger(gift.coinAmount) || gift.coinAmount < 0 || !Number.isSafeInteger(gift.itemQuantity) || gift.itemQuantity < 1) throw new Error("Gift contains invalid value");
      if (gift.itemType != null && gift.itemType !== "shop_item" && gift.itemType !== "decor") throw new Error("Gift contains invalid item type");
      await lockUsers(tx, [receiverId]);

      if (gift.coinAmount > 0) await tx.update(users).set({ coins: sql`${users.coins} + ${gift.coinAmount}` }).where(eq(users.id, receiverId));
      if (gift.itemType === "shop_item" && gift.shopItemId) {
        const [catalog] = await tx.select({ id: shopItems.id }).from(shopItems).where(eq(shopItems.id, gift.shopItemId)).for("share");
        if (!catalog) throw new Error("Item data not found");
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${receiverId}), hashtext(${gift.shopItemId}))`);
        const rows = await tx.select().from(userInventory)
          .where(and(eq(userInventory.userId, receiverId), eq(userInventory.shopItemId, gift.shopItemId)))
          .orderBy(userInventory.id).for("update");
        if (rows[0]) await tx.update(userInventory).set({ quantity: sql`${userInventory.quantity} + ${gift.itemQuantity}` }).where(eq(userInventory.id, rows[0].id));
        else await tx.insert(userInventory).values({ userId: receiverId, shopItemId: gift.shopItemId, quantity: gift.itemQuantity });
      }
      if (gift.itemType === "decor" && gift.decorItemId) {
        const [catalog] = await tx.select({ id: homeDecorItems.id }).from(homeDecorItems).where(eq(homeDecorItems.id, gift.decorItemId)).for("share");
        if (!catalog) throw new Error("Decor item not found");
        await grantDecor(tx, receiverId, gift.decorItemId, gift.itemQuantity);
      }

      const [accepted] = await tx.update(gifts).set({ status: "accepted" })
        .where(and(eq(gifts.id, gift.id), eq(gifts.receiverId, receiverId), eq(gifts.status, "pending"),
          gift.expiresAt ? gt(gifts.expiresAt, new Date()) : sql`true`)).returning();
      if (!accepted) throw new Error("Gift not found");
      return accepted;
    });
  },
};
