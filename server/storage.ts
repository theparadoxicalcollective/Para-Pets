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
  type AdminMessage, adminMessages,
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
  pvpBattleTokens,
  type Friendship, friendships,
  type Notification, notifications,
  worldPetPositions,
  petHousePositions,
  type Enemy, type EnemyPart, enemies, enemyParts,
  type InsertEnemy,
  type WorldBuilding, worldBuildings,
  type HouseBundle, houseBundles,
  type HouseBundleBuilding, houseBundleBuildings,
  type HomeDecorItem, homeDecorItems,
  type UserHouseBundle, userHouseBundles,
  type LocationHouseBundle, locationHouseBundles,
  type LocationHomeDecor, locationHomeDecor,
  type UserHomeDecorInventory, userHomeDecorInventory,
  type PlacedHomeDecor, placedHomeDecor,
  type Gift, gifts,
  deletedAccounts,
  type WorldChatMessage, worldChatMessages,
  type ChatFilterWord, chatFilterWords,
  type VeridianWatcherQuote, veridianWatcherQuotes,
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
  setWatcherShoutoutsEnabled(userId: string, enabled: boolean): Promise<void>;
  updateProfileImage(id: string, profileImage: string): Promise<User>;
  updateActivePet(id: string, activePetId: string | null): Promise<User>;
  getAllUsers(): Promise<User[]>;
  banUser(id: string, days?: number): Promise<User>;
  unbanUser(id: string): Promise<User>;
  setModerator(id: string, isModerator: boolean): Promise<User>;
  getTeamMembers(): Promise<{ id: string; username: string; profileImage: string | null; isAdmin: boolean; isModerator: boolean }[]>;
  addCoins(id: string, amount: number): Promise<User>;
  atomicDeductCoins(id: string, amount: number): Promise<User | null>;
  setWelcomeV2Sent(id: string): Promise<void>;
  setLastWatcherGreetedAt(id: string, when: Date): Promise<void>;
  setLastPettingRewardAt(id: string, when: Date): Promise<void>;
  setPettingRewardsToday(id: string, count: number): Promise<void>;
  // Per-pet petting reward state. Looks up by inventoryId and verifies the
  // pet belongs to userId (returns null if not). Update sets both timestamp
  // and daily counter atomically.
  getPetPettingState(userId: string, inventoryId: string): Promise<{ lastPettingRewardAt: Date | null; pettingRewardsToday: number } | null>;
  setPetPettingState(userId: string, inventoryId: string, when: Date, count: number): Promise<void>;
  updatePassword(id: string, hashedPassword: string): Promise<User>;
  deleteAccount(id: string): Promise<void>;
  setPasswordResetToken(id: string, token: string, expires: Date): Promise<void>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  clearPasswordResetToken(id: string): Promise<void>;
  setEmailVerificationToken(id: string, token: string, expires: Date): Promise<void>;
  getUserByEmailVerificationToken(token: string): Promise<User | undefined>;
  verifyEmail(id: string): Promise<void>;
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
  getAdminUsers(): Promise<User[]>;
  createSupportMessage(data: InsertSupportMessage): Promise<SupportMessage>;
  getAllSupportMessages(): Promise<SupportMessage[]>;
  markSupportMessageRead(id: string): Promise<void>;
  deleteSupportMessage(id: string): Promise<void>;
  createAdminMessage(username: string, subject: string, message: string): Promise<AdminMessage>;
  getAdminMessagesByUsername(username: string): Promise<AdminMessage[]>;
  deleteAdminMessage(id: string): Promise<void>;
  getLocationEnemies(locationId: string): Promise<LocationEnemy[]>;
  getLocationEnemy(id: string): Promise<LocationEnemy | undefined>;
  createLocationEnemy(data: { locationId: string; name: string; imageUrl?: string | null; isBoss?: boolean; coinReward?: number; bossSpecialAttack?: string | null }): Promise<LocationEnemy>;
  updateLocationEnemy(id: string, data: Partial<{ name: string; imageUrl: string | null; isBoss: boolean; coinReward: number; bossSpecialAttack: string | null }>): Promise<LocationEnemy>;
  deleteLocationEnemy(id: string): Promise<void>;
  getEnemyDrops(enemyId: string): Promise<EnemyDrop[]>;
  createEnemyDrop(data: { enemyId: string; shopItemId: string; dropRate: number }): Promise<EnemyDrop>;
  deleteEnemyDrop(id: string): Promise<void>;
  getAllBadges(): Promise<Badge[]>;
  getBadgeByName(name: string): Promise<Badge | undefined>;
  createBadge(name: string, imageUrl: string, dailyRewardCoins?: number | null, badgePoints?: number, claimType?: string): Promise<Badge>;
  deleteBadge(id: string): Promise<void>;
  updateBadgeDailyReward(id: string, dailyRewardCoins: number | null): Promise<void>;
  updateBadge(id: string, data: { dailyRewardCoins?: number | null; badgePoints?: number; name?: string; imageUrl?: string; claimType?: string }): Promise<void>;
  getUserBadges(userId: string): Promise<(UserBadge & { name: string; imageUrl: string; dailyRewardCoins: number | null; claimType: string; badgePoints: number; lastClaimedAt: Date | null })[]>;
  getBadgeRecipients(badgeId: string): Promise<{ userId: string; username: string; profileImage: string | null; awardedAt: Date }[]>;
  awardBadge(userId: string, badgeId: string): Promise<UserBadge>;
  revokeBadge(userId: string, badgeId: string): Promise<void>;
  getBadgeRewardClaim(userId: string, badgeId: string): Promise<{ lastClaimedAt: Date } | null>;
  upsertBadgeRewardClaim(userId: string, badgeId: string): Promise<void>;
  getBadgeLeaderboard(limit?: number): Promise<{ userId: string; username: string; profileImage: string | null; totalPoints: number; topBadges: { id: string; name: string; imageUrl: string }[]; allBadges: { id: string; name: string; imageUrl: string }[] }[]>;
  // Adventurer's Devotion: lifetime earnings minus coins received from coin-bundle purchases.
  getDevotionLeaderboard(limit?: number): Promise<{ userId: string; username: string; profileImage: string | null; totalPoints: number; topBadges: { id: string; name: string; imageUrl: string }[]; allBadges: { id: string; name: string; imageUrl: string }[] }[]>;
  getKeepersCentralEnemies(): Promise<(KeepersCentralEnemy & { enemyName: string; enemyImageUrl: string | null })[]>;
  addKeepersCentralEnemy(enemyId: string, spawnX: number, spawnY: number): Promise<KeepersCentralEnemy>;
  removeKeepersCentralEnemy(id: string): Promise<void>;
  getKcDoors(worldId: string): Promise<KcDoor[]>;
  createKcDoor(data: { worldId: string; name: string; posX: number; posY: number; triggerRadius: number; bgUrl?: string | null; isShop?: boolean }): Promise<KcDoor>;
  updateKcDoor(id: string, data: { name?: string; posX?: number; posY?: number; triggerRadius?: number; bgUrl?: string | null; isShop?: boolean }): Promise<KcDoor>;
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
  getPvpLeaderboardFull(): Promise<{ userId: string; username: string; profileImage: string | null; battlePoints: number; wins: number; losses: number; isAdmin?: boolean; isModerator?: boolean }[]>;
  getPvpTicketCount(userId: string): Promise<number>;
  consumePvpTicket(userId: string): Promise<boolean>;
  createPvpBattleToken(userId: string): Promise<string>;
  consumePvpBattleToken(userId: string, tokenId: string): Promise<boolean>;
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
  getHouseBundleBuilding(id: string): Promise<HouseBundleBuilding | null>;
  sendGift(data: { senderId: string; receiverId: string; message?: string; coinAmount: number; itemType?: string; shopItemInventoryId?: string; decorItemId?: string; itemQuantity?: number; itemName?: string; itemImageUrl?: string; shopItemId?: string }): Promise<Gift>;
  getPendingGifts(userId: string): Promise<(Gift & { senderName: string; senderProfileImageUrl: string | null })[]>;
  acceptGift(giftId: string, userId: string): Promise<Gift>;
  getWorldChatMessages(): Promise<WorldChatMessage[]>;
  addWorldChatMessage(data: { userId: string; username: string; profileImage?: string | null; message: string; isBot?: boolean }): Promise<WorldChatMessage>;
  getLastWorldChatByUser(userId: string): Promise<WorldChatMessage | null>;
  purgeOldWorldChatMessages(): Promise<void>;
  getChatFilterWords(): Promise<ChatFilterWord[]>;
  addChatFilterWord(word: string, addedBy?: string): Promise<ChatFilterWord>;
  deleteChatFilterWord(id: string): Promise<void>;
  getVWQuotes(): Promise<VeridianWatcherQuote[]>;
  addVWQuote(message: string, addedBy?: string): Promise<VeridianWatcherQuote>;
  deleteVWQuote(id: string): Promise<void>;
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

  async setWatcherShoutoutsEnabled(userId: string, enabled: boolean): Promise<void> {
    await db.update(users).set({ watcherShoutoutsEnabled: enabled }).where(eq(users.id, userId));
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

  async banUser(id: string, days?: number): Promise<User> {
    const banUntil = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    const [user] = await db
      .update(users)
      .set({ isBanned: true, banUntil })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async unbanUser(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isBanned: false, banUntil: null })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async setModerator(id: string, isModerator: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isModerator })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getTeamMembers(): Promise<{ id: string; username: string; profileImage: string | null; isAdmin: boolean; isModerator: boolean }[]> {
    const members = await db
      .select({ id: users.id, username: users.username, profileImage: users.profileImage, isAdmin: users.isAdmin, isModerator: users.isModerator })
      .from(users)
      .where(sql`${users.isAdmin} IS TRUE OR ${users.isModerator} IS TRUE`);
    return members;
  }

  // Batch avatar lookup. Returns { [userId]: profileImage|null } only for the
  // ids requested. Used by the frontend to hydrate leaderboards / chat without
  // shipping every avatar inline with every list payload.
  async getUsersAvatars(userIds: string[]): Promise<Record<string, string | null>> {
    if (userIds.length === 0) return {};
    const rows = await db
      .select({ id: users.id, profileImage: users.profileImage })
      .from(users)
      .where(inArray(users.id, userIds));
    const out: Record<string, string | null> = {};
    for (const r of rows) out[r.id] = r.profileImage ?? null;
    return out;
  }

  async addCoins(id: string, amount: number): Promise<User> {
    const updateFields: Record<string, any> = {
      coins: sql`GREATEST(0, ${users.coins} + ${amount})`,
    };
    if (amount > 0) {
      updateFields.totalCoinsEarned = sql`${users.totalCoinsEarned} + ${amount}`;
    }
    const [updated] = await db
      .update(users)
      .set(updateFields)
      .where(eq(users.id, id))
      .returning();
    if (!updated) throw new Error("User not found");
    return updated;
  }

  // Atomic: deducts only when coins >= amount in one SQL statement. Returns null if insufficient.
  async atomicDeductCoins(id: string, amount: number): Promise<User | null> {
    const [updated] = await db
      .update(users)
      .set({ coins: sql`${users.coins} - ${amount}` })
      .where(and(eq(users.id, id), gte(users.coins, amount)))
      .returning();
    return updated ?? null;
  }

  async setWelcomeV2Sent(id: string): Promise<void> {
    await db.update(users).set({ welcomeV2Sent: true }).where(eq(users.id, id));
  }

  async setLastWatcherGreetedAt(id: string, when: Date): Promise<void> {
    await db.update(users).set({ lastWatcherGreetedAt: when }).where(eq(users.id, id));
  }

  async setLastPettingRewardAt(id: string, when: Date): Promise<void> {
    await db.update(users).set({ lastPettingRewardAt: when }).where(eq(users.id, id));
  }

  async setPettingRewardsToday(id: string, count: number): Promise<void> {
    await db.update(users).set({ pettingRewardsToday: count }).where(eq(users.id, id));
  }

  async getPetPettingState(userId: string, inventoryId: string): Promise<{ lastPettingRewardAt: Date | null; pettingRewardsToday: number } | null> {
    const [row] = await db
      .select({ lastPettingRewardAt: userInventory.lastPettingRewardAt, pettingRewardsToday: userInventory.pettingRewardsToday })
      .from(userInventory)
      .where(and(eq(userInventory.id, inventoryId), eq(userInventory.userId, userId)));
    if (!row) return null;
    return {
      lastPettingRewardAt: row.lastPettingRewardAt,
      pettingRewardsToday: row.pettingRewardsToday ?? 0,
    };
  }

  async setPetPettingState(userId: string, inventoryId: string, when: Date, count: number): Promise<void> {
    await db
      .update(userInventory)
      .set({ lastPettingRewardAt: when, pettingRewardsToday: count })
      .where(and(eq(userInventory.id, inventoryId), eq(userInventory.userId, userId)));
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
    const userRow = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
    if (userRow.length > 0 && userRow[0].email) {
      await db.insert(deletedAccounts).values({ email: userRow[0].email.toLowerCase() });
    }
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

  async setEmailVerificationToken(id: string, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({ emailVerificationToken: token, emailVerificationExpires: expires })
      .where(eq(users.id, id));
  }

  async getUserByEmailVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token));
    return user;
  }

  async verifyEmail(id: string): Promise<void> {
    await db
      .update(users)
      .set({ emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null })
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
    // Fish-related data
    await db.delete(fishTemplateParts).where(eq(fishTemplateParts.fishItemId, id));
    await db.delete(pondFish).where(eq(pondFish.shopItemId, id));
    await db.delete(playerFishCatchLog).where(eq(playerFishCatchLog.shopItemId, id));
    await db.delete(playerFishInventory).where(eq(playerFishInventory.shopItemId, id));
    // Cross-table references
    await db.delete(enemyDrops).where(eq(enemyDrops.shopItemId, id));
    await db.delete(rewardBundleItems).where(eq(rewardBundleItems.shopItemId, id));
    await db.delete(playerMarketListings).where(eq(playerMarketListings.shopItemId, id));
    // Inventory rows — must clear accessories, house positions, and equipment refs first
    const invRows = await db.select({ id: userInventory.id }).from(userInventory).where(eq(userInventory.shopItemId, id));
    if (invRows.length > 0) {
      const invIds = invRows.map(r => r.id);
      await db.delete(petEquippedAccessories).where(inArray(petEquippedAccessories.petInventoryId, invIds));
      await db.delete(petEquippedAccessories).where(inArray(petEquippedAccessories.accessoryInventoryId, invIds));
      await db.delete(petHousePositions).where(inArray(petHousePositions.inventoryId, invIds));
      await db.update(playerFishingEquipment).set({ poleInventoryId: null }).where(inArray(playerFishingEquipment.poleInventoryId, invIds));
      await db.update(playerFishingEquipment).set({ baitInventoryId: null }).where(inArray(playerFishingEquipment.baitInventoryId, invIds));
    }
    await db.delete(userInventory).where(eq(userInventory.shopItemId, id));
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
    // Remove all objects, enemies (with their drops), fish, and bundle/decor assignments
    await db.delete(locationObjects).where(eq(locationObjects.locationId, id));
    const locEnemies = await db.select({ id: locationEnemies.id }).from(locationEnemies).where(eq(locationEnemies.locationId, id));
    if (locEnemies.length > 0) {
      await db.delete(enemyDrops).where(inArray(enemyDrops.enemyId, locEnemies.map(e => e.id)));
    }
    await db.delete(locationEnemies).where(eq(locationEnemies.locationId, id));
    await db.delete(pondFish).where(eq(pondFish.locationId, id));
    await db.delete(locationHouseBundles).where(eq(locationHouseBundles.locationId, id));
    await db.delete(locationHomeDecor).where(eq(locationHomeDecor.locationId, id));
    // Unassign shop items rather than delete them
    await db.update(shopItems).set({ locationId: null }).where(eq(shopItems.locationId, id));
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
    // Cascade through every location belonging to this world
    const locs = await db.select({ id: worldLocations.id }).from(worldLocations).where(eq(worldLocations.worldId, id));
    for (const loc of locs) await this.deleteWorldLocation(loc.id);
    // World-level decorations and buildings
    await db.delete(worldBuildings).where(eq(worldBuildings.worldId, id));
    await db.delete(worldDecorPlacements).where(eq(worldDecorPlacements.worldId, id));
    // Unassign (not delete) shop items that reference this world
    await db.update(shopItems).set({ worldId: null as unknown as string }).where(eq(shopItems.worldId, id));
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
    // Detach the template from any shop items rather than deleting the items
    await db.update(shopItems).set({ petTemplateId: null }).where(eq(shopItems.petTemplateId, id));
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

  async getAdminUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.isAdmin, true));
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

  async createAdminMessage(username: string, subject: string, message: string): Promise<AdminMessage> {
    const [msg] = await db.insert(adminMessages).values({ username, subject, message }).returning();
    return msg;
  }

  async getAdminMessagesByUsername(username: string): Promise<AdminMessage[]> {
    return db.select().from(adminMessages).where(eq(adminMessages.username, username)).orderBy(desc(adminMessages.createdAt));
  }

  async deleteAdminMessage(id: string): Promise<void> {
    await db.delete(adminMessages).where(eq(adminMessages.id, id));
  }

  async getLocationEnemies(locationId: string): Promise<LocationEnemy[]> {
    return db.select().from(locationEnemies).where(eq(locationEnemies.locationId, locationId)).orderBy(asc(locationEnemies.sortOrder));
  }

  async getLocationEnemy(id: string): Promise<LocationEnemy | undefined> {
    const [enemy] = await db.select().from(locationEnemies).where(eq(locationEnemies.id, id));
    return enemy;
  }

  async createLocationEnemy(data: { locationId: string; name: string; imageUrl?: string | null; isBoss?: boolean; archetype?: string; coinReward?: number; bossSpecialAttack?: string | null }): Promise<LocationEnemy> {
    const [enemy] = await db.insert(locationEnemies).values({
      locationId: data.locationId,
      name: data.name,
      imageUrl: data.imageUrl || null,
      isBoss: data.isBoss || false,
      archetype: data.archetype || "balanced",
      bossSpecialAttack: data.bossSpecialAttack || null,
      coinReward: data.coinReward || 0,
    }).returning();
    return enemy;
  }

  async updateLocationEnemy(id: string, data: Partial<{ name: string; imageUrl: string | null; isBoss: boolean; archetype: string; coinReward: number; bossSpecialAttack: string | null }>): Promise<LocationEnemy> {
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

  async getBadgeByName(name: string): Promise<Badge | undefined> {
    const [badge] = await db.select().from(badges).where(eq(badges.name, name));
    return badge;
  }

  async createBadge(name: string, imageUrl: string, dailyRewardCoins?: number | null, badgePoints?: number, claimType?: string): Promise<Badge> {
    const [badge] = await db.insert(badges).values({ name, imageUrl, dailyRewardCoins: dailyRewardCoins ?? null, badgePoints: badgePoints ?? 0, claimType: claimType ?? "daily" }).returning();
    return badge;
  }

  async deleteBadge(id: string): Promise<void> {
    await db.delete(userBadges).where(eq(userBadges.badgeId, id));
    await db.delete(badgeRewardClaims).where(eq(badgeRewardClaims.badgeId, id));
    await db.delete(badges).where(eq(badges.id, id));
  }

  async updateBadgeDailyReward(id: string, dailyRewardCoins: number | null): Promise<void> {
    await db.update(badges).set({ dailyRewardCoins }).where(eq(badges.id, id));
  }

  async updateBadge(id: string, data: { dailyRewardCoins?: number | null; badgePoints?: number; name?: string; imageUrl?: string; claimType?: string }): Promise<void> {
    await db.update(badges).set(data).where(eq(badges.id, id));
  }

  async getUserBadges(userId: string): Promise<(UserBadge & { name: string; imageUrl: string; dailyRewardCoins: number | null; claimType: string; badgePoints: number; lastClaimedAt: Date | null })[]> {
    const rows = await db
      .select({
        id: userBadges.id,
        userId: userBadges.userId,
        badgeId: userBadges.badgeId,
        awardedAt: userBadges.awardedAt,
        name: badges.name,
        imageUrl: badges.imageUrl,
        dailyRewardCoins: badges.dailyRewardCoins,
        claimType: badges.claimType,
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

  async getBadgeLeaderboard(limit = 50): Promise<{ userId: string; username: string; profileImage: string | null; totalPoints: number; topBadges: { id: string; name: string; imageUrl: string }[]; allBadges: { id: string; name: string; imageUrl: string }[] }[]> {
    // Rank by lifetime coins earned. For users who existed before the totalCoinsEarned
    // column was added (their value is 0), fall back to their current coin balance as
    // a reasonable proxy so they still appear on the leaderboard.
    const rankScore = sql<number>`GREATEST(${users.totalCoinsEarned}, ${users.coins})`;

    // NOTE: profileImage is intentionally NOT selected here. Profile pictures
    // are stored as base64 data URLs and would balloon this payload to ~1.3 MB.
    // The frontend fetches avatars in batch via POST /api/users/avatars instead.
    const topUsers = await db
      .select({
        userId: users.id,
        username: users.username,
        totalCoinsEarned: users.totalCoinsEarned,
        coins: users.coins,
      })
      .from(users)
      .where(and(
        sql`GREATEST(${users.totalCoinsEarned}, ${users.coins}) > 0`,
        sql`${users.isAdmin} IS NOT TRUE`,
        sql`${users.isModerator} IS NOT TRUE`,
      ))
      .orderBy(desc(rankScore))
      .limit(limit * 2); // fetch extra to account for excluded usernames

    const filtered = topUsers
      .filter(u => !LEADERBOARD_EXCLUDED_USERNAMES.has(u.username.toLowerCase()))
      .slice(0, limit);

    if (filtered.length === 0) return [];

    // Fetch badges for these users to show on their leaderboard card
    const userIds = filtered.map(u => u.userId);
    const badgeRows = await db
      .select({
        userId: userBadges.userId,
        badgeId: badges.id,
        badgeName: badges.name,
        badgeImageUrl: badges.imageUrl,
      })
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(inArray(userBadges.userId, userIds));

    const badgeMap = new Map<string, { id: string; name: string; imageUrl: string }[]>();
    for (const row of badgeRows) {
      if (!badgeMap.has(row.userId)) badgeMap.set(row.userId, []);
      badgeMap.get(row.userId)!.push({ id: row.badgeId, name: row.badgeName, imageUrl: row.badgeImageUrl });
    }

    return filtered.map(u => {
      const allBadges = badgeMap.get(u.userId) ?? [];
      const score = Math.max(u.totalCoinsEarned, u.coins);
      return {
        userId: u.userId,
        username: u.username,
        profileImage: null, // fetched separately via /api/users/avatars
        totalPoints: score, // field name kept for API compatibility
        topBadges: allBadges.slice(0, 3),
        allBadges,
      };
    });
  }

  async getDevotionLeaderboard(limit = 50): Promise<{ userId: string; username: string; profileImage: string | null; totalPoints: number; topBadges: { id: string; name: string; imageUrl: string }[]; allBadges: { id: string; name: string; imageUrl: string }[] }[]> {
    // "Adventurer's Devotion": lifetime earnings (using same MAX-fallback as the
    // Hall of Earnings) minus the total coins this user has received from coin-bundle
    // purchases. Score is clamped to >= 0. Users with score 0 are excluded.
    const purchaseTotalsRows = await db
      .select({
        userId: coinPurchases.userId,
        totalPurchased: sql<number>`COALESCE(SUM(${coinPurchases.coinsReceived}), 0)`.as("total_purchased"),
      })
      .from(coinPurchases)
      .groupBy(coinPurchases.userId);
    const purchaseTotals = new Map<string, number>();
    for (const row of purchaseTotalsRows) {
      purchaseTotals.set(row.userId, Number(row.totalPurchased) || 0);
    }

    // Fetch a generous candidate pool — we'll re-rank by devotion score in JS so
    // bundle-heavy users at the top of Hall of Earnings can drop down or off-list.
    // NOTE: profileImage intentionally not selected — see getBadgeLeaderboard.
    const candidates = await db
      .select({
        userId: users.id,
        username: users.username,
        totalCoinsEarned: users.totalCoinsEarned,
        coins: users.coins,
      })
      .from(users)
      .where(and(
        sql`GREATEST(${users.totalCoinsEarned}, ${users.coins}) > 0`,
        sql`${users.isAdmin} IS NOT TRUE`,
        sql`${users.isModerator} IS NOT TRUE`,
      ));

    const scored = candidates
      .filter(u => !LEADERBOARD_EXCLUDED_USERNAMES.has(u.username.toLowerCase()))
      .map(u => {
        const earnings = Math.max(u.totalCoinsEarned, u.coins);
        const purchased = purchaseTotals.get(u.userId) ?? 0;
        const score = Math.max(0, earnings - purchased);
        return { ...u, score };
      })
      .filter(u => u.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (scored.length === 0) return [];

    const userIds = scored.map(u => u.userId);
    const badgeRows = await db
      .select({
        userId: userBadges.userId,
        badgeId: badges.id,
        badgeName: badges.name,
        badgeImageUrl: badges.imageUrl,
      })
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(inArray(userBadges.userId, userIds));

    const badgeMap = new Map<string, { id: string; name: string; imageUrl: string }[]>();
    for (const row of badgeRows) {
      if (!badgeMap.has(row.userId)) badgeMap.set(row.userId, []);
      badgeMap.get(row.userId)!.push({ id: row.badgeId, name: row.badgeName, imageUrl: row.badgeImageUrl });
    }

    return scored.map(u => {
      const allBadges = badgeMap.get(u.userId) ?? [];
      return {
        userId: u.userId,
        username: u.username,
        profileImage: null, // fetched separately via /api/users/avatars
        totalPoints: u.score,
        topBadges: allBadges.slice(0, 3),
        allBadges,
      };
    });
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

  async createKcDoor(data: { worldId: string; name: string; posX: number; posY: number; triggerRadius: number; bgUrl?: string | null; isShop?: boolean }): Promise<KcDoor> {
    const [row] = await db.insert(kcDoors).values(data).returning();
    return row;
  }

  async updateKcDoor(id: string, data: { name?: string; posX?: number; posY?: number; triggerRadius?: number; bgUrl?: string | null; isShop?: boolean }): Promise<KcDoor> {
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

  async getBadgeRecipients(badgeId: string): Promise<{ userId: string; username: string; profileImage: string | null; awardedAt: Date }[]> {
    const rows = await db
      .select({ userId: userBadges.userId, username: users.username, profileImage: users.profileImage, awardedAt: userBadges.awardedAt })
      .from(userBadges)
      .innerJoin(users, eq(userBadges.userId, users.id))
      .where(eq(userBadges.badgeId, badgeId))
      .orderBy(desc(userBadges.awardedAt));
    return rows;
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
    // Atomic: deduct coins and increment slots only if coins >= 300
    const [updated] = await db.update(users)
      .set({
        coins: sql`${users.coins} - 300`,
        marketExtraSlots: sql`COALESCE(${users.marketExtraSlots}, 0) + 1`,
      })
      .where(and(eq(users.id, userId), gte(users.coins, 300)))
      .returning();
    if (!updated) throw new Error("Not enough coins");
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
    const all = await this.getPvpLeaderboardFull();
    return all.slice(0, limit);
  }

  /**
   * Build the FULL ranked battle-points leaderboard. Used by the PvP page so
   * we can return the top N AND the requesting user's own rank even when
   * they're outside the top N. Also enriches each entry with admin/mod flags
   * so the client can render role badges.
   */
  async getPvpLeaderboardFull(): Promise<{ userId: string; username: string; profileImage: string | null; battlePoints: number; wins: number; losses: number; isAdmin?: boolean; isModerator?: boolean }[]> {
    const rows = await db.select({
      userId: pvpBattles.userId,
      username: users.username,
      profileImage: users.profileImage,
      isAdmin: users.isAdmin,
      isModerator: users.isModerator,
      result: pvpBattles.result,
      battlePointsDelta: pvpBattles.battlePointsDelta,
    }).from(pvpBattles)
      .leftJoin(users, eq(pvpBattles.userId, users.id));

    const byUser: Record<string, { userId: string; username: string; profileImage: string | null; battlePoints: number; wins: number; losses: number; isAdmin?: boolean; isModerator?: boolean }> = {};
    for (const row of rows) {
      if (!row.userId) continue;
      if (LEADERBOARD_EXCLUDED_USERNAMES.has((row.username || "").toLowerCase())) continue;
      if (row.isAdmin || row.isModerator) continue;
      if (!byUser[row.userId]) {
        byUser[row.userId] = {
          userId: row.userId,
          username: row.username || "Unknown",
          profileImage: row.profileImage ?? null,
          battlePoints: 0,
          wins: 0,
          losses: 0,
          isAdmin: row.isAdmin ?? false,
          isModerator: row.isModerator ?? false,
        };
      }
      byUser[row.userId].battlePoints += row.battlePointsDelta || 0;
      if (row.result === "win") byUser[row.userId].wins++;
      else byUser[row.userId].losses++;
    }
    return Object.values(byUser).sort((a, b) => b.battlePoints - a.battlePoints);
  }

  /** PvP ticket helpers. Tickets are inventory items: shop_items.special_type
   *  = 'pvp_ticket'. Each user_inventory row holds a stack via the `quantity`
   *  column, so a player's "ticket count" is the sum of quantities across
   *  every row they own that points at a pvp_ticket shop item. */
  async getPvpTicketCount(userId: string): Promise<number> {
    const rows = await db.select({ quantity: userInventory.quantity })
      .from(userInventory)
      .leftJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
      .where(and(eq(userInventory.userId, userId), eq(shopItems.specialType, "pvp_ticket")));
    return rows.reduce((sum, r) => sum + (r.quantity ?? 1), 0);
  }

  /** Consume one PvP ticket. Decrements the smallest-quantity stack first
   *  (so single-quantity rows drain before larger stacks). Returns true if a
   *  ticket was successfully consumed, false if the user had none.
   *
   *  Wrapped in a transaction with a `quantity > 0` guard on the UPDATE so
   *  two concurrent /api/pvp/start calls can't both spend the same single
   *  ticket. The UPDATE only mutates a row when quantity is still > 0, and
   *  RETURNING tells us whether it actually applied. */
  async consumePvpTicket(userId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const rows = await tx.select({ id: userInventory.id, quantity: userInventory.quantity })
        .from(userInventory)
        .leftJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
        .where(and(eq(userInventory.userId, userId), eq(shopItems.specialType, "pvp_ticket")))
        .orderBy(userInventory.quantity);
      const target = rows.find(r => (r.quantity ?? 1) > 0);
      if (!target) return false;
      // Guarded decrement: only succeeds if quantity is still > 0 at write
      // time. If a parallel request already spent it, RETURNING is empty.
      const updated = await tx.update(userInventory)
        .set({ quantity: sql`${userInventory.quantity} - 1` })
        .where(and(eq(userInventory.id, target.id), sql`${userInventory.quantity} > 0`))
        .returning({ id: userInventory.id, quantity: userInventory.quantity });
      if (updated.length === 0) return false;
      if ((updated[0].quantity ?? 0) <= 0) {
        await tx.delete(userInventory).where(eq(userInventory.id, target.id));
      }
      return true;
    });
  }

  /** Issue a one-time battle token for a user. Caller must have already
   *  spent a ticket. The returned id is opaque to the client and must be
   *  presented back to /api/pvp/result, which deletes it on use. */
  async createPvpBattleToken(userId: string): Promise<string> {
    const [row] = await db.insert(pvpBattleTokens).values({ userId }).returning({ id: pvpBattleTokens.id });
    return row.id;
  }

  /** Atomically consume a battle token. Returns true only if the token
   *  existed AND belonged to this user — preventing both replay and
   *  cross-user token theft. Uses RETURNING so the delete is single-shot. */
  async consumePvpBattleToken(userId: string, tokenId: string): Promise<boolean> {
    if (!tokenId) return false;
    const deleted = await db.delete(pvpBattleTokens)
      .where(and(eq(pvpBattleTokens.id, tokenId), eq(pvpBattleTokens.userId, userId)))
      .returning({ id: pvpBattleTokens.id });
    return deleted.length > 0;
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
      isAdmin: users.isAdmin,
      isModerator: users.isModerator,
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
        facingDirection: shopItems.facingDirection,
      })
      .from(users)
      .innerJoin(
        userInventory,
        and(
          eq(userInventory.userId, users.id),
          sql`${userInventory.id} = ${users.activePetId}`,
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
        facingDirection: shopItems.facingDirection,
        posX:            worldPetPositions.posX,
        posY:            worldPetPositions.posY,
      })
      .from(users)
      .innerJoin(
        userInventory,
        and(
          eq(userInventory.userId, users.id),
          sql`${userInventory.id} = ${users.activePetId}`,
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

  async getPetHousePositions(userId: string): Promise<{ inventoryId: string; posLeft: string; posTop: string; location: string }[]> {
    return db.select({ inventoryId: petHousePositions.inventoryId, posLeft: petHousePositions.posLeft, posTop: petHousePositions.posTop, location: petHousePositions.location })
      .from(petHousePositions)
      .where(eq(petHousePositions.userId, userId));
  }

  async upsertPetHousePosition(userId: string, inventoryId: string, posLeft: string, posTop: string, location: string = "outside"): Promise<void> {
    await db.insert(petHousePositions)
      .values({ userId, inventoryId, posLeft, posTop, location })
      .onConflictDoUpdate({
        target: [petHousePositions.userId, petHousePositions.inventoryId],
        set: { posLeft, posTop, location, updatedAt: new Date() },
      });
  }

  async deletePetHousePosition(userId: string, inventoryId: string): Promise<void> {
    await db.delete(petHousePositions)
      .where(and(eq(petHousePositions.userId, userId), eq(petHousePositions.inventoryId, inventoryId)));
  }

  async deleteAllPetHousePositions(userId: string): Promise<void> {
    await db.delete(petHousePositions)
      .where(eq(petHousePositions.userId, userId));
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
      isAdmin: users.isAdmin,
      isModerator: users.isModerator,
    }).from(friendships)
      .leftJoin(users, eq(friendships.receiverId, users.id))
      .where(and(eq(friendships.requesterId, userId), eq(friendships.status, "accepted")));

    const asReceiverRows = await db.select({
      id: friendships.id,
      friendId: friendships.requesterId,
      username: users.username,
      profileImage: users.profileImage,
      isAdmin: users.isAdmin,
      isModerator: users.isModerator,
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
    await db.delete(keepersCentralEnemies).where(eq(keepersCentralEnemies.enemyId, id));
    await db.delete(enemyDrops).where(eq(enemyDrops.enemyId, id));
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
    await db.delete(userHouseBundles).where(eq(userHouseBundles.bundleId, id));
    await db.delete(locationHouseBundles).where(eq(locationHouseBundles.bundleId, id));
    await db.delete(houseBundles).where(eq(houseBundles.id, id));
  }

  async getHouseBundleBuildings(bundleId: string): Promise<HouseBundleBuilding[]> {
    return db.select().from(houseBundleBuildings).where(eq(houseBundleBuildings.bundleId, bundleId)).orderBy(asc(houseBundleBuildings.createdAt));
  }

  async getHouseBundleBuilding(id: string): Promise<HouseBundleBuilding | null> {
    const [b] = await db.select().from(houseBundleBuildings).where(eq(houseBundleBuildings.id, id));
    return b ?? null;
  }

  async createHouseBundleBuilding(data: { bundleId: string; name: string; imageUrl: string; posX?: number; posY?: number; width?: number; flippedX?: boolean; interiorImageUrl?: string | null; size?: string }): Promise<HouseBundleBuilding> {
    const [b] = await db.insert(houseBundleBuildings).values({
      bundleId: data.bundleId,
      name: data.name,
      imageUrl: data.imageUrl,
      posX: data.posX ?? 50,
      posY: data.posY ?? 50,
      ...(data.width !== undefined ? { width: data.width } : {}),
      ...(data.flippedX !== undefined ? { flippedX: data.flippedX } : {}),
      ...(data.interiorImageUrl !== undefined ? { interiorImageUrl: data.interiorImageUrl } : {}),
      ...(data.size !== undefined ? { size: data.size } : {}),
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
    await db.delete(locationHomeDecor).where(eq(locationHomeDecor.decorId, id));
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

  // ── Location House Bundle shop stock ─────────────────────────────────────────
  async getLocationHouseBundles(locationId: string): Promise<(LocationHouseBundle & { bundle: HouseBundle })[]> {
    const rows = await db.select().from(locationHouseBundles).where(eq(locationHouseBundles.locationId, locationId));
    const result: (LocationHouseBundle & { bundle: HouseBundle })[] = [];
    for (const row of rows) {
      const [bundle] = await db.select().from(houseBundles).where(eq(houseBundles.id, row.bundleId));
      if (bundle) result.push({ ...row, bundle });
    }
    return result;
  }

  async addBundleToShop(locationId: string, bundleId: string): Promise<LocationHouseBundle> {
    const [row] = await db.insert(locationHouseBundles).values({ locationId, bundleId }).returning();
    return row;
  }

  async removeBundleFromShop(locationId: string, bundleId: string): Promise<void> {
    await db.delete(locationHouseBundles).where(and(eq(locationHouseBundles.locationId, locationId), eq(locationHouseBundles.bundleId, bundleId)));
  }

  // ── Location Home Decor shop stock ───────────────────────────────────────────
  async getLocationHomeDecor(locationId: string): Promise<(LocationHomeDecor & { decor: HomeDecorItem })[]> {
    const rows = await db.select().from(locationHomeDecor).where(eq(locationHomeDecor.locationId, locationId));
    const result: (LocationHomeDecor & { decor: HomeDecorItem })[] = [];
    for (const row of rows) {
      const [decor] = await db.select().from(homeDecorItems).where(eq(homeDecorItems.id, row.decorId));
      if (decor) result.push({ ...row, decor });
    }
    return result;
  }

  async addDecorToShop(locationId: string, decorId: string): Promise<LocationHomeDecor> {
    const [row] = await db.insert(locationHomeDecor).values({ locationId, decorId }).returning();
    return row;
  }

  async removeDecorFromShop(locationId: string, decorId: string): Promise<void> {
    await db.delete(locationHomeDecor).where(and(eq(locationHomeDecor.locationId, locationId), eq(locationHomeDecor.decorId, decorId)));
  }

  // ── Player Home Decor Inventory ───────────────────────────────────────────────
  async getUserHomeDecorInventory(userId: string): Promise<(UserHomeDecorInventory & { item: HomeDecorItem })[]> {
    const rows = await db.select().from(userHomeDecorInventory).where(eq(userHomeDecorInventory.userId, userId));
    const result: (UserHomeDecorInventory & { item: HomeDecorItem })[] = [];
    for (const row of rows) {
      const [item] = await db.select().from(homeDecorItems).where(eq(homeDecorItems.id, row.decorItemId));
      if (item) result.push({ ...row, item });
    }
    return result;
  }

  async grantHomeDecorToUser(userId: string, decorItemId: string): Promise<void> {
    const [existing] = await db.select().from(userHomeDecorInventory)
      .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, decorItemId)));
    if (existing) {
      await db.update(userHomeDecorInventory).set({ quantity: existing.quantity + 1 })
        .where(eq(userHomeDecorInventory.id, existing.id));
    } else {
      await db.insert(userHomeDecorInventory).values({ userId, decorItemId, quantity: 1 });
    }
  }

  async decrementHomeDecorInventory(userId: string, decorItemId: string): Promise<void> {
    const [existing] = await db.select().from(userHomeDecorInventory)
      .where(and(eq(userHomeDecorInventory.userId, userId), eq(userHomeDecorInventory.decorItemId, decorItemId)));
    if (!existing || existing.quantity <= 0) throw new Error("Not enough in inventory");
    if (existing.quantity === 1) {
      await db.delete(userHomeDecorInventory).where(eq(userHomeDecorInventory.id, existing.id));
    } else {
      await db.update(userHomeDecorInventory).set({ quantity: existing.quantity - 1 })
        .where(eq(userHomeDecorInventory.id, existing.id));
    }
  }

  async incrementHomeDecorInventory(userId: string, decorItemId: string): Promise<void> {
    await this.grantHomeDecorToUser(userId, decorItemId);
  }

  // ── Placed Home Decor ─────────────────────────────────────────────────────────
  async getPlacedHomeDecor(userId: string, location?: string): Promise<(PlacedHomeDecor & { item: HomeDecorItem })[]> {
    const rows = await db.select().from(placedHomeDecor)
      .where(location
        ? and(eq(placedHomeDecor.userId, userId), eq(placedHomeDecor.location, location))
        : eq(placedHomeDecor.userId, userId))
      .orderBy(asc(placedHomeDecor.createdAt));
    const result: (PlacedHomeDecor & { item: HomeDecorItem })[] = [];
    for (const row of rows) {
      const [item] = await db.select().from(homeDecorItems).where(eq(homeDecorItems.id, row.decorItemId));
      if (item) result.push({ ...row, item });
    }
    return result;
  }

  async placeHomeDecorItem(userId: string, decorItemId: string, data: { xPct: number; yPct: number; size: number; flipped: boolean; location?: string }): Promise<PlacedHomeDecor> {
    await this.decrementHomeDecorInventory(userId, decorItemId);
    const [row] = await db.insert(placedHomeDecor).values({ userId, decorItemId, location: data.location ?? "outside", xPct: data.xPct, yPct: data.yPct, size: data.size, flipped: data.flipped }).returning();
    return row;
  }

  async updatePlacedHomeDecor(id: string, userId: string, data: Partial<{ xPct: number; yPct: number; size: number; flipped: boolean }>): Promise<PlacedHomeDecor> {
    const [row] = await db.update(placedHomeDecor).set(data).where(and(eq(placedHomeDecor.id, id), eq(placedHomeDecor.userId, userId))).returning();
    return row;
  }

  async removePlacedHomeDecor(id: string, userId: string): Promise<{ decorItemId: string }> {
    const [existing] = await db.select().from(placedHomeDecor).where(and(eq(placedHomeDecor.id, id), eq(placedHomeDecor.userId, userId)));
    if (!existing) throw new Error("Placed decor not found");
    await db.delete(placedHomeDecor).where(eq(placedHomeDecor.id, id));
    await this.incrementHomeDecorInventory(userId, existing.decorItemId);
    return { decorItemId: existing.decorItemId };
  }

  // ── Gifts ─────────────────────────────────────────────────────────────────
  async sendGift(data: {
    senderId: string;
    receiverId: string;
    message?: string;
    coinAmount: number;
    itemType?: string;
    shopItemInventoryId?: string;
    decorItemId?: string;
    itemQuantity?: number;
    itemName?: string;
    itemImageUrl?: string;
    shopItemId?: string;
  }): Promise<Gift> {
    const { senderId, receiverId, message, coinAmount, itemType, shopItemInventoryId, decorItemId, itemQuantity = 1, itemName, itemImageUrl, shopItemId } = data;

    // Deduct coins from sender if sending coins
    if (coinAmount > 0) {
      const sender = await this.getUser(senderId);
      if (!sender || (sender.coins ?? 0) < coinAmount) throw new Error("Insufficient coins");
      await db.update(users).set({ coins: (sender.coins ?? 0) - coinAmount }).where(eq(users.id, senderId));
    }

    // Deduct shop item from sender inventory
    if (itemType === "shop_item" && shopItemInventoryId) {
      const [inv] = await db.select().from(userInventory).where(and(eq(userInventory.id, shopItemInventoryId), eq(userInventory.userId, senderId)));
      if (!inv) throw new Error("Item not found in inventory");
      const qty = inv.quantity ?? 1;
      if (qty <= 1) {
        await db.delete(userInventory).where(eq(userInventory.id, shopItemInventoryId));
      } else {
        await db.update(userInventory).set({ quantity: qty - itemQuantity }).where(eq(userInventory.id, shopItemInventoryId));
      }
    }

    // Deduct decor item from sender inventory
    if (itemType === "decor" && decorItemId) {
      await this.decrementHomeDecorInventory(senderId, decorItemId);
    }

    const [gift] = await db.insert(gifts).values({
      senderId,
      receiverId,
      message: message ?? null,
      coinAmount,
      itemType: itemType ?? null,
      shopItemId: shopItemId ?? null,
      shopItemInventoryId: shopItemInventoryId ?? null,
      decorItemId: decorItemId ?? null,
      itemQuantity,
      itemName: itemName ?? null,
      itemImageUrl: itemImageUrl ?? null,
      status: "pending",
    }).returning();
    return gift;
  }

  async getPendingGifts(userId: string): Promise<(Gift & { senderName: string; senderProfileImageUrl: string | null })[]> {
    const rows = await db
      .select({
        gift: gifts,
        senderName: users.username,
        senderProfileImageUrl: users.profileImage,
      })
      .from(gifts)
      .leftJoin(users, eq(gifts.senderId, users.id))
      .where(and(eq(gifts.receiverId, userId), eq(gifts.status, "pending")))
      .orderBy(desc(gifts.createdAt));
    return rows.map((r) => ({
      ...r.gift,
      senderName: r.senderName ?? "Unknown",
      senderProfileImageUrl: r.senderProfileImageUrl ?? null,
    }));
  }

  async acceptGift(giftId: string, userId: string): Promise<Gift> {
    const [gift] = await db.select().from(gifts).where(and(eq(gifts.id, giftId), eq(gifts.receiverId, userId), eq(gifts.status, "pending")));
    if (!gift) throw new Error("Gift not found");

    // Add coins to receiver
    if (gift.coinAmount > 0) {
      await this.addCoins(userId, gift.coinAmount);
    }

    // Add shop item to receiver inventory
    if (gift.itemType === "shop_item" && gift.shopItemId) {
      await this.addToInventory(userId, gift.shopItemId, undefined, gift.itemQuantity);
    }

    // Add decor item to receiver inventory
    if (gift.itemType === "decor" && gift.decorItemId) {
      for (let i = 0; i < gift.itemQuantity; i++) {
        await this.grantHomeDecorToUser(userId, gift.decorItemId);
      }
    }

    const [updated] = await db.update(gifts).set({ status: "accepted" }).where(eq(gifts.id, giftId)).returning();
    return updated;
  }

  async getWorldChatMessages(): Promise<(WorldChatMessage & { isAdmin: boolean; isModerator: boolean })[]> {
    const rows = await db.select({
      id: worldChatMessages.id,
      userId: worldChatMessages.userId,
      username: worldChatMessages.username,
      profileImage: worldChatMessages.profileImage,
      message: worldChatMessages.message,
      isBot: worldChatMessages.isBot,
      createdAt: worldChatMessages.createdAt,
      isAdmin: users.isAdmin,
      isModerator: users.isModerator,
    }).from(worldChatMessages)
      .leftJoin(users, eq(worldChatMessages.userId, users.id))
      .orderBy(asc(worldChatMessages.createdAt))
      .limit(50);
    return rows.map(r => ({ ...r, isAdmin: r.isAdmin ?? false, isModerator: r.isModerator ?? false }));
  }

  async addWorldChatMessage(data: { userId: string; username: string; profileImage?: string | null; message: string; isBot?: boolean }): Promise<WorldChatMessage> {
    const [msg] = await db.insert(worldChatMessages).values({
      userId: data.userId,
      username: data.username,
      profileImage: data.profileImage ?? null,
      message: data.message,
      isBot: data.isBot ?? false,
    }).returning();
    return msg;
  }

  async getLastWorldChatByUser(userId: string): Promise<WorldChatMessage | null> {
    const [msg] = await db.select().from(worldChatMessages)
      .where(eq(worldChatMessages.userId, userId))
      .orderBy(desc(worldChatMessages.createdAt))
      .limit(1);
    return msg ?? null;
  }

  async purgeOldWorldChatMessages(): Promise<void> {
    // When count reaches 50, delete the 10 oldest messages so recent chat stays visible
    const [{ count }] = await db.select({ count: sql<number>`COUNT(*)::int` }).from(worldChatMessages);
    if (count >= 50) {
      await db.execute(sql`
        DELETE FROM world_chat_messages
        WHERE id IN (
          SELECT id FROM world_chat_messages
          ORDER BY created_at ASC
          LIMIT 10
        )
      `);
    }
  }

  async getChatFilterWords(): Promise<ChatFilterWord[]> {
    return db.select().from(chatFilterWords).orderBy(asc(chatFilterWords.word));
  }

  async addChatFilterWord(word: string, addedBy?: string): Promise<ChatFilterWord> {
    const [row] = await db.insert(chatFilterWords).values({ word: word.toLowerCase().trim(), addedBy }).returning();
    return row;
  }

  async deleteChatFilterWord(id: string): Promise<void> {
    await db.delete(chatFilterWords).where(eq(chatFilterWords.id, id));
  }

  async getVWQuotes(): Promise<VeridianWatcherQuote[]> {
    return db.select().from(veridianWatcherQuotes).orderBy(asc(veridianWatcherQuotes.createdAt));
  }

  async addVWQuote(message: string, addedBy?: string): Promise<VeridianWatcherQuote> {
    const [row] = await db.insert(veridianWatcherQuotes).values({ message, addedBy }).returning();
    return row;
  }

  async deleteVWQuote(id: string): Promise<void> {
    await db.delete(veridianWatcherQuotes).where(eq(veridianWatcherQuotes.id, id));
  }
}

export const storage = new DatabaseStorage();
