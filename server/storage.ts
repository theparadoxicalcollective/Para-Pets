import { type User, type InsertUser, users, type ShopItem, type InsertShopItem, shopItems, type UserInventoryItem, userInventory, type RewardBundle, rewardBundles, type RewardBundleItem, rewardBundleItems, type UserReward, userRewards, coinPurchases, type CoinPurchase, worldLocations, type WorldLocation, worlds, type World, gameSettings } from "@shared/schema";
import { db } from "./db";
import { eq, and, ne, gte, sql, asc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUsername(id: string, username: string): Promise<User>;
  updateProfileImage(id: string, profileImage: string): Promise<User>;
  updateActivePet(id: string, activePetId: string | null): Promise<User>;
  getAllUsers(): Promise<User[]>;
  banUser(id: string): Promise<User>;
  unbanUser(id: string): Promise<User>;
  addCoins(id: string, amount: number): Promise<User>;
  updatePassword(id: string, hashedPassword: string): Promise<User>;
  setPasswordResetToken(id: string, token: string, expires: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(id: string): Promise<void>;
  getShopItemsByWorld(worldId: string): Promise<ShopItem[]>;
  getAllShopItems(): Promise<ShopItem[]>;
  getShopItem(id: string): Promise<ShopItem | undefined>;
  createShopItem(item: InsertShopItem): Promise<ShopItem>;
  updateShopItem(id: string, item: Partial<InsertShopItem>): Promise<ShopItem>;
  deleteShopItem(id: string): Promise<void>;
  getUserInventory(userId: string): Promise<UserInventoryItem[]>;
  addToInventory(userId: string, shopItemId: string): Promise<UserInventoryItem>;
  getInventoryItem(userId: string, shopItemId: string): Promise<UserInventoryItem | undefined>;
  getInventoryItemById(id: string): Promise<UserInventoryItem | undefined>;
  removeFromInventory(id: string): Promise<void>;
  updateInventoryItem(id: string, updates: Partial<UserInventoryItem>): Promise<UserInventoryItem>;
  createRewardBundle(name: string, coinAmount: number): Promise<RewardBundle>;
  addRewardBundleItem(bundleId: string, shopItemId: string): Promise<RewardBundleItem>;
  getRewardBundleItems(bundleId: string): Promise<RewardBundleItem[]>;
  createUserReward(userId: string, bundleId: string): Promise<UserReward>;
  getUnclaimedRewards(userId: string): Promise<UserReward[]>;
  claimReward(rewardId: string): Promise<UserReward | undefined>;
  getRewardBundle(id: string): Promise<RewardBundle | undefined>;
  getAllRewardBundles(): Promise<RewardBundle[]>;
  createCoinPurchase(userId: string, amountUsd: number, coinsReceived: number, stripeSessionId: string): Promise<CoinPurchase>;
  getCoinPurchaseBySessionId(stripeSessionId: string): Promise<CoinPurchase | undefined>;
  getDailyPurchaseTotal(userId: string): Promise<number>;
  getWorldLocations(worldId: string): Promise<WorldLocation[]>;
  createWorldLocation(data: Partial<WorldLocation> & { worldId: string; name: string; type: string }): Promise<WorldLocation>;
  updateWorldLocation(id: string, data: Partial<WorldLocation>): Promise<WorldLocation>;
  deleteWorldLocation(id: string): Promise<void>;
  getAllWorlds(): Promise<World[]>;
  getWorld(id: string): Promise<World | undefined>;
  createWorld(data: { id: string; name: string; iconUrl?: string | null; bgUrl?: string | null; posX: number; posY: number; glowColor: string; isDefault?: boolean }): Promise<World>;
  updateWorldPosition(id: string, posX: number, posY: number): Promise<World>;
  updateWorld(id: string, data: Partial<World>): Promise<World>;
  deleteWorld(id: string): Promise<void>;
  getGameSetting(key: string): Promise<string | null>;
  setGameSetting(key: string, value: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUsername(id: string, username: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ username, lastUsernameChange: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateProfileImage(id: string, profileImage: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ profileImage, lastProfilePicChange: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateActivePet(id: string, activePetId: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ activePetId })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async banUser(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isBanned: true })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async unbanUser(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isBanned: false })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async addCoins(id: string, amount: number): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("User not found");
    const newCoins = Math.max(0, user.coins + amount);
    const [updated] = await db
      .update(users)
      .set({ coins: newCoins })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async updatePassword(id: string, hashedPassword: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setPasswordResetToken(id: string, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({ passwordResetToken: token, passwordResetExpires: expires })
      .where(eq(users.id, id));
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.passwordResetToken, token));
    return user;
  }

  async clearPasswordResetToken(id: string): Promise<void> {
    await db
      .update(users)
      .set({ passwordResetToken: null, passwordResetExpires: null })
      .where(eq(users.id, id));
  }

  async getShopItemsByWorld(worldId: string): Promise<ShopItem[]> {
    return db.select().from(shopItems).where(eq(shopItems.worldId, worldId));
  }

  async getAllShopItems(): Promise<ShopItem[]> {
    return db.select().from(shopItems);
  }

  async getShopItem(id: string): Promise<ShopItem | undefined> {
    const [item] = await db.select().from(shopItems).where(eq(shopItems.id, id));
    return item;
  }

  async createShopItem(item: InsertShopItem): Promise<ShopItem> {
    const [created] = await db.insert(shopItems).values(item).returning();
    return created;
  }

  async updateShopItem(id: string, item: Partial<InsertShopItem>): Promise<ShopItem> {
    const [updated] = await db
      .update(shopItems)
      .set(item)
      .where(eq(shopItems.id, id))
      .returning();
    return updated;
  }

  async deleteShopItem(id: string): Promise<void> {
    await db.delete(shopItems).where(eq(shopItems.id, id));
  }

  async getUserInventory(userId: string): Promise<UserInventoryItem[]> {
    return db.select().from(userInventory).where(eq(userInventory.userId, userId));
  }

  async addToInventory(userId: string, shopItemId: string): Promise<UserInventoryItem> {
    const [item] = await db.insert(userInventory).values({ userId, shopItemId }).returning();
    return item;
  }

  async getInventoryItem(userId: string, shopItemId: string): Promise<UserInventoryItem | undefined> {
    const [item] = await db
      .select()
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, shopItemId)));
    return item;
  }

  async getInventoryItemById(id: string): Promise<UserInventoryItem | undefined> {
    const [item] = await db.select().from(userInventory).where(eq(userInventory.id, id));
    return item;
  }

  async removeFromInventory(id: string): Promise<void> {
    await db.delete(userInventory).where(eq(userInventory.id, id));
  }

  async updateInventoryItem(id: string, updates: Partial<UserInventoryItem>): Promise<UserInventoryItem> {
    const [updated] = await db
      .update(userInventory)
      .set(updates)
      .where(eq(userInventory.id, id))
      .returning();
    return updated;
  }

  async createRewardBundle(name: string, coinAmount: number): Promise<RewardBundle> {
    const [bundle] = await db.insert(rewardBundles).values({ name, coinAmount }).returning();
    return bundle;
  }

  async addRewardBundleItem(bundleId: string, shopItemId: string): Promise<RewardBundleItem> {
    const [item] = await db.insert(rewardBundleItems).values({ bundleId, shopItemId }).returning();
    return item;
  }

  async getRewardBundleItems(bundleId: string): Promise<RewardBundleItem[]> {
    return db.select().from(rewardBundleItems).where(eq(rewardBundleItems.bundleId, bundleId));
  }

  async createUserReward(userId: string, bundleId: string): Promise<UserReward> {
    const [reward] = await db.insert(userRewards).values({ userId, bundleId }).returning();
    return reward;
  }

  async getUnclaimedRewards(userId: string): Promise<UserReward[]> {
    return db.select().from(userRewards).where(and(eq(userRewards.userId, userId), eq(userRewards.claimed, false)));
  }

  async claimReward(rewardId: string): Promise<UserReward | undefined> {
    const [reward] = await db.update(userRewards).set({ claimed: true }).where(and(eq(userRewards.id, rewardId), eq(userRewards.claimed, false))).returning();
    return reward;
  }

  async getRewardBundle(id: string): Promise<RewardBundle | undefined> {
    const [bundle] = await db.select().from(rewardBundles).where(eq(rewardBundles.id, id));
    return bundle;
  }

  async getAllRewardBundles(): Promise<RewardBundle[]> {
    return db.select().from(rewardBundles);
  }

  async createCoinPurchase(userId: string, amountUsd: number, coinsReceived: number, stripeSessionId: string): Promise<CoinPurchase> {
    const [purchase] = await db.insert(coinPurchases).values({ userId, amountUsd, coinsReceived, stripeSessionId }).returning();
    return purchase;
  }

  async getCoinPurchaseBySessionId(stripeSessionId: string): Promise<CoinPurchase | undefined> {
    const [purchase] = await db.select().from(coinPurchases).where(eq(coinPurchases.stripeSessionId, stripeSessionId));
    return purchase;
  }

  async getDailyPurchaseTotal(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const purchases = await db.select().from(coinPurchases).where(
      and(eq(coinPurchases.userId, userId), gte(coinPurchases.createdAt, today))
    );
    return purchases.reduce((sum, p) => sum + p.amountUsd, 0);
  }

  async getWorldLocations(worldId: string): Promise<WorldLocation[]> {
    return db.select().from(worldLocations).where(eq(worldLocations.worldId, worldId)).orderBy(asc(worldLocations.sortOrder));
  }

  async createWorldLocation(data: Partial<WorldLocation> & { worldId: string; name: string; type: string }): Promise<WorldLocation> {
    const [loc] = await db.insert(worldLocations).values(data).returning();
    return loc;
  }

  async updateWorldLocation(id: string, data: Partial<WorldLocation>): Promise<WorldLocation> {
    const [loc] = await db.update(worldLocations).set(data).where(eq(worldLocations.id, id)).returning();
    return loc;
  }

  async deleteWorldLocation(id: string): Promise<void> {
    await db.delete(worldLocations).where(eq(worldLocations.id, id));
  }

  async getAllWorlds(): Promise<World[]> {
    return db.select().from(worlds);
  }

  async getWorld(id: string): Promise<World | undefined> {
    const [w] = await db.select().from(worlds).where(eq(worlds.id, id));
    return w;
  }

  async createWorld(data: { id: string; name: string; iconUrl?: string | null; bgUrl?: string | null; posX: number; posY: number; glowColor: string; isDefault?: boolean }): Promise<World> {
    const [w] = await db.insert(worlds).values({
      id: data.id,
      name: data.name,
      iconUrl: data.iconUrl || null,
      bgUrl: data.bgUrl || null,
      posX: data.posX,
      posY: data.posY,
      glowColor: data.glowColor,
      isDefault: data.isDefault || false,
    }).returning();
    return w;
  }

  async updateWorldPosition(id: string, posX: number, posY: number): Promise<World> {
    const [w] = await db.update(worlds).set({ posX, posY }).where(eq(worlds.id, id)).returning();
    return w;
  }

  async updateWorld(id: string, data: Partial<World>): Promise<World> {
    const [w] = await db.update(worlds).set(data).where(eq(worlds.id, id)).returning();
    return w;
  }

  async deleteWorld(id: string): Promise<void> {
    await db.delete(worlds).where(eq(worlds.id, id));
  }

  async getGameSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(gameSettings).where(eq(gameSettings.key, key));
    return row?.value ?? null;
  }

  async setGameSetting(key: string, value: string): Promise<void> {
    await db.insert(gameSettings).values({ key, value }).onConflictDoUpdate({ target: gameSettings.key, set: { value } });
  }
}

export const storage = new DatabaseStorage();
