import {
  type User, type InsertUser, users,
  type ShopItem, type InsertShopItem, shopItems,
  type UserInventoryItem, userInventory,
  type RewardBundle, rewardBundles,
  type RewardBundleItem, rewardBundleItems,
  type UserReward, userRewards,
  type CoinPurchase, coinPurchases,
  type WorldLocation, worldLocations,
  type World, worlds,
  type WorldBuilding, worldBuildings,
  gameSettings,
  type LocationObject, locationObjects,
  type PetTemplate, petTemplates,
  type PetTemplatePart, petTemplateParts,
  type SupportMessage, type InsertSupportMessage, supportMessages,
  type LocationEnemy, locationEnemies,
  type EnemyDrop, enemyDrops,
  type Badge, type UserBadge, badges, userBadges,
  type PlayerMarketListing, playerMarketListings,
  petEquippedAccessories,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ne, gte, asc, desc, ilike, or } from "drizzle-orm";

export interface EquippedAccessoryDetail {
  id: string;
  slot: number;
  accessoryInventoryId: string;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
}

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
  createRewardBundle(name: string, coinAmount: number, message?: string | null): Promise<RewardBundle>;
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
  flipWorldLocation(id: string): Promise<WorldLocation>;
  deleteWorldLocation(id: string): Promise<void>;
  getAllWorlds(): Promise<World[]>;
  getWorld(id: string): Promise<World | undefined>;
  createWorld(data: { id: string; name: string; iconUrl?: string | null; bgUrl?: string | null; posX: number; posY: number; glowColor: string; isDefault?: boolean }): Promise<World>;
  updateWorldPosition(id: string, posX: number, posY: number): Promise<World>;
  updateWorld(id: string, data: Partial<World>): Promise<World>;
  deleteWorld(id: string): Promise<void>;
  getGameSetting(key: string): Promise<string | null>;
  setGameSetting(key: string, value: string): Promise<void>;
  getLocationObjects(locationId: string): Promise<LocationObject[]>;
  createLocationObject(data: { locationId: string; imageUrl: string; posX?: number; posY?: number; width?: number }): Promise<LocationObject>;
  deleteLocationObject(id: string): Promise<void>;
  getLocationItems(locationId: string): Promise<ShopItem[]>;
  assignItemToLocation(itemId: string, locationId: string): Promise<ShopItem>;
  unassignItemFromLocation(itemId: string): Promise<ShopItem>;
  getDailyItemPurchaseCount(userId: string): Promise<number>;
  updateLocationObject(id: string, data: Partial<{ posX: number; posY: number; width: number }>): Promise<LocationObject>;
  getAllPetTemplates(): Promise<PetTemplate[]>;
  getPetTemplate(id: string): Promise<PetTemplate | undefined>;
  createPetTemplate(name: string): Promise<PetTemplate>;
  updatePetTemplate(id: string, data: Partial<PetTemplate>): Promise<PetTemplate>;
  deletePetTemplate(id: string): Promise<void>;
  getPetTemplateParts(templateId: string): Promise<PetTemplatePart[]>;
  createPetTemplatePart(data: { templateId: string; partType: string; view: string; imageUrl: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number; pivotX?: number; pivotY?: number }): Promise<PetTemplatePart>;
  updatePetTemplatePart(id: string, data: Partial<PetTemplatePart>): Promise<PetTemplatePart>;
  deletePetTemplatePart(id: string): Promise<void>;
  deletePetTemplatePartsByTemplate(templateId: string): Promise<void>;
  createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage>;
  getAllSupportMessages(): Promise<SupportMessage[]>;
  markSupportMessageRead(id: string): Promise<void>;
  deleteSupportMessage(id: string): Promise<void>;
  getLocationEnemies(locationId: string): Promise<LocationEnemy[]>;
  getLocationEnemy(id: string): Promise<LocationEnemy | undefined>;
  createLocationEnemy(data: { locationId: string; name: string; imageUrl?: string | null; isBoss?: boolean; coinReward?: number }): Promise<LocationEnemy>;
  updateLocationEnemy(id: string, data: Partial<{ name: string; imageUrl: string | null; isBoss: boolean; coinReward: number }>): Promise<LocationEnemy>;
  deleteLocationEnemy(id: string): Promise<void>;
  getEnemyDrops(enemyId: string): Promise<EnemyDrop[]>;
  createEnemyDrop(data: { enemyId: string; shopItemId: string; dropRate: number }): Promise<EnemyDrop>;
  deleteEnemyDrop(id: string): Promise<void>;
  getWorldBuildings(worldId: string): Promise<WorldBuilding[]>;
  createWorldBuilding(data: { worldId: string; name: string; imageUrl?: string | null; side?: string; posY?: number; destinationPage?: string | null; destinationLocationId?: string | null }): Promise<WorldBuilding>;
  updateWorldBuilding(id: string, data: Partial<WorldBuilding>): Promise<WorldBuilding>;
  deleteWorldBuilding(id: string): Promise<void>;
  getAllBadges(): Promise<Badge[]>;
  createBadge(name: string, imageUrl: string): Promise<Badge>;
  deleteBadge(id: string): Promise<void>;
  getUserBadges(userId: string): Promise<(UserBadge & { name: string; imageUrl: string })[]>;
  getBadgeRecipients(badgeId: string): Promise<string[]>;
  awardBadge(userId: string, badgeId: string): Promise<UserBadge>;
  revokeBadge(userId: string, badgeId: string): Promise<void>;
  getMarketListings(filters?: { search?: string; itemType?: string; orderAsc?: boolean }): Promise<PlayerMarketListing[]>;
  getMyMarketListings(sellerId: string): Promise<PlayerMarketListing[]>;
  getMarketListing(id: string): Promise<PlayerMarketListing | undefined>;
  createMarketListing(data: { sellerId: string; sellerName: string; inventoryId: string; shopItemId: string; itemName: string; itemImageUrl?: string | null; itemType: string; price: number }): Promise<PlayerMarketListing>;
  buyMarketListing(listingId: string, buyerId: string): Promise<{ listing: PlayerMarketListing; price: number }>;
  collectMarketCoins(listingId: string, sellerId: string): Promise<number>;
  cancelMarketListing(listingId: string, sellerId: string): Promise<void>;
  buyMarketSlot(userId: string): Promise<User>;
  getPetEquippedAccessories(petInventoryId: string): Promise<EquippedAccessoryDetail[]>;
  equipAccessory(petInventoryId: string, accessoryInventoryId: string): Promise<EquippedAccessoryDetail>;
  unequipAccessory(petInventoryId: string, accessoryInventoryId: string): Promise<void>;
  unequipAllPetAccessories(petInventoryId: string): Promise<void>;
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

  async getUserInventoryWithItems(userId: string): Promise<{ inventory: UserInventoryItem; shopItem: ShopItem | null }[]> {
    const rows = await db
      .select()
      .from(userInventory)
      .leftJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
      .where(eq(userInventory.userId, userId));
    return rows.map(r => ({ inventory: r.user_inventory, shopItem: r.shop_items }));
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

  async createRewardBundle(name: string, coinAmount: number, message?: string | null): Promise<RewardBundle> {
    const [bundle] = await db.insert(rewardBundles).values({ name, coinAmount, message: message || null }).returning();
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

  async flipWorldLocation(id: string): Promise<WorldLocation> {
    const [current] = await db.select().from(worldLocations).where(eq(worldLocations.id, id));
    const [loc] = await db.update(worldLocations).set({ flipped: !current.flipped }).where(eq(worldLocations.id, id)).returning();
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

  async getLocationObjects(locationId: string): Promise<LocationObject[]> {
    return db.select().from(locationObjects).where(eq(locationObjects.locationId, locationId)).orderBy(asc(locationObjects.createdAt));
  }

  async createLocationObject(data: { locationId: string; imageUrl: string; posX?: number; posY?: number; width?: number }): Promise<LocationObject> {
    const [obj] = await db.insert(locationObjects).values({
      locationId: data.locationId,
      imageUrl: data.imageUrl,
      posX: data.posX ?? 50,
      posY: data.posY ?? 50,
      width: data.width ?? 80,
    }).returning();
    return obj;
  }

  async deleteLocationObject(id: string): Promise<void> {
    await db.delete(locationObjects).where(eq(locationObjects.id, id));
  }

  async getLocationItems(locationId: string): Promise<ShopItem[]> {
    return db.select().from(shopItems).where(eq(shopItems.locationId, locationId));
  }

  async assignItemToLocation(itemId: string, locationId: string): Promise<ShopItem> {
    const [item] = await db.update(shopItems).set({ locationId }).where(eq(shopItems.id, itemId)).returning();
    return item;
  }

  async unassignItemFromLocation(itemId: string): Promise<ShopItem> {
    const [item] = await db.update(shopItems).set({ locationId: null }).where(eq(shopItems.id, itemId)).returning();
    return item;
  }

  async updateLocationObject(id: string, data: Partial<{ posX: number; posY: number; width: number }>): Promise<LocationObject> {
    const [obj] = await db.update(locationObjects).set(data).where(eq(locationObjects.id, id)).returning();
    return obj;
  }

  async getAllPetTemplates(): Promise<PetTemplate[]> {
    return db.select().from(petTemplates).orderBy(asc(petTemplates.createdAt));
  }

  async getPetTemplate(id: string): Promise<PetTemplate | undefined> {
    const [t] = await db.select().from(petTemplates).where(eq(petTemplates.id, id));
    return t;
  }

  async createPetTemplate(name: string): Promise<PetTemplate> {
    const [t] = await db.insert(petTemplates).values({ name }).returning();
    return t;
  }

  async updatePetTemplate(id: string, data: Partial<PetTemplate>): Promise<PetTemplate> {
    const [t] = await db.update(petTemplates).set(data).where(eq(petTemplates.id, id)).returning();
    return t;
  }

  async deletePetTemplate(id: string): Promise<void> {
    await db.delete(petTemplateParts).where(eq(petTemplateParts.templateId, id));
    await db.delete(petTemplates).where(eq(petTemplates.id, id));
  }

  async getPetTemplateParts(templateId: string): Promise<PetTemplatePart[]> {
    return db.select().from(petTemplateParts).where(eq(petTemplateParts.templateId, templateId));
  }

  async createPetTemplatePart(data: { templateId: string; partType: string; view: string; imageUrl: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number; pivotX?: number; pivotY?: number }): Promise<PetTemplatePart> {
    const [p] = await db.insert(petTemplateParts).values({
      templateId: data.templateId,
      partType: data.partType,
      view: data.view,
      imageUrl: data.imageUrl,
      posX: data.posX ?? 0,
      posY: data.posY ?? 0,
      width: data.width ?? 100,
      height: data.height ?? 100,
      zIndex: data.zIndex ?? 0,
      pivotX: data.pivotX ?? 50,
      pivotY: data.pivotY ?? 50,
    }).returning();
    return p;
  }

  async updatePetTemplatePart(id: string, data: Partial<PetTemplatePart>): Promise<PetTemplatePart> {
    const [p] = await db.update(petTemplateParts).set(data).where(eq(petTemplateParts.id, id)).returning();
    return p;
  }

  async deletePetTemplatePart(id: string): Promise<void> {
    await db.delete(petTemplateParts).where(eq(petTemplateParts.id, id));
  }

  async deletePetTemplatePartsByTemplate(templateId: string): Promise<void> {
    await db.delete(petTemplateParts).where(eq(petTemplateParts.templateId, templateId));
  }

  async getDailyItemPurchaseCount(userId: string): Promise<number> {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = await db.select()
      .from(userInventory)
      .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
      .where(
        and(
          eq(userInventory.userId, userId),
          gte(userInventory.acquiredAt, dayStart),
          ne(shopItems.type, "pet")
        )
      );
    return rows.length;
  }

  async createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage> {
    const [msg] = await db.insert(supportMessages).values(data).returning();
    return msg;
  }

  async getAllSupportMessages(): Promise<SupportMessage[]> {
    return db.select().from(supportMessages).orderBy(desc(supportMessages.createdAt));
  }

  async markSupportMessageRead(id: string): Promise<void> {
    await db.update(supportMessages).set({ isRead: true }).where(eq(supportMessages.id, id));
  }

  async deleteSupportMessage(id: string): Promise<void> {
    await db.delete(supportMessages).where(eq(supportMessages.id, id));
  }

  async getLocationEnemies(locationId: string): Promise<LocationEnemy[]> {
    return db.select().from(locationEnemies).where(eq(locationEnemies.locationId, locationId)).orderBy(asc(locationEnemies.sortOrder));
  }

  async getLocationEnemy(id: string): Promise<LocationEnemy | undefined> {
    const [enemy] = await db.select().from(locationEnemies).where(eq(locationEnemies.id, id));
    return enemy;
  }

  async createLocationEnemy(data: { locationId: string; name: string; imageUrl?: string | null; isBoss?: boolean; coinReward?: number }): Promise<LocationEnemy> {
    const [enemy] = await db.insert(locationEnemies).values({
      locationId: data.locationId,
      name: data.name,
      imageUrl: data.imageUrl || null,
      isBoss: data.isBoss || false,
      coinReward: data.coinReward || 0,
    }).returning();
    return enemy;
  }

  async updateLocationEnemy(id: string, data: Partial<{ name: string; imageUrl: string | null; isBoss: boolean; coinReward: number }>): Promise<LocationEnemy> {
    const [updated] = await db.update(locationEnemies).set(data).where(eq(locationEnemies.id, id)).returning();
    return updated;
  }

  async deleteLocationEnemy(id: string): Promise<void> {
    await db.delete(enemyDrops).where(eq(enemyDrops.enemyId, id));
    await db.delete(locationEnemies).where(eq(locationEnemies.id, id));
  }

  async getEnemyDrops(enemyId: string): Promise<EnemyDrop[]> {
    return db.select().from(enemyDrops).where(eq(enemyDrops.enemyId, enemyId));
  }

  async createEnemyDrop(data: { enemyId: string; shopItemId: string; dropRate: number }): Promise<EnemyDrop> {
    const [drop] = await db.insert(enemyDrops).values(data).returning();
    return drop;
  }

  async deleteEnemyDrop(id: string): Promise<void> {
    await db.delete(enemyDrops).where(eq(enemyDrops.id, id));
  }

  async getWorldBuildings(worldId: string): Promise<WorldBuilding[]> {
    return db.select().from(worldBuildings).where(eq(worldBuildings.worldId, worldId)).orderBy(asc(worldBuildings.posY));
  }

  async createWorldBuilding(data: { worldId: string; name: string; imageUrl?: string | null; side?: string; posY?: number; destinationPage?: string | null; destinationLocationId?: string | null }): Promise<WorldBuilding> {
    const [building] = await db.insert(worldBuildings).values({
      worldId: data.worldId,
      name: data.name,
      imageUrl: data.imageUrl || null,
      side: data.side || "left",
      posY: data.posY ?? 50,
      destinationPage: data.destinationPage || null,
      destinationLocationId: data.destinationLocationId || null,
    }).returning();
    return building;
  }

  async updateWorldBuilding(id: string, data: Partial<WorldBuilding>): Promise<WorldBuilding> {
    const { id: _id, createdAt: _ca, ...updateData } = data as any;
    const [building] = await db.update(worldBuildings).set(updateData).where(eq(worldBuildings.id, id)).returning();
    return building;
  }

  async deleteWorldBuilding(id: string): Promise<void> {
    await db.delete(worldBuildings).where(eq(worldBuildings.id, id));
  }

  async getAllBadges(): Promise<Badge[]> {
    return db.select().from(badges).orderBy(desc(badges.createdAt));
  }

  async createBadge(name: string, imageUrl: string): Promise<Badge> {
    const [badge] = await db.insert(badges).values({ name, imageUrl }).returning();
    return badge;
  }

  async deleteBadge(id: string): Promise<void> {
    await db.delete(userBadges).where(eq(userBadges.badgeId, id));
    await db.delete(badges).where(eq(badges.id, id));
  }

  async getUserBadges(userId: string): Promise<(UserBadge & { name: string; imageUrl: string })[]> {
    const rows = await db
      .select({
        id: userBadges.id,
        userId: userBadges.userId,
        badgeId: userBadges.badgeId,
        awardedAt: userBadges.awardedAt,
        name: badges.name,
        imageUrl: badges.imageUrl,
      })
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.awardedAt));
    return rows;
  }

  async getBadgeRecipients(badgeId: string): Promise<string[]> {
    const rows = await db.select({ userId: userBadges.userId }).from(userBadges).where(eq(userBadges.badgeId, badgeId));
    return rows.map(r => r.userId);
  }

  async awardBadge(userId: string, badgeId: string): Promise<UserBadge> {
    const existing = await db.select().from(userBadges).where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
    if (existing.length > 0) return existing[0];
    const [row] = await db.insert(userBadges).values({ userId, badgeId }).returning();
    return row;
  }

  async revokeBadge(userId: string, badgeId: string): Promise<void> {
    await db.delete(userBadges).where(and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId)));
  }

  async getMarketListings(filters?: { search?: string; itemType?: string; orderAsc?: boolean }): Promise<PlayerMarketListing[]> {
    let query = db.select().from(playerMarketListings).where(eq(playerMarketListings.status, "active")).$dynamic();
    if (filters?.itemType && filters.itemType !== "all") {
      query = query.where(and(eq(playerMarketListings.status, "active"), eq(playerMarketListings.itemType, filters.itemType)));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      const cond = eq(playerMarketListings.status, "active");
      const searchCond = or(ilike(playerMarketListings.itemName, term), ilike(playerMarketListings.sellerName, term));
      if (filters?.itemType && filters.itemType !== "all") {
        query = query.where(and(cond, eq(playerMarketListings.itemType, filters.itemType), searchCond));
      } else {
        query = query.where(and(cond, searchCond));
      }
    }
    return filters?.orderAsc
      ? query.orderBy(asc(playerMarketListings.createdAt))
      : query.orderBy(desc(playerMarketListings.createdAt));
  }

  async getMyMarketListings(sellerId: string): Promise<PlayerMarketListing[]> {
    return db.select().from(playerMarketListings)
      .where(eq(playerMarketListings.sellerId, sellerId))
      .orderBy(asc(playerMarketListings.createdAt));
  }

  async getMarketListing(id: string): Promise<PlayerMarketListing | undefined> {
    const [listing] = await db.select().from(playerMarketListings).where(eq(playerMarketListings.id, id));
    return listing;
  }

  async createMarketListing(data: { sellerId: string; sellerName: string; inventoryId: string; shopItemId: string; itemName: string; itemImageUrl?: string | null; itemType: string; price: number }): Promise<PlayerMarketListing> {
    await db.update(userInventory).set({ isListed: true }).where(eq(userInventory.id, data.inventoryId));
    const [listing] = await db.insert(playerMarketListings).values(data).returning();
    return listing;
  }

  async buyMarketListing(listingId: string, buyerId: string): Promise<{ listing: PlayerMarketListing; price: number }> {
    const [listing] = await db.select().from(playerMarketListings).where(and(eq(playerMarketListings.id, listingId), eq(playerMarketListings.status, "active")));
    if (!listing) throw new Error("Listing not found or not active");
    await db.update(playerMarketListings).set({ status: "sold", buyerId }).where(eq(playerMarketListings.id, listingId));
    await db.update(userInventory).set({ userId: buyerId, isListed: false }).where(eq(userInventory.id, listing.inventoryId));
    return { listing, price: listing.price };
  }

  async collectMarketCoins(listingId: string, sellerId: string): Promise<number> {
    const [listing] = await db.select().from(playerMarketListings).where(and(eq(playerMarketListings.id, listingId), eq(playerMarketListings.sellerId, sellerId), eq(playerMarketListings.status, "sold")));
    if (!listing) throw new Error("Listing not found or coins not ready");
    await db.delete(playerMarketListings).where(eq(playerMarketListings.id, listingId));
    return listing.price;
  }

  async cancelMarketListing(listingId: string, sellerId: string): Promise<void> {
    const [listing] = await db.select().from(playerMarketListings).where(and(eq(playerMarketListings.id, listingId), eq(playerMarketListings.sellerId, sellerId), eq(playerMarketListings.status, "active")));
    if (!listing) throw new Error("Listing not found or already sold");
    await db.update(userInventory).set({ isListed: false }).where(eq(userInventory.id, listing.inventoryId));
    await db.delete(playerMarketListings).where(eq(playerMarketListings.id, listingId));
  }

  async buyMarketSlot(userId: string): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    if ((user.marketExtraSlots ?? 0) >= 25) throw new Error("Maximum slot limit reached");
    if (user.coins < 300) throw new Error("Not enough coins");
    const [updated] = await db.update(users)
      .set({ coins: user.coins - 300, marketExtraSlots: (user.marketExtraSlots ?? 0) + 1 })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async getPetEquippedAccessories(petInventoryId: string): Promise<EquippedAccessoryDetail[]> {
    const rows = await db
      .select()
      .from(petEquippedAccessories)
      .leftJoin(userInventory, eq(petEquippedAccessories.accessoryInventoryId, userInventory.id))
      .leftJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
      .where(eq(petEquippedAccessories.petInventoryId, petInventoryId))
      .orderBy(asc(petEquippedAccessories.slot));
    return rows.map(r => ({
      id: r.pet_equipped_accessories.id,
      slot: r.pet_equipped_accessories.slot,
      accessoryInventoryId: r.pet_equipped_accessories.accessoryInventoryId,
      name: r.shop_items?.name || "Unknown",
      imageUrl: r.shop_items?.imageUrl || null,
      atkBoost: r.shop_items?.atkBoost || null,
      defBoost: r.shop_items?.defBoost || null,
    }));
  }

  async equipAccessory(petInventoryId: string, accessoryInventoryId: string): Promise<EquippedAccessoryDetail> {
    const equipped = await this.getPetEquippedAccessories(petInventoryId);
    if (equipped.length >= 3) throw new Error("All 3 accessory slots are full");
    const alreadyEquipped = equipped.find(e => e.accessoryInventoryId === accessoryInventoryId);
    if (alreadyEquipped) throw new Error("Accessory already equipped");
    const usedSlots = equipped.map(e => e.slot);
    const slot = [0, 1, 2].find(s => !usedSlots.includes(s)) ?? 0;
    const [record] = await db.insert(petEquippedAccessories).values({ petInventoryId, accessoryInventoryId, slot }).returning();
    const [invRow] = await db.select().from(userInventory).where(eq(userInventory.id, accessoryInventoryId));
    const [shopRow] = invRow ? await db.select().from(shopItems).where(eq(shopItems.id, invRow.shopItemId)) : [null];
    return {
      id: record.id,
      slot: record.slot,
      accessoryInventoryId: record.accessoryInventoryId,
      name: shopRow?.name || "Unknown",
      imageUrl: shopRow?.imageUrl || null,
      atkBoost: shopRow?.atkBoost || null,
      defBoost: shopRow?.defBoost || null,
    };
  }

  async unequipAccessory(petInventoryId: string, accessoryInventoryId: string): Promise<void> {
    await db.delete(petEquippedAccessories).where(
      and(
        eq(petEquippedAccessories.petInventoryId, petInventoryId),
        eq(petEquippedAccessories.accessoryInventoryId, accessoryInventoryId),
      )
    );
  }

  async unequipAllPetAccessories(petInventoryId: string): Promise<void> {
    await db.delete(petEquippedAccessories).where(eq(petEquippedAccessories.petInventoryId, petInventoryId));
  }
}

export const storage = new DatabaseStorage();
