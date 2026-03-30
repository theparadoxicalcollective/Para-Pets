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
  gameSettings,
  type LocationObject, locationObjects,
  type PetTemplate, petTemplates,
  type PetTemplatePart, petTemplateParts,
  type SupportMessage, type InsertSupportMessage, supportMessages,
  type LocationEnemy, locationEnemies,
  type EnemyDrop, enemyDrops,
  type Badge, type UserBadge, badges, userBadges, badgeRewardClaims,
  type KeepersCentralEnemy, keepersCentralEnemies,
  type KcDoor, kcDoors,
  type KcDoorDecorPlacement, kcDoorDecorPlacements,
  type PlayerMarketListing, playerMarketListings,
  petEquippedAccessories,
  type FishTemplatePart, fishTemplateParts,
  type PondFish, pondFish,
  type PlayerFishInventory, playerFishInventory,
  playerFishCatchLog,
  type PlayerFishingEquipment, playerFishingEquipment,
  type WorldDecorItem, worldDecorItems,
  type WorldDecorPlacement, worldDecorPlacements,
  type FishBarrel, fishBarrels,
  pvpBattles,
  pvpBattleGroups,
  type Friendship, friendships,
  type Notification, notifications,
  worldPetPositions,
  petHousePositions,
  type Enemy, type EnemyPart, enemies, enemyParts,
  type InsertEnemy,
  type HouseBundle, houseBundles,
  type HouseBundleBuilding, houseBundleBuildings,
  type HomeDecorItem, homeDecorItems,
  type UserHouseBundle, userHouseBundles,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ne, gte, asc, desc, ilike, or, sql, inArray } from "drizzle-orm";

export interface EquippedAccessoryDetail {
  id: string;
  slot: number;
  accessoryInventoryId: string;
  name: string;
  imageUrl: string | null;
  atkBoost: number | null;
  defBoost: number | null;
  healthBoost: number | null;
}

