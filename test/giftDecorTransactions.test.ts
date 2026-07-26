import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { executeAcceptGift, executeSendGift, giftCoinCreditUpdate, type GiftTransactionOperations, type SendGiftInput } from "../server/gifts/transactions";
import { executeDecorPlacement, executeDecorRemoval, type DecorTransactionOperations } from "../server/housing/decorTransactions";

type FakeGift = any;
class GiftFake implements GiftTransactionOperations {
  coins = new Map([["sender", 100], ["receiver", 0], ["other", 0]]);
  totalCoinsEarned = new Map([["sender", 100], ["receiver", 0], ["other", 0]]);
  inventory = new Map<string, number>();
  decor = new Map<string, number>();
  gifts = new Map<string, FakeGift>();
  failAfterDeduction = false;
  failAfterUserUpdate = false;
  private queue = Promise.resolve();

  private atomic<T>(work: () => T | Promise<T>): Promise<T> {
    const run = async () => {
      const snapshot = structuredClone({ coins: this.coins, totalCoinsEarned: this.totalCoinsEarned, inventory: this.inventory, decor: this.decor, gifts: this.gifts });
      try { return await work(); } catch (error) {
        this.coins = snapshot.coins; this.totalCoinsEarned = snapshot.totalCoinsEarned; this.inventory = snapshot.inventory; this.decor = snapshot.decor; this.gifts = snapshot.gifts;
        throw error;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  send(input: SendGiftInput): Promise<FakeGift> {
    return this.atomic(() => {
      const quantity = input.itemQuantity ?? 1;
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error("itemQuantity must be >= 1");
      const balance = this.coins.get(input.senderId);
      if (balance == null || balance < input.coinAmount) throw new Error("Insufficient coins");
      this.coins.set(input.senderId, balance - input.coinAmount);
      if (input.itemType === "shop_item") {
        const key = `${input.senderId}:${input.shopItemInventoryId}`;
        const owned = this.inventory.get(key) ?? 0;
        if (owned < quantity) throw new Error(owned ? "Not enough in inventory" : "Item not found in inventory");
        this.inventory.set(key, owned - quantity);
      }
      if (input.itemType === "decor") {
        const key = `${input.senderId}:${input.decorItemId}`;
        const owned = this.decor.get(key) ?? 0;
        if (owned < quantity) throw new Error("Not enough in inventory");
        this.decor.set(key, owned - quantity);
      }
      if (this.failAfterDeduction) throw new Error("insert failed");
      const gift = { id: `gift-${this.gifts.size + 1}`, ...input, itemQuantity: quantity, status: "pending", expiresAt: new Date(Date.now() + 60_000) };
      this.gifts.set(gift.id, gift);
      return gift;
    });
  }

  accept(giftId: string, receiverId: string): Promise<FakeGift> {
    return this.atomic(async () => {
      const gift = this.gifts.get(giftId);
      if (!gift || gift.receiverId !== receiverId || gift.expiresAt <= new Date()) throw new Error("Gift not found");
      if (gift.status === "accepted") return gift;
      await new Promise(resolve => setTimeout(resolve, 2));
      if (gift.coinAmount > 0) {
        this.coins.set(receiverId, (this.coins.get(receiverId) ?? 0) + gift.coinAmount);
        this.totalCoinsEarned.set(receiverId, (this.totalCoinsEarned.get(receiverId) ?? 0) + gift.coinAmount);
      }
      if (this.failAfterUserUpdate) throw new Error("grant failed");
      if (gift.itemType === "shop_item") this.inventory.set(`${receiverId}:${gift.shopItemId}`, (this.inventory.get(`${receiverId}:${gift.shopItemId}`) ?? 0) + gift.itemQuantity);
      if (gift.itemType === "decor") this.decor.set(`${receiverId}:${gift.decorItemId}`, (this.decor.get(`${receiverId}:${gift.decorItemId}`) ?? 0) + gift.itemQuantity);
      gift.status = "accepted";
      return gift;
    });
  }
}

const baseGift = (overrides: Partial<SendGiftInput> = {}): SendGiftInput => ({ senderId: "sender", receiverId: "receiver", coinAmount: 0, ...overrides });

test("coin, item, and decoration gift creation transfer exactly the requested value", async () => {
  const fake = new GiftFake();
  fake.inventory.set("sender:slot", 4); fake.decor.set("sender:chair", 3);
  await executeSendGift(baseGift({ coinAmount: 25 }), fake);
  await executeSendGift(baseGift({ itemType: "shop_item", shopItemInventoryId: "slot", shopItemId: "potion", itemQuantity: 3 }), fake);
  await executeSendGift(baseGift({ itemType: "decor", decorItemId: "chair", itemQuantity: 2 }), fake);
  assert.equal(fake.coins.get("sender"), 75);
  assert.equal(fake.inventory.get("sender:slot"), 1);
  assert.equal(fake.decor.get("sender:chair"), 1);
  assert.equal(fake.gifts.size, 3);
});

test("gift creation rejects insufficient balances, missing ownership, and excessive quantities", async () => {
  const fake = new GiftFake(); fake.inventory.set("sender:slot", 1);
  await assert.rejects(executeSendGift(baseGift({ coinAmount: 101 }), fake), /Insufficient coins/);
  await assert.rejects(executeSendGift(baseGift({ itemType: "shop_item", shopItemInventoryId: "missing", itemQuantity: 1 }), fake), /not found/);
  await assert.rejects(executeSendGift(baseGift({ itemType: "shop_item", shopItemInventoryId: "slot", itemQuantity: 2 }), fake), /Not enough/);
  assert.equal(fake.coins.get("sender"), 100); assert.equal(fake.inventory.get("sender:slot"), 1);
});

test("a failure after gift deduction rolls the complete operation back", async () => {
  const fake = new GiftFake(); fake.inventory.set("sender:slot", 2); fake.failAfterDeduction = true;
  await assert.rejects(executeSendGift(baseGift({ coinAmount: 20, itemType: "shop_item", shopItemInventoryId: "slot" }), fake), /insert failed/);
  assert.equal(fake.coins.get("sender"), 100); assert.equal(fake.inventory.get("sender:slot"), 2); assert.equal(fake.gifts.size, 0);
});

test("gift acceptance succeeds once and retries without duplicating value", async () => {
  const fake = new GiftFake();
  const gift = await executeSendGift(baseGift({ coinAmount: 20 }), fake);
  await executeAcceptGift(gift.id, "receiver", fake); await executeAcceptGift(gift.id, "receiver", fake);
  assert.equal(fake.coins.get("receiver"), 20); assert.equal(fake.totalCoinsEarned.get("receiver"), 20); assert.equal(fake.gifts.get(gift.id).status, "accepted");
});

test("two concurrent acceptance attempts credit both coin fields only once", async () => {
  const fake = new GiftFake();
  const gift = await executeSendGift(baseGift({ coinAmount: 20 }), fake);
  await Promise.all([executeAcceptGift(gift.id, "receiver", fake), executeAcceptGift(gift.id, "receiver", fake)]);
  assert.equal(fake.coins.get("receiver"), 20);
  assert.equal(fake.totalCoinsEarned.get("receiver"), 20);
});

test("a failure after the receiver update rolls both coin fields back", async () => {
  const fake = new GiftFake();
  const gift = await executeSendGift(baseGift({ coinAmount: 20 }), fake);
  fake.failAfterUserUpdate = true;
  await assert.rejects(executeAcceptGift(gift.id, "receiver", fake), /grant failed/);
  assert.equal(fake.coins.get("receiver"), 0);
  assert.equal(fake.totalCoinsEarned.get("receiver"), 0);
  assert.equal(fake.gifts.get(gift.id).status, "pending");
});

test("item-only and decoration-only gifts do not change lifetime coin earnings", async () => {
  const fake = new GiftFake(); fake.inventory.set("sender:slot", 1); fake.decor.set("sender:chair", 1);
  const item = await executeSendGift(baseGift({ itemType: "shop_item", shopItemInventoryId: "slot", shopItemId: "potion" }), fake);
  const decor = await executeSendGift(baseGift({ itemType: "decor", decorItemId: "chair" }), fake);
  await executeAcceptGift(item.id, "receiver", fake); await executeAcceptGift(decor.id, "receiver", fake);
  assert.equal(fake.totalCoinsEarned.get("receiver"), 0);
});

test("a combined coin-and-item gift credits the gifted coins once", async () => {
  const fake = new GiftFake(); fake.inventory.set("sender:slot", 1);
  const gift = await executeSendGift(baseGift({ coinAmount: 25, itemType: "shop_item", shopItemInventoryId: "slot", shopItemId: "potion" }), fake);
  await executeAcceptGift(gift.id, "receiver", fake); await executeAcceptGift(gift.id, "receiver", fake);
  assert.equal(fake.coins.get("receiver"), 25);
  assert.equal(fake.totalCoinsEarned.get("receiver"), 25);
  assert.equal(fake.inventory.get("receiver:potion"), 1);
});

test("the production gift credit uses atomic expressions for both user coin fields", () => {
  const dialect = new PgDialect();
  const update = giftCoinCreditUpdate(25);
  const coins = dialect.sqlToQuery(update.coins);
  const lifetime = dialect.sqlToQuery(update.totalCoinsEarned);
  assert.match(coins.sql, /"users"\."coins" \+ \$1/); assert.deepEqual(coins.params, [25]);
  assert.match(lifetime.sql, /"users"\."total_coins_earned" \+ \$1/); assert.deepEqual(lifetime.params, [25]);
});

test("expired gifts and gifts owned by a different receiver cannot be accepted", async () => {
  const fake = new GiftFake(); const gift = await executeSendGift(baseGift({ coinAmount: 5 }), fake);
  await assert.rejects(executeAcceptGift(gift.id, "other", fake), /Gift not found/);
  fake.gifts.get(gift.id).expiresAt = new Date(0);
  await assert.rejects(executeAcceptGift(gift.id, "receiver", fake), /Gift not found/);
  assert.equal(fake.coins.get("receiver"), 0);
});

class DecorFake implements DecorTransactionOperations {
  inventory = new Map<string, number>(); placements = new Map<string, any>(); failPlacement = false; failReturn = false;
  async place(userId: string, decorItemId: string, data: any): Promise<any> {
    const snapshot = structuredClone({ inventory: this.inventory, placements: this.placements });
    try { const key = `${userId}:${decorItemId}`; const qty = this.inventory.get(key) ?? 0; if (qty < 1) throw new Error("Not enough in inventory"); this.inventory.set(key, qty - 1); if (this.failPlacement) throw new Error("placement failed"); const row = { id: `placed-${this.placements.size + 1}`, userId, decorItemId, ...data }; this.placements.set(row.id, row); return row; }
    catch (error) { this.inventory = snapshot.inventory; this.placements = snapshot.placements; throw error; }
  }
  async remove(userId: string, placementId: string): Promise<{ decorItemId: string }> {
    const snapshot = structuredClone({ inventory: this.inventory, placements: this.placements });
    try { const row = this.placements.get(placementId); if (!row || row.userId !== userId) throw new Error("Placed decor not found"); this.placements.delete(placementId); if (this.failReturn) throw new Error("inventory failed"); const key = `${userId}:${row.decorItemId}`; this.inventory.set(key, (this.inventory.get(key) ?? 0) + 1); return { decorItemId: row.decorItemId }; }
    catch (error) { this.inventory = snapshot.inventory; this.placements = snapshot.placements; throw error; }
  }
}

test("decoration placement deducts inventory and creates placement atomically", async () => {
  const fake = new DecorFake(); fake.inventory.set("owner:chair", 1);
  const row = await executeDecorPlacement("owner", "chair", { xPct: .5, yPct: .5, size: 250, flipped: false }, fake);
  assert.equal(fake.inventory.get("owner:chair"), 0); assert.equal(fake.placements.get(row.id).decorItemId, "chair");
});

test("failed decoration placement preserves inventory", async () => {
  const fake = new DecorFake(); fake.inventory.set("owner:chair", 1); fake.failPlacement = true;
  await assert.rejects(executeDecorPlacement("owner", "chair", { xPct: .5, yPct: .5, size: 250, flipped: false }, fake));
  assert.equal(fake.inventory.get("owner:chair"), 1); assert.equal(fake.placements.size, 0);
});

test("decoration removal returns inventory once and rolls back a failed return", async () => {
  const fake = new DecorFake(); fake.placements.set("placed", { id: "placed", userId: "owner", decorItemId: "chair" }); fake.failReturn = true;
  await assert.rejects(executeDecorRemoval("owner", "placed", fake)); assert.ok(fake.placements.has("placed"));
  fake.failReturn = false; await executeDecorRemoval("owner", "placed", fake);
  await assert.rejects(executeDecorRemoval("owner", "placed", fake), /not found/);
  assert.equal(fake.inventory.get("owner:chair"), 1);
});

test("a player cannot modify another player's placed decoration", async () => {
  const fake = new DecorFake(); fake.placements.set("placed", { id: "placed", userId: "owner", decorItemId: "chair" });
  await assert.rejects(executeDecorRemoval("intruder", "placed", fake), /not found/);
  assert.ok(fake.placements.has("placed")); assert.equal(fake.inventory.get("intruder:chair"), undefined);
});