const LEADERBOARD_EXCLUDED_USERNAMES = new Set(["paradox"]);

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameCaseInsensitive(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUsername(id: string, username: string): Promise<User>;
  updateProfileImage(id: string, profileImage: string): Promise<User>;
  updateActivePet(id: string, activePetId: string | null): Promise<User>;
  getAllUsers(): Promise<User[]>;
  banUser(id: string): Promise<User>;
  unbanUser(id: string): Promise<User>;
  addCoins(id: string, amount: number): Promise<User>;
  setWelcomeV2Sent(id: string): Promise<void>;
  updatePassword(id: string, hashedPassword: string): Promise<User>;
  deleteAccount(id: string): Promise<void>;
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
  addToInventory(userId: string, shopItemId: string, extraFields?: Partial<UserInventoryItem>, stackQty?: number): Promise<UserInventoryItem>;
  decrementBaitQuantity(inventoryId: string): Promise<{ depleted: boolean; item: UserInventoryItem | undefined }>;
  getInventoryItem(userId: string, shopItemId: string): Promise<UserInventoryItem | undefined>;
  countInventoryPetCopies(userId: string, shopItemId: string): Promise<number>;
  getInventoryItemById(id: string): Promise<UserInventoryItem | undefined>;
  removeFromInventory(id: string): Promise<void>;
  updateInventoryItem(id: string, updates: Partial<UserInventoryItem>): Promise<UserInventoryItem>;
  decrementPoleUses(inventoryId: string): Promise<UserInventoryItem | undefined>;
  createRewardBundle(name: string, coinAmount: number, message?: string | null): Promise<RewardBundle>;
  addRewardBundleItem(bundleId: string, shopItemId: string): Promise<RewardBundleItem>;
  getRewardBundleItems(bundleId: string): Promise<RewardBundleItem[]>;
  createUserReward(userId: string, bundleId: string): Promise<UserReward>;
  getUserReward(id: string): Promise<UserReward | undefined>;
  getUnclaimedRewards(userId: string): Promise<UserReward[]>;
  claimReward(rewardId: string): Promise<UserReward | undefined>;
  getRewardBundle(id: string): Promise<RewardBundle | undefined>;
  getAllRewardBundles(): Promise<RewardBundle[]>;
  createCoinPurchase(userId: string, amountUsd: number, coinsReceived: number, stripeSessionId: string): Promise<CoinPurchase>;
  getCoinPurchaseBySessionId(stripeSessionId: string): Promise<CoinPurchase | undefined>;
  getDailyPurchaseTotal(userId: string): Promise<number>;
  getWorldLocations(worldId: string): Promise<WorldLocation[]>;
  getWorldLocation(id: string): Promise<WorldLocation | undefined>;
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
  updateShopItemPosition(itemId: string, posX: number, posY: number, width: number): Promise<ShopItem>;
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
  getAllBadges(): Promise<Badge[]>;
  createBadge(name: string, imageUrl: string, dailyRewardCoins?: number | null, badgePoints?: number): Promise<Badge>;
  deleteBadge(id: string): Promise<void>;
  updateBadgeDailyReward(id: string, dailyRewardCoins: number | null): Promise<void>;
  updateBadge(id: string, data: { dailyRewardCoins?: number | null; badgePoints?: number; name?: string; imageUrl?: string }): Promise<void>;
  getUserBadges(userId: string): Promise<(UserBadge & { name: string; imageUrl: string; dailyRewardCoins: number | null; badgePoints: number; lastClaimedAt: Date | null })[]>;
  getBadgeRecipients(badgeId: string): Promise<string[]>;
  awardBadge(userId: string, badgeId: string): Promise<UserBadge>;
  revokeBadge(userId: string, badgeId: string): Promise<void>;
  getBadgeRewardClaim(userId: string, badgeId: string): Promise<{ lastClaimedAt: Date } | null>;
  upsertBadgeRewardClaim(userId: string, badgeId: string): Promise<void>;
  getBadgeLeaderboard(limit?: number): Promise<{ userId: string; username: string; profileImage: string | null; totalPoints: number; topBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[]; allBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[] }[]>;
  getKeepersCentralEnemies(): Promise<(KeepersCentralEnemy & { enemyName: string; enemyImageUrl: string | null })[]>;
  addKeepersCentralEnemy(enemyId: string, spawnX: number, spawnY: number): Promise<KeepersCentralEnemy>;
  removeKeepersCentralEnemy(id: string): Promise<void>;
  getKcDoors(worldId: string): Promise<KcDoor[]>;
  createKcDoor(data: { worldId: string; name: string; posX: number; posY: number; triggerRadius: number; bgUrl?: string | null }): Promise<KcDoor>;
  updateKcDoor(id: string, data: { name?: string; posX?: number; posY?: number; triggerRadius?: number; bgUrl?: string | null }): Promise<KcDoor>;
  deleteKcDoor(id: string): Promise<void>;
  getKcDoorDecorPlacements(doorId: string): Promise<KcDoorDecorPlacement[]>;
  createKcDoorDecorPlacement(data: { doorId: string; name: string; imageUrl: string; posX: number; posY: number; size?: number }): Promise<KcDoorDecorPlacement>;
  updateKcDoorDecorPlacement(id: string, data: { posX?: number; posY?: number; size?: number; flipped?: boolean }): Promise<KcDoorDecorPlacement>;
  deleteKcDoorDecorPlacement(id: string): Promise<void>;
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
  getFishTemplateParts(fishItemId: string): Promise<FishTemplatePart[]>;
  createFishTemplatePart(data: { fishItemId: string; partType: string; imageUrl: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number }): Promise<FishTemplatePart>;
  updateFishTemplatePart(id: string, data: Partial<FishTemplatePart>): Promise<FishTemplatePart>;
  deleteFishTemplatePart(id: string): Promise<void>;
  getPondFish(locationId: string): Promise<(PondFish & { item: ShopItem | null })[]>;
  addFishToPond(locationId: string, shopItemId: string): Promise<PondFish>;
  removeFishFromPond(locationId: string, shopItemId: string): Promise<void>;
  getPlayerFishInventory(userId: string): Promise<(PlayerFishInventory & { item: ShopItem | null })[]>;
  addFishToPlayerInventory(userId: string, shopItemId: string): Promise<PlayerFishInventory>;
  logFishCatch(userId: string, shopItemId: string): Promise<void>;
  getPlayerCaughtFishLog(userId: string): Promise<{ shopItemId: string; rewardClaimed: boolean }[]>;
  claimFishCatchReward(userId: string, shopItemId: string): Promise<boolean>;
  syncAquariumFish(userId: string, counts: { shopItemId: string; count: number }[]): Promise<void>;
  addFishToAquarium(userId: string, shopItemId: string): Promise<string | null>;
  removeFishFromAquarium(userId: string, shopItemId: string): Promise<boolean>;
  getPlayerFishingEquipment(userId: string): Promise<PlayerFishingEquipment | null>;
  upsertPlayerFishingEquipment(userId: string, data: { poleInventoryId?: string | null; baitInventoryId?: string | null }): Promise<PlayerFishingEquipment>;
  getWorldDecorItems(worldId: string): Promise<WorldDecorItem[]>;
  createWorldDecorItem(data: { worldId: string; name: string; imageUrl: string }): Promise<WorldDecorItem>;
  updateWorldDecorItem(id: string, data: { name?: string; imageUrl?: string; message?: string | null }): Promise<void>;
  deleteWorldDecorItem(id: string): Promise<void>;
  getWorldDecorPlacements(worldId: string): Promise<WorldDecorPlacement[]>;
  createWorldDecorPlacement(data: { worldId: string; decorItemId: string; name: string; imageUrl: string; posX: number; posY: number; message?: string | null }): Promise<WorldDecorPlacement>;
  updateWorldDecorPlacement(id: string, data: { posX?: number; posY?: number; size?: number; flipped?: boolean; message?: string | null }): Promise<WorldDecorPlacement>;
  deleteWorldDecorPlacement(id: string): Promise<void>;
  getFishBarrelByWorld(worldId: string): Promise<FishBarrel | undefined>;
  createFishBarrel(worldId: string): Promise<FishBarrel>;
  updateFishBarrel(id: string, data: Partial<FishBarrel>): Promise<FishBarrel>;
  deleteFishBarrel(id: string): Promise<void>;
  deleteFishInventoryItems(fishIds: string[]): Promise<void>;
  // PvP
  createPvpBattle(data: { userId: string; opponentName: string; opponentImageUrl?: string | null; opponentLevel: number; opponentSkill?: string | null; result: string; coinsEarned: number; battlePointsDelta?: number }): Promise<any>;
  getPvpBattlesByUser(userId: string, limit?: number): Promise<any[]>;
  getPvpLeaderboard(limit?: number): Promise<{ userId: string; username: string; profileImage: string | null; battlePoints: number; wins: number; losses: number }[]>;
  getBattleGroup(userId: string): Promise<any | null>;
  upsertBattleGroup(userId: string, petInventoryIds: string[]): Promise<any>;
  getAllBattleGroupsWithUsers(): Promise<any[]>;
  // Enemy Database
  getAllEnemies(): Promise<Enemy[]>;
  createEnemy(data: InsertEnemy): Promise<Enemy>;
  updateEnemy(id: string, data: Partial<InsertEnemy>): Promise<Enemy>;
  deleteEnemy(id: string): Promise<void>;
  getEnemyParts(enemyId: string): Promise<EnemyPart[]>;
  createEnemyPart(data: { enemyId: string; partType: string; imageUrl: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number }): Promise<EnemyPart>;
  updateEnemyPart(id: string, data: Partial<EnemyPart>): Promise<EnemyPart>;
  deleteEnemyPart(id: string): Promise<void>;
  getUserHouseBundles(userId: string): Promise<(UserHouseBundle & { bundle: HouseBundle })[]>;
  hasUserHouseBundle(userId: string, bundleId: string): Promise<boolean>;
  grantUserHouseBundle(userId: string, bundleId: string): Promise<UserHouseBundle>;
  setActiveHouseBundle(userId: string, bundleId: string | null): Promise<void>;
  getActiveBundleWithBuildings(userId: string): Promise<(HouseBundle & { buildings: HouseBundleBuilding[] }) | null>;
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

  async getUserByUsernameCaseInsensitive(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.email, email));
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
    const [updated] = await db
      .update(users)
      .set({ coins: sql`GREATEST(0, ${users.coins} + ${amount})` })
      .where(eq(users.id, id))
      .returning();
    if (!updated) throw new Error("User not found");
    return updated;
  }

  async setWelcomeV2Sent(id: string): Promise<void> {
    await db.update(users).set({ welcomeV2Sent: true }).where(eq(users.id, id));
  }

  async updatePassword(id: string, hashedPassword: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async deleteAccount(id: string): Promise<void> {
    await db.delete(playerMarketListings).where(eq(playerMarketListings.sellerId, id));
    await db.delete(playerFishInventory).where(eq(playerFishInventory.userId, id));
    await db.delete(playerFishCatchLog).where(eq(playerFishCatchLog.userId, id));
    await db.delete(playerFishingEquipment).where(eq(playerFishingEquipment.userId, id));
    // petEquippedAccessories links petInventoryId → accessoryInventoryId (no userId), cleaned up via userInventory below
    const userInvIds = await db.select({ id: userInventory.id }).from(userInventory).where(eq(userInventory.userId, id));
    if (userInvIds.length > 0) {
      await db.delete(petEquippedAccessories).where(inArray(petEquippedAccessories.petInventoryId, userInvIds.map(r => r.id)));
    }
    await db.delete(badgeRewardClaims).where(eq(badgeRewardClaims.userId, id));
    await db.delete(userBadges).where(eq(userBadges.userId, id));
    await db.delete(coinPurchases).where(eq(coinPurchases.userId, id));
    await db.delete(userRewards).where(eq(userRewards.userId, id));
    await db.delete(pvpBattles).where(eq(pvpBattles.userId, id));
    await db.delete(pvpBattleGroups).where(eq(pvpBattleGroups.userId, id));
    await db.delete(worldPetPositions).where(eq(worldPetPositions.ownerUserId, id));
    await db.delete(friendships).where(or(eq(friendships.requesterId, id), eq(friendships.receiverId, id)));
    await db.delete(userInventory).where(eq(userInventory.userId, id));
    await db.delete(users).where(eq(users.id, id));
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
    return db.select().from(shopItems).where(
      or(eq(shopItems.worldId, worldId), eq(shopItems.worldId, "all"))
    );
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

  async addToInventory(userId: string, shopItemId: string, extraFields?: Partial<UserInventoryItem>, stackQty?: number): Promise<UserInventoryItem> {
    if (stackQty && stackQty > 0) {
      // Stacking mode: find existing row for this user+item and increment quantity
      const existing = await this.getInventoryItem(userId, shopItemId);
      if (existing) {
        const [updated] = await db
          .update(userInventory)
          .set({ quantity: (existing.quantity ?? 1) + stackQty })
          .where(eq(userInventory.id, existing.id))
          .returning();
        return updated;
      }
      // No existing row — insert with the given stack qty
      const [item] = await db.insert(userInventory).values({ userId, shopItemId, quantity: stackQty, ...extraFields }).returning();
      return item;
    }
    const [item] = await db.insert(userInventory).values({ userId, shopItemId, ...extraFields }).returning();
    return item;
  }

  async decrementBaitQuantity(inventoryId: string): Promise<{ depleted: boolean; item: UserInventoryItem | undefined }> {
    const inv = await this.getInventoryItemById(inventoryId);
    if (!inv) return { depleted: true, item: undefined };
    const newQty = Math.max(0, (inv.quantity ?? 1) - 1);
    if (newQty === 0) {
      await db.delete(userInventory).where(eq(userInventory.id, inventoryId));
      return { depleted: true, item: undefined };
    }
    const [updated] = await db
      .update(userInventory)
      .set({ quantity: newQty })
      .where(eq(userInventory.id, inventoryId))
      .returning();
    return { depleted: false, item: updated };
  }

  async decrementPoleUses(inventoryId: string): Promise<UserInventoryItem | undefined> {
    const inv = await this.getInventoryItemById(inventoryId);
    if (!inv || inv.poleUsesLeft === null || inv.poleUsesLeft === undefined) return inv;
    const newUses = Math.max(0, inv.poleUsesLeft - 1);
    const [updated] = await db
      .update(userInventory)
      .set({ poleUsesLeft: newUses })
      .where(eq(userInventory.id, inventoryId))
      .returning();
    return updated;
  }

  async getInventoryItem(userId: string, shopItemId: string): Promise<UserInventoryItem | undefined> {
    const [item] = await db
      .select()
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, shopItemId)));
    return item;
  }

  async countInventoryPetCopies(userId: string, shopItemId: string): Promise<number> {
    const rows = await db
      .select()
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, shopItemId)));
    return rows.length;
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

  async getUserReward(id: string): Promise<UserReward | undefined> {
    const [reward] = await db.select().from(userRewards).where(eq(userRewards.id, id));
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

  async getWorldLocation(id: string): Promise<WorldLocation | undefined> {
    const [loc] = await db.select().from(worldLocations).where(eq(worldLocations.id, id));
    return loc;
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

  async updateShopItemPosition(itemId: string, posX: number, posY: number, width: number): Promise<ShopItem> {
    const [item] = await db.update(shopItems).set({ shopPosX: posX, shopPosY: posY, shopWidth: width }).where(eq(shopItems.id, itemId)).returning();
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

  async getAllBadges(): Promise<Badge[]> {
    return db.select().from(badges).orderBy(desc(badges.createdAt));
  }

  async createBadge(name: string, imageUrl: string, dailyRewardCoins?: number | null, badgePoints?: number): Promise<Badge> {
    const [badge] = await db.insert(badges).values({ name, imageUrl, dailyRewardCoins: dailyRewardCoins ?? null, badgePoints: badgePoints ?? 0 }).returning();
    return badge;
  }

  async deleteBadge(id: string): Promise<void> {
    await db.delete(userBadges).where(eq(userBadges.badgeId, id));
    await db.delete(badges).where(eq(badges.id, id));
  }

  async updateBadgeDailyReward(id: string, dailyRewardCoins: number | null): Promise<void> {
    await db.update(badges).set({ dailyRewardCoins }).where(eq(badges.id, id));
  }

  async updateBadge(id: string, data: { dailyRewardCoins?: number | null; badgePoints?: number; name?: string; imageUrl?: string }): Promise<void> {
    await db.update(badges).set(data).where(eq(badges.id, id));
  }

  async getUserBadges(userId: string): Promise<(UserBadge & { name: string; imageUrl: string; dailyRewardCoins: number | null; badgePoints: number; lastClaimedAt: Date | null })[]> {
    const rows = await db
      .select({
        id: userBadges.id,
        userId: userBadges.userId,
        badgeId: userBadges.badgeId,
        awardedAt: userBadges.awardedAt,
        name: badges.name,
        imageUrl: badges.imageUrl,
        dailyRewardCoins: badges.dailyRewardCoins,
        badgePoints: badges.badgePoints,
        lastClaimedAt: badgeRewardClaims.lastClaimedAt,
      })
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .leftJoin(badgeRewardClaims, and(
        eq(badgeRewardClaims.userId, userId),
        eq(badgeRewardClaims.badgeId, userBadges.badgeId)
      ))
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.awardedAt));
    return rows;
  }

  async getBadgeLeaderboard(limit = 50): Promise<{ userId: string; username: string; profileImage: string | null; totalPoints: number; topBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[]; allBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[] }[]> {
    const rows = await db
      .select({
        userId: userBadges.userId,
        username: users.username,
        profileImage: users.profileImage,
        badgeId: badges.id,
        badgeName: badges.name,
        badgeImageUrl: badges.imageUrl,
        badgePoints: badges.badgePoints,
      })
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .innerJoin(users, eq(userBadges.userId, users.id))
      .orderBy(desc(badges.badgePoints));

    const userMap = new Map<string, { userId: string; username: string; profileImage: string | null; totalPoints: number; allBadges: { id: string; name: string; imageUrl: string; badgePoints: number }[] }>();
    for (const row of rows) {
      if (LEADERBOARD_EXCLUDED_USERNAMES.has(row.username.toLowerCase())) continue;
      if (!userMap.has(row.userId)) {
        userMap.set(row.userId, { userId: row.userId, username: row.username, profileImage: row.profileImage, totalPoints: 0, allBadges: [] });
      }
      const entry = userMap.get(row.userId)!;
      entry.totalPoints += row.badgePoints ?? 0;
      entry.allBadges.push({ id: row.badgeId, name: row.badgeName, imageUrl: row.badgeImageUrl, badgePoints: row.badgePoints ?? 0 });
    }

    return Array.from(userMap.values())
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, limit)
      .map(u => ({
        ...u,
        topBadges: [...u.allBadges].sort((a, b) => b.badgePoints - a.badgePoints).slice(0, 3),
      }));
  }

  async getKeepersCentralEnemies(): Promise<(KeepersCentralEnemy & { enemyName: string; enemyImageUrl: string | null })[]> {
    const rows = await db
      .select({
        id: keepersCentralEnemies.id,
        enemyId: keepersCentralEnemies.enemyId,
        spawnX: keepersCentralEnemies.spawnX,
        spawnY: keepersCentralEnemies.spawnY,
        createdAt: keepersCentralEnemies.createdAt,
        enemyName: enemies.name,
        enemyImageUrl: enemies.imageUrl,
      })
      .from(keepersCentralEnemies)
      .innerJoin(enemies, eq(keepersCentralEnemies.enemyId, enemies.id))
      .orderBy(keepersCentralEnemies.createdAt);
    return rows;
  }

  async addKeepersCentralEnemy(enemyId: string, spawnX: number, spawnY: number): Promise<KeepersCentralEnemy> {
    const [row] = await db.insert(keepersCentralEnemies).values({ enemyId, spawnX, spawnY }).returning();
    return row;
  }

  async removeKeepersCentralEnemy(id: string): Promise<void> {
    await db.delete(keepersCentralEnemies).where(eq(keepersCentralEnemies.id, id));
  }

  async getKcDoors(worldId: string): Promise<KcDoor[]> {
    return db.select().from(kcDoors).where(eq(kcDoors.worldId, worldId)).orderBy(kcDoors.createdAt);
  }

  async createKcDoor(data: { worldId: string; name: string; posX: number; posY: number; triggerRadius: number; bgUrl?: string | null }): Promise<KcDoor> {
    const [row] = await db.insert(kcDoors).values(data).returning();
    return row;
  }

  async updateKcDoor(id: string, data: { name?: string; posX?: number; posY?: number; triggerRadius?: number; bgUrl?: string | null }): Promise<KcDoor> {
    const [row] = await db.update(kcDoors).set(data).where(eq(kcDoors.id, id)).returning();
    return row;
  }

  async deleteKcDoor(id: string): Promise<void> {
    await db.delete(kcDoorDecorPlacements).where(eq(kcDoorDecorPlacements.doorId, id));
    await db.delete(kcDoors).where(eq(kcDoors.id, id));
  }

  async getKcDoorDecorPlacements(doorId: string): Promise<KcDoorDecorPlacement[]> {
    return db.select().from(kcDoorDecorPlacements).where(eq(kcDoorDecorPlacements.doorId, doorId)).orderBy(kcDoorDecorPlacements.createdAt);
  }

  async createKcDoorDecorPlacement(data: { doorId: string; name: string; imageUrl: string; posX: number; posY: number; size?: number }): Promise<KcDoorDecorPlacement> {
    const [row] = await db.insert(kcDoorDecorPlacements).values({ ...data, size: data.size ?? 100 }).returning();
    return row;
  }

  async updateKcDoorDecorPlacement(id: string, data: { posX?: number; posY?: number; size?: number; flipped?: boolean }): Promise<KcDoorDecorPlacement> {
    const [row] = await db.update(kcDoorDecorPlacements).set(data).where(eq(kcDoorDecorPlacements.id, id)).returning();
    return row;
  }

  async deleteKcDoorDecorPlacement(id: string): Promise<void> {
    await db.delete(kcDoorDecorPlacements).where(eq(kcDoorDecorPlacements.id, id));
  }

  async getBadgeRewardClaim(userId: string, badgeId: string): Promise<{ lastClaimedAt: Date } | null> {
    const [row] = await db.select({ lastClaimedAt: badgeRewardClaims.lastClaimedAt })
      .from(badgeRewardClaims)
      .where(and(eq(badgeRewardClaims.userId, userId), eq(badgeRewardClaims.badgeId, badgeId)));
    return row ?? null;
  }

  async upsertBadgeRewardClaim(userId: string, badgeId: string): Promise<void> {
    const now = new Date();
    const existing = await this.getBadgeRewardClaim(userId, badgeId);
    if (existing) {
      await db.update(badgeRewardClaims)
        .set({ lastClaimedAt: now })
        .where(and(eq(badgeRewardClaims.userId, userId), eq(badgeRewardClaims.badgeId, badgeId)));
    } else {
      await db.insert(badgeRewardClaims).values({ userId, badgeId, lastClaimedAt: now });
    }
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

    // When filtering by "fish", also match legacy listings stored as "fishing"
    const buildTypeCond = (t: string) =>
      t === "fish"
        ? or(eq(playerMarketListings.itemType, "fish"), eq(playerMarketListings.itemType, "fishing"))
        : eq(playerMarketListings.itemType, t);

    if (filters?.itemType && filters.itemType !== "all") {
      query = query.where(and(eq(playerMarketListings.status, "active"), buildTypeCond(filters.itemType)));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      const cond = eq(playerMarketListings.status, "active");
      const searchCond = or(ilike(playerMarketListings.itemName, term), ilike(playerMarketListings.sellerName, term));
      if (filters?.itemType && filters.itemType !== "all") {
        query = query.where(and(cond, buildTypeCond(filters.itemType), searchCond));
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
      healthBoost: r.shop_items?.healthBoost || null,
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
      healthBoost: shopRow?.healthBoost || null,
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

  async getFishTemplateParts(fishItemId: string): Promise<FishTemplatePart[]> {
    return db.select().from(fishTemplateParts).where(eq(fishTemplateParts.fishItemId, fishItemId)).orderBy(asc(fishTemplateParts.zIndex));
  }

  async createFishTemplatePart(data: { fishItemId: string; partType: string; imageUrl: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number }): Promise<FishTemplatePart> {
    const [part] = await db.insert(fishTemplateParts).values({
      fishItemId: data.fishItemId,
      partType: data.partType,
      imageUrl: data.imageUrl,
      posX: data.posX ?? 100,
      posY: data.posY ?? 100,
      width: data.width ?? 200,
      height: data.height ?? 200,
      zIndex: data.zIndex ?? 1,
    }).returning();
    return part;
  }

  async updateFishTemplatePart(id: string, data: Partial<FishTemplatePart>): Promise<FishTemplatePart> {
    const [part] = await db.update(fishTemplateParts).set(data).where(eq(fishTemplateParts.id, id)).returning();
    return part;
  }

  async deleteFishTemplatePart(id: string): Promise<void> {
    await db.delete(fishTemplateParts).where(eq(fishTemplateParts.id, id));
  }

  async getPondFish(locationId: string): Promise<(PondFish & { item: ShopItem | null })[]> {
    const rows = await db.select().from(pondFish)
      .leftJoin(shopItems, eq(pondFish.shopItemId, shopItems.id))
      .where(eq(pondFish.locationId, locationId))
      .orderBy(asc(pondFish.createdAt));
    return rows.map(r => ({ ...r.pond_fish, item: r.shop_items }));
  }

  async addFishToPond(locationId: string, shopItemId: string): Promise<PondFish> {
    const existing = await db.select().from(pondFish).where(and(eq(pondFish.locationId, locationId), eq(pondFish.shopItemId, shopItemId)));
    if (existing.length > 0) return existing[0];
    const [row] = await db.insert(pondFish).values({ locationId, shopItemId }).returning();
    return row;
  }

  async removeFishFromPond(locationId: string, shopItemId: string): Promise<void> {
    await db.delete(pondFish).where(and(eq(pondFish.locationId, locationId), eq(pondFish.shopItemId, shopItemId)));
  }

  async getPlayerFishInventory(userId: string): Promise<(PlayerFishInventory & { item: ShopItem | null })[]> {
    const rows = await db.select().from(playerFishInventory)
      .leftJoin(shopItems, eq(playerFishInventory.shopItemId, shopItems.id))
      .where(eq(playerFishInventory.userId, userId))
      .orderBy(desc(playerFishInventory.caughtAt));
    return rows.map(r => ({ ...r.player_fish_inventory, item: r.shop_items }));
  }

  async addFishToPlayerInventory(userId: string, shopItemId: string): Promise<PlayerFishInventory> {
    const [row] = await db.insert(playerFishInventory).values({ userId, shopItemId }).returning();
    return row;
  }

  async logFishCatch(userId: string, shopItemId: string): Promise<void> {
    const existing = await db.select({ id: playerFishCatchLog.id })
      .from(playerFishCatchLog)
      .where(and(eq(playerFishCatchLog.userId, userId), eq(playerFishCatchLog.shopItemId, shopItemId)))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(playerFishCatchLog).values({ userId, shopItemId });
    }
  }

  async getPlayerCaughtFishLog(userId: string): Promise<{ shopItemId: string; rewardClaimed: boolean }[]> {
    const rows = await db.select({
      shopItemId: playerFishCatchLog.shopItemId,
      rewardClaimed: playerFishCatchLog.rewardClaimed,
    })
      .from(playerFishCatchLog)
      .where(eq(playerFishCatchLog.userId, userId));
    return rows;
  }

  async claimFishCatchReward(userId: string, shopItemId: string): Promise<boolean> {
    const [entry] = await db.select()
      .from(playerFishCatchLog)
      .where(and(eq(playerFishCatchLog.userId, userId), eq(playerFishCatchLog.shopItemId, shopItemId)))
      .limit(1);
    if (!entry || entry.rewardClaimed) return false;
    await db.update(playerFishCatchLog)
      .set({ rewardClaimed: true })
      .where(and(eq(playerFishCatchLog.userId, userId), eq(playerFishCatchLog.shopItemId, shopItemId)));
    return true;
  }

  async syncAquariumFish(userId: string, counts: { shopItemId: string; count: number }[]): Promise<void> {
    // Reset all aquarium flags for this user
    await db.update(playerFishInventory)
      .set({ inAquarium: false })
      .where(eq(playerFishInventory.userId, userId));

    // Mark exactly `count` fish per shopItemId as inAquarium
    for (const { shopItemId, count } of counts) {
      if (count <= 0) continue;
      const fish = await db.select({ id: playerFishInventory.id })
        .from(playerFishInventory)
        .where(and(
          eq(playerFishInventory.userId, userId),
          eq(playerFishInventory.shopItemId, shopItemId)
        ))
        .limit(count);
      if (fish.length > 0) {
        await db.update(playerFishInventory)
          .set({ inAquarium: true })
          .where(inArray(playerFishInventory.id, fish.map(f => f.id)));
      }
    }
  }

  async addFishToAquarium(userId: string, shopItemId: string): Promise<string | null> {
    const [fish] = await db.select({ id: playerFishInventory.id })
      .from(playerFishInventory)
      .where(and(
        eq(playerFishInventory.userId, userId),
        eq(playerFishInventory.shopItemId, shopItemId),
        eq(playerFishInventory.inAquarium, false)
      ))
      .limit(1);
    if (!fish) return null;
    await db.update(playerFishInventory)
      .set({ inAquarium: true })
      .where(eq(playerFishInventory.id, fish.id));
    return fish.id;
  }

  async removeFishFromAquarium(userId: string, shopItemId: string): Promise<boolean> {
    const [fish] = await db.select({ id: playerFishInventory.id })
      .from(playerFishInventory)
      .where(and(
        eq(playerFishInventory.userId, userId),
        eq(playerFishInventory.shopItemId, shopItemId),
        eq(playerFishInventory.inAquarium, true)
      ))
      .limit(1);
    if (!fish) return false;
    await db.update(playerFishInventory)
      .set({ inAquarium: false })
      .where(eq(playerFishInventory.id, fish.id));
    return true;
  }

  async getPlayerFishingEquipment(userId: string): Promise<PlayerFishingEquipment | null> {
    const [row] = await db.select().from(playerFishingEquipment).where(eq(playerFishingEquipment.userId, userId));
    return row ?? null;
  }

  async upsertPlayerFishingEquipment(userId: string, data: { poleInventoryId?: string | null; baitInventoryId?: string | null }): Promise<PlayerFishingEquipment> {
    const [row] = await db.insert(playerFishingEquipment)
      .values({ userId, poleInventoryId: data.poleInventoryId ?? null, baitInventoryId: data.baitInventoryId ?? null })
      .onConflictDoUpdate({
        target: playerFishingEquipment.userId,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async getWorldDecorItems(worldId: string): Promise<WorldDecorItem[]> {
    return db.select().from(worldDecorItems).where(eq(worldDecorItems.worldId, worldId)).orderBy(asc(worldDecorItems.createdAt));
  }

  async createWorldDecorItem(data: { worldId: string; name: string; imageUrl: string }): Promise<WorldDecorItem> {
    const [item] = await db.insert(worldDecorItems).values(data).returning();
    return item;
  }

  async updateWorldDecorItem(id: string, data: { name?: string; imageUrl?: string; message?: string | null }): Promise<void> {
    const itemUpdate: Partial<{ name: string; imageUrl: string }> = {};
    if (data.name !== undefined) itemUpdate.name = data.name;
    if (data.imageUrl !== undefined) itemUpdate.imageUrl = data.imageUrl;
    if (Object.keys(itemUpdate).length > 0) {
      await db.update(worldDecorItems).set(itemUpdate).where(eq(worldDecorItems.id, id));
      // Cascade name/imageUrl changes to all placements of this item
      await db.update(worldDecorPlacements).set(itemUpdate).where(eq(worldDecorPlacements.decorItemId, id));
    }
    // Update message on every placement of this item
    if (data.message !== undefined) {
      await db.update(worldDecorPlacements).set({ message: data.message ?? null }).where(eq(worldDecorPlacements.decorItemId, id));
    }
  }

  async deleteWorldDecorItem(id: string): Promise<void> {
    await db.delete(worldDecorPlacements).where(eq(worldDecorPlacements.decorItemId, id));
    await db.delete(worldDecorItems).where(eq(worldDecorItems.id, id));
  }

  async getWorldDecorPlacements(worldId: string): Promise<WorldDecorPlacement[]> {
    return db.select().from(worldDecorPlacements).where(eq(worldDecorPlacements.worldId, worldId)).orderBy(asc(worldDecorPlacements.createdAt));
  }

  async createWorldDecorPlacement(data: { worldId: string; decorItemId: string; name: string; imageUrl: string; posX: number; posY: number; message?: string | null }): Promise<WorldDecorPlacement> {
    const [placement] = await db.insert(worldDecorPlacements).values({ ...data, size: 100 }).returning();
    return placement;
  }

  async updateWorldDecorPlacement(id: string, data: { posX?: number; posY?: number; size?: number; flipped?: boolean; message?: string | null }): Promise<WorldDecorPlacement> {
    const [placement] = await db.update(worldDecorPlacements).set(data).where(eq(worldDecorPlacements.id, id)).returning();
    return placement;
  }

  async deleteWorldDecorPlacement(id: string): Promise<void> {
    await db.delete(worldDecorPlacements).where(eq(worldDecorPlacements.id, id));
  }

  async getFishBarrelByWorld(worldId: string): Promise<FishBarrel | undefined> {
    const [barrel] = await db.select().from(fishBarrels).where(eq(fishBarrels.worldId, worldId));
    return barrel;
  }

  async createFishBarrel(worldId: string): Promise<FishBarrel> {
    const [barrel] = await db.insert(fishBarrels).values({ worldId }).returning();
    return barrel;
  }

  async updateFishBarrel(id: string, data: Partial<FishBarrel>): Promise<FishBarrel> {
    const [barrel] = await db.update(fishBarrels).set(data).where(eq(fishBarrels.id, id)).returning();
    return barrel;
  }

  async deleteFishBarrel(id: string): Promise<void> {
    await db.delete(fishBarrels).where(eq(fishBarrels.id, id));
  }

  async deleteFishInventoryItems(fishIds: string[]): Promise<void> {
    if (fishIds.length === 0) return;
    await db.delete(playerFishInventory).where(inArray(playerFishInventory.id, fishIds));
  }

  async createPvpBattle(data: { userId: string; opponentName: string; opponentImageUrl?: string | null; opponentLevel: number; opponentSkill?: string | null; result: string; coinsEarned: number; battlePointsDelta?: number }): Promise<any> {
    const [row] = await db.insert(pvpBattles).values({
      userId: data.userId,
      opponentName: data.opponentName,
      opponentImageUrl: data.opponentImageUrl ?? null,
      opponentLevel: data.opponentLevel,
      opponentSkill: data.opponentSkill ?? null,
      result: data.result,
      coinsEarned: data.coinsEarned,
      battlePointsDelta: data.battlePointsDelta ?? 0,
    }).returning();
    return row;
  }

  async getPvpBattlesByUser(userId: string, limit = 20): Promise<any[]> {
    return db.select().from(pvpBattles)
      .where(eq(pvpBattles.userId, userId))
      .orderBy(sql`${pvpBattles.createdAt} desc`)
      .limit(limit);
  }

  async getPvpLeaderboard(limit = 20): Promise<{ userId: string; username: string; profileImage: string | null; battlePoints: number; wins: number; losses: number }[]> {
    const rows = await db.select({
      userId: pvpBattles.userId,
      username: users.username,
      profileImage: users.profileImage,
      result: pvpBattles.result,
      battlePointsDelta: pvpBattles.battlePointsDelta,
    }).from(pvpBattles)
      .leftJoin(users, and(eq(pvpBattles.userId, users.id), eq(users.isAdmin, false)));

    const byUser: Record<string, { userId: string; username: string; profileImage: string | null; battlePoints: number; wins: number; losses: number }> = {};
    for (const row of rows) {
      if (!row.userId) continue;
      if (LEADERBOARD_EXCLUDED_USERNAMES.has((row.username || "").toLowerCase())) continue;
      if (!byUser[row.userId]) {
        byUser[row.userId] = { userId: row.userId, username: row.username || "Unknown", profileImage: row.profileImage ?? null, battlePoints: 0, wins: 0, losses: 0 };
      }
      byUser[row.userId].battlePoints += row.battlePointsDelta || 0;
      if (row.result === "win") byUser[row.userId].wins++;
      else byUser[row.userId].losses++;
    }
    return Object.values(byUser)
      .sort((a, b) => b.battlePoints - a.battlePoints)
      .slice(0, limit);
  }

  async getBattleGroup(userId: string): Promise<any | null> {
    const [row] = await db.select().from(pvpBattleGroups).where(eq(pvpBattleGroups.userId, userId));
    return row ?? null;
  }

  async upsertBattleGroup(userId: string, petInventoryIds: string[]): Promise<any> {
    const existing = await this.getBattleGroup(userId);
    if (existing) {
      const [row] = await db.update(pvpBattleGroups)
        .set({ petInventoryIds, updatedAt: new Date() })
        .where(eq(pvpBattleGroups.userId, userId))
        .returning();
      return row;
    } else {
      const [row] = await db.insert(pvpBattleGroups).values({ userId, petInventoryIds }).returning();
      return row;
    }
  }

  async getAllBattleGroupsWithUsers(): Promise<any[]> {
    return db.select({
      userId: pvpBattleGroups.userId,
      petInventoryIds: pvpBattleGroups.petInventoryIds,
      updatedAt: pvpBattleGroups.updatedAt,
      username: users.username,
      profileImage: users.profileImage,
    }).from(pvpBattleGroups)
      .innerJoin(users, and(eq(pvpBattleGroups.userId, users.id), eq(users.isAdmin, false)))
      .orderBy(sql`${pvpBattleGroups.updatedAt} desc`);
  }

  // ── World pet positions ────────────────────────────────────────────────────

  async getPetPositions(worldId: string): Promise<{ ownerUserId: string; posX: number; posY: number }[]> {
    return db.select({ ownerUserId: worldPetPositions.ownerUserId, posX: worldPetPositions.posX, posY: worldPetPositions.posY })
      .from(worldPetPositions)
      .where(eq(worldPetPositions.worldId, worldId));
  }

  async getPetPosition(worldId: string, userId: string): Promise<{ posX: number; posY: number } | null> {
    const rows = await db.select({ posX: worldPetPositions.posX, posY: worldPetPositions.posY })
      .from(worldPetPositions)
      .where(and(eq(worldPetPositions.worldId, worldId), eq(worldPetPositions.ownerUserId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async getWorldActivePetForUser(worldId: string, userId: string): Promise<any | null> {
    const rows = await db
      .select({
        userId:          users.id,
        username:        users.username,
        profileImage:    users.profileImage,
        inventoryId:     userInventory.id,
        shopItemId:      shopItems.id,
        name:            shopItems.name,
        petNickname:     userInventory.petNickname,
        imageUrl:        shopItems.imageUrl,
        hatchedImageUrl: shopItems.hatchedImageUrl,
        petLevel:        userInventory.petLevel,
        petHealth:       userInventory.petHealth,
        petAtk:          userInventory.petAtk,
        petDef:          userInventory.petDef,
        rarity:          shopItems.rarity,
        petTemplateId:   shopItems.petTemplateId,
      })
      .from(users)
      .innerJoin(
        userInventory,
        and(
          eq(userInventory.userId, users.id),
          sql`${userInventory.shopItemId} = ${users.activePetId}`,
          eq(userInventory.isHatched, true),
        ),
      )
      .innerJoin(shopItems, and(
        eq(shopItems.id, userInventory.shopItemId),
        eq(shopItems.type, "pet"),
      ))
      .where(and(
        eq(users.id, userId),
        eq(users.isBanned, false),
        sql`${users.activePetId} IS NOT NULL`,
      ))
      .limit(1);
    return rows[0] ?? null;
  }

  async getWorldActivePets(worldId: string): Promise<any[]> {
    const rows = await db
      .select({
        userId:          users.id,
        username:        users.username,
        profileImage:    users.profileImage,
        inventoryId:     userInventory.id,
        shopItemId:      shopItems.id,
        name:            shopItems.name,
        petNickname:     userInventory.petNickname,
        imageUrl:        shopItems.imageUrl,
        hatchedImageUrl: shopItems.hatchedImageUrl,
        petLevel:        userInventory.petLevel,
        petHealth:       userInventory.petHealth,
        petAtk:          userInventory.petAtk,
        petDef:          userInventory.petDef,
        rarity:          shopItems.rarity,
        petTemplateId:   shopItems.petTemplateId,
        posX:            worldPetPositions.posX,
        posY:            worldPetPositions.posY,
      })
      .from(users)
      .innerJoin(
        userInventory,
        and(
          eq(userInventory.userId, users.id),
          sql`${userInventory.shopItemId} = ${users.activePetId}`,
          eq(userInventory.isHatched, true),
        ),
      )
      .innerJoin(shopItems, and(
        eq(shopItems.id, userInventory.shopItemId),
        eq(shopItems.type, "pet"),
      ))
      .leftJoin(worldPetPositions, and(
        eq(worldPetPositions.ownerUserId, users.id),
        eq(worldPetPositions.worldId, worldId),
      ))
      .where(and(
        eq(users.isBanned, false),
        eq(users.isAdmin, false),
        sql`${users.activePetId} IS NOT NULL`,
      ));
    return rows;
  }

  async upsertPetPosition(worldId: string, ownerUserId: string, posX: number, posY: number): Promise<void> {
    await db.insert(worldPetPositions)
      .values({ worldId, ownerUserId, posX, posY })
      .onConflictDoUpdate({
        target: [worldPetPositions.worldId, worldPetPositions.ownerUserId],
        set: { posX, posY, updatedAt: new Date() },
      });
  }

  // ── Pet house positions ────────────────────────────────────────────────────

  async getPetHousePositions(userId: string): Promise<{ inventoryId: string; posLeft: string; posTop: string }[]> {
    return db.select({ inventoryId: petHousePositions.inventoryId, posLeft: petHousePositions.posLeft, posTop: petHousePositions.posTop })
      .from(petHousePositions)
      .where(eq(petHousePositions.userId, userId));
  }

  async upsertPetHousePosition(userId: string, inventoryId: string, posLeft: string, posTop: string): Promise<void> {
    await db.insert(petHousePositions)
      .values({ userId, inventoryId, posLeft, posTop })
      .onConflictDoUpdate({
        target: [petHousePositions.userId, petHousePositions.inventoryId],
        set: { posLeft, posTop, updatedAt: new Date() },
      });
  }

  // ── Friendships ────────────────────────────────────────────────────────────

  async sendFriendRequest(requesterId: string, receiverId: string): Promise<Friendship> {
    const existing = await db.select().from(friendships).where(
      or(
        and(eq(friendships.requesterId, requesterId), eq(friendships.receiverId, receiverId)),
        and(eq(friendships.requesterId, receiverId), eq(friendships.receiverId, requesterId)),
      )
    );
    if (existing.length > 0) return existing[0];
    const [row] = await db.insert(friendships).values({ requesterId, receiverId, status: "pending" }).returning();
    return row;
  }

  async getPendingFriendRequests(userId: string): Promise<any[]> {
    return db.select({
      id: friendships.id,
      requesterId: friendships.requesterId,
      createdAt: friendships.createdAt,
      username: users.username,
      profileImage: users.profileImage,
    }).from(friendships)
      .leftJoin(users, eq(friendships.requesterId, users.id))
      .where(and(eq(friendships.receiverId, userId), eq(friendships.status, "pending")));
  }

  async getPendingFriendRequestCount(userId: string): Promise<number> {
    const rows = await db.select({ id: friendships.id }).from(friendships)
      .where(and(eq(friendships.receiverId, userId), eq(friendships.status, "pending")));
    return rows.length;
  }

  async acceptFriendRequest(friendshipId: string, userId: string): Promise<Friendship | null> {
    const [row] = await db.update(friendships)
      .set({ status: "accepted" })
      .where(and(eq(friendships.id, friendshipId), eq(friendships.receiverId, userId)))
      .returning();
    return row ?? null;
  }

  async removeFriendOrRequest(userId: string, otherId: string): Promise<void> {
    await db.delete(friendships).where(
      or(
        and(eq(friendships.requesterId, userId), eq(friendships.receiverId, otherId)),
        and(eq(friendships.requesterId, otherId), eq(friendships.receiverId, userId)),
      )
    );
  }

  async getFriends(userId: string): Promise<any[]> {
    const asFriendRows = await db.select({
      id: friendships.id,
      friendId: friendships.receiverId,
      username: users.username,
      profileImage: users.profileImage,
    }).from(friendships)
      .leftJoin(users, eq(friendships.receiverId, users.id))
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "accepted")));

    const asReceiverRows = await db.select({
      id: friendships.id,
      friendId: friendships.requesterId,
      username: users.username,
      profileImage: users.profileImage,
    }).from(friendships)
      .leftJoin(users, eq(friendships.requesterId, users.id))
      .where(and(eq(friendships.receiverId, userId), eq(friendships.status, "accepted")));

    return [...asFriendRows, ...asReceiverRows];
  }

  async getFriendshipStatus(userId: string, otherId: string): Promise<Friendship | null> {
    const [row] = await db.select().from(friendships).where(
      or(
        and(eq(friendships.requesterId, userId), eq(friendships.receiverId, otherId)),
        and(eq(friendships.requesterId, otherId), eq(friendships.receiverId, userId)),
      )
    );
    return row ?? null;
  }

  async getOutgoingPendingRequestCount(userId: string): Promise<number> {
    const rows = await db.select({ id: friendships.id }).from(friendships)
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "pending")));
    return rows.length;
  }

  async createNotification(userId: string, type: string, message: string): Promise<void> {
    await db.insert(notifications).values({ userId, type, message });
  }

  async getUnreadNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .orderBy(desc(notifications.createdAt));
  }

  async markNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  async getAllEnemies(): Promise<Enemy[]> {
    return db.select().from(enemies).orderBy(asc(enemies.createdAt));
  }

  async createEnemy(data: InsertEnemy): Promise<Enemy> {
    const [enemy] = await db.insert(enemies).values(data).returning();
    return enemy;
  }

  async updateEnemy(id: string, data: Partial<InsertEnemy>): Promise<Enemy> {
    const [enemy] = await db.update(enemies).set(data).where(eq(enemies.id, id)).returning();
    return enemy;
  }

  async deleteEnemy(id: string): Promise<void> {
    await db.delete(enemyParts).where(eq(enemyParts.enemyId, id));
    await db.delete(enemies).where(eq(enemies.id, id));
  }

  async getEnemyParts(enemyId: string): Promise<EnemyPart[]> {
    return db.select().from(enemyParts).where(eq(enemyParts.enemyId, enemyId)).orderBy(asc(enemyParts.zIndex));
  }

  async createEnemyPart(data: { enemyId: string; partType: string; imageUrl: string; posX?: number; posY?: number; width?: number; height?: number; zIndex?: number }): Promise<EnemyPart> {
    const [part] = await db.insert(enemyParts).values({
      enemyId: data.enemyId,
      partType: data.partType,
      imageUrl: data.imageUrl,
      posX: data.posX ?? 100,
      posY: data.posY ?? 100,
      width: data.width ?? 200,
      height: data.height ?? 200,
      zIndex: data.zIndex ?? 1,
    }).returning();
    return part;
  }

  async updateEnemyPart(id: string, data: Partial<EnemyPart>): Promise<EnemyPart> {
    const [part] = await db.update(enemyParts).set(data).where(eq(enemyParts.id, id)).returning();
    return part;
  }

  async deleteEnemyPart(id: string): Promise<void> {
    await db.delete(enemyParts).where(eq(enemyParts.id, id));
  }

  // ── House Bundles ─────────────────────────────────────────────────────────────
  async getHouseBundles(): Promise<HouseBundle[]> {
    return db.select().from(houseBundles).orderBy(asc(houseBundles.createdAt));
  }

  async getHouseBundle(id: string): Promise<HouseBundle | undefined> {
    const [b] = await db.select().from(houseBundles).where(eq(houseBundles.id, id));
    return b;
  }

  async createHouseBundle(data: { name: string; shopImageUrl?: string; bgImageUrl?: string; price: number }): Promise<HouseBundle> {
    const [b] = await db.insert(houseBundles).values(data).returning();
    return b;
  }

  async updateHouseBundle(id: string, data: Partial<HouseBundle>): Promise<HouseBundle> {
    const [b] = await db.update(houseBundles).set(data).where(eq(houseBundles.id, id)).returning();
    return b;
  }

  async deleteHouseBundle(id: string): Promise<void> {
    await db.delete(houseBundleBuildings).where(eq(houseBundleBuildings.bundleId, id));
    await db.delete(houseBundles).where(eq(houseBundles.id, id));
  }

  async getHouseBundleBuildings(bundleId: string): Promise<HouseBundleBuilding[]> {
    return db.select().from(houseBundleBuildings).where(eq(houseBundleBuildings.bundleId, bundleId)).orderBy(asc(houseBundleBuildings.createdAt));
  }

  async createHouseBundleBuilding(data: { bundleId: string; name: string; imageUrl: string; posX?: number; posY?: number }): Promise<HouseBundleBuilding> {
    const [b] = await db.insert(houseBundleBuildings).values({
      bundleId: data.bundleId,
      name: data.name,
      imageUrl: data.imageUrl,
      posX: data.posX ?? 50,
      posY: data.posY ?? 50,
    }).returning();
    return b;
  }

  async updateHouseBundleBuilding(id: string, data: Partial<HouseBundleBuilding>): Promise<HouseBundleBuilding> {
    const [b] = await db.update(houseBundleBuildings).set(data).where(eq(houseBundleBuildings.id, id)).returning();
    return b;
  }

  async deleteHouseBundleBuilding(id: string): Promise<void> {
    await db.delete(houseBundleBuildings).where(eq(houseBundleBuildings.id, id));
  }

  // ── Home Decor Items ──────────────────────────────────────────────────────────
  async getHomeDecorItems(): Promise<HomeDecorItem[]> {
    return db.select().from(homeDecorItems).orderBy(asc(homeDecorItems.createdAt));
  }

  async createHomeDecorItem(data: { name: string; imageUrl?: string; price: number }): Promise<HomeDecorItem> {
    const [d] = await db.insert(homeDecorItems).values(data).returning();
    return d;
  }

  async updateHomeDecorItem(id: string, data: Partial<HomeDecorItem>): Promise<HomeDecorItem> {
    const [d] = await db.update(homeDecorItems).set(data).where(eq(homeDecorItems.id, id)).returning();
    return d;
  }

  async deleteHomeDecorItem(id: string): Promise<void> {
    await db.delete(homeDecorItems).where(eq(homeDecorItems.id, id));
  }

  // ── User House Bundle Ownership ───────────────────────────────────────────────
  async getUserHouseBundles(userId: string): Promise<(UserHouseBundle & { bundle: HouseBundle })[]> {
    const rows = await db
      .select()
      .from(userHouseBundles)
      .innerJoin(houseBundles, eq(userHouseBundles.bundleId, houseBundles.id))
      .where(eq(userHouseBundles.userId, userId))
      .orderBy(asc(userHouseBundles.purchasedAt));
    return rows.map((r) => ({ ...r.user_house_bundles, bundle: r.house_bundles }));
  }

  async hasUserHouseBundle(userId: string, bundleId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(userHouseBundles)
      .where(and(eq(userHouseBundles.userId, userId), eq(userHouseBundles.bundleId, bundleId)));
    return !!row;
  }

  async grantUserHouseBundle(userId: string, bundleId: string): Promise<UserHouseBundle> {
    const [row] = await db.insert(userHouseBundles).values({ userId, bundleId }).returning();
    return row;
  }

  async setActiveHouseBundle(userId: string, bundleId: string | null): Promise<void> {
    await db.update(users).set({ activeHouseBundleId: bundleId } as any).where(eq(users.id, userId));
  }

  async getActiveBundleWithBuildings(userId: string): Promise<(HouseBundle & { buildings: HouseBundleBuilding[] }) | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user?.activeHouseBundleId) return null;
    const [bundle] = await db.select().from(houseBundles).where(eq(houseBundles.id, user.activeHouseBundleId));
    if (!bundle) return null;
    const buildings = await db.select().from(houseBundleBuildings).where(eq(houseBundleBuildings.bundleId, bundle.id)).orderBy(asc(houseBundleBuildings.createdAt));
    return { ...bundle, buildings };
  }
}

export const storage = new DatabaseStorage();
