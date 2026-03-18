import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  profileImage: text("profile_image"),
  coins: integer("coins").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  activePetId: varchar("active_pet_id"),
  lastUsernameChange: timestamp("last_username_change"),
  lastProfilePicChange: timestamp("last_profile_pic_change"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  marketExtraSlots: integer("market_extra_slots").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const shopItems = pgTable("shop_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  type: text("type").notNull(),
  worldId: text("world_id").notNull(),
  locationId: varchar("location_id"),
  imageUrl: text("image_url"),
  rarity: integer("rarity"),
  hatchTime: integer("hatch_time"),
  eggImageUrl: text("egg_image_url"),
  hatchedImageUrl: text("hatched_image_url"),
  statBoostType: text("stat_boost_type"),
  statBoostAmount: integer("stat_boost_amount"),
  petTemplateId: varchar("pet_template_id"),
  specialSkill: text("special_skill"),
  healthRestored: integer("health_restored"),
  manaRestored: integer("mana_restored"),
  petsRevived: integer("pets_revived"),
  atkBoost: integer("atk_boost"),
  defBoost: integer("def_boost"),
  specialType: text("special_type"),
  specialAmount: integer("special_amount"),
  shopPosX: real("shop_pos_x").notNull().default(50),
  shopPosY: real("shop_pos_y").notNull().default(50),
  shopWidth: integer("shop_width").notNull().default(72),
  fishingType: text("fishing_type"),
  hooklessImageUrl: text("hookless_image_url"),
  rareCatchBoostPercent: integer("rare_catch_boost_percent"),
  rarityBoostPercent: integer("rarity_boost_percent"),
  starRarity: integer("star_rarity"),
  poleMaxUses: integer("pole_max_uses"),
  facingDirection: text("facing_direction"),
  poleSlowdown3: real("pole_slowdown_3"),
  poleSlowdown4: real("pole_slowdown_4"),
  poleSlowdown5: real("pole_slowdown_5"),
  fishSwimZone: text("fish_swim_zone"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const userInventory = pgTable("user_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  acquiredAt: timestamp("acquired_at").notNull().default(sql`now()`),
  hatchStartedAt: timestamp("hatch_started_at"),
  isHatched: boolean("is_hatched").notNull().default(false),
  petHealth: integer("pet_health").notNull().default(1000),
  petAtk: integer("pet_atk").notNull().default(50),
  petDef: integer("pet_def").notNull().default(50),
  petLevel: integer("pet_level").notNull().default(1),
  petLevelPoints: integer("pet_level_points").notNull().default(0),
  itemsUsedThisLevel: integer("items_used_this_level").notNull().default(0),
  petNickname: text("pet_nickname"),
  isListed: boolean("is_listed").notNull().default(false),
  poleUsesLeft: integer("pole_uses_left"),
});

export const rewardBundles = pgTable("reward_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  message: text("message"),
  coinAmount: integer("coin_amount").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const rewardBundleItems = pgTable("reward_bundle_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
});

export const userRewards = pgTable("user_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  bundleId: varchar("bundle_id").notNull(),
  claimed: boolean("claimed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const worldLocations = pgTable("world_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  iconUrl: text("icon_url"),
  bgUrl: text("bg_url"),
  description: text("description"),
  posX: real("pos_x").notNull().default(40),
  posY: real("pos_y").notNull().default(40),
  flipped: boolean("flipped").notNull().default(false),
  shopkeeperId: varchar("shopkeeper_id"),
  shopkeeperName: text("shopkeeper_name"),
  shopkeeperImageUrl: text("shopkeeper_image_url"),
  ownerImageUrl: text("owner_image_url"),
  isShop: boolean("is_shop").notNull().default(false),
  glowColor: text("glow_color"),
  sortOrder: integer("sort_order").notNull().default(0),
  iconSize: integer("icon_size").notNull().default(200),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const locationObjects = pgTable("location_objects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull(),
  imageUrl: text("image_url").notNull(),
  posX: integer("pos_x").notNull().default(50),
  posY: integer("pos_y").notNull().default(50),
  width: integer("width").notNull().default(80),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const worlds = pgTable("worlds", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  iconUrl: text("icon_url"),
  bgUrl: text("bg_url"),
  skyImageUrl: text("sky_image_url"),
  groundImageUrl: text("ground_image_url"),
  posX: integer("pos_x").notNull().default(50),
  posY: integer("pos_y").notNull().default(50),
  iconSize: integer("icon_size").notNull().default(28),
  glowColor: text("glow_color").notNull().default("#ffd700"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const worldBuildings = pgTable("world_buildings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  side: text("side").notNull().default("left"),
  posY: integer("pos_y").notNull().default(50),
  destinationPage: text("destination_page"),
  destinationLocationId: varchar("destination_location_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const gameSettings = pgTable("game_settings", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
});

export const petTemplates = pgTable("pet_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  frontAssembled: text("front_assembled"),
  backAssembled: text("back_assembled"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const petTemplateParts = pgTable("pet_template_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull(),
  partType: text("part_type").notNull(),
  view: text("view").notNull().default("front"),
  imageUrl: text("image_url").notNull(),
  posX: integer("pos_x").notNull().default(0),
  posY: integer("pos_y").notNull().default(0),
  width: integer("width").notNull().default(100),
  height: integer("height").notNull().default(100),
  zIndex: integer("z_index").notNull().default(0),
  pivotX: integer("pivot_x").notNull().default(50),
  pivotY: integer("pivot_y").notNull().default(50),
});

export const petEquippedAccessories = pgTable("pet_equipped_accessories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  petInventoryId: varchar("pet_inventory_id").notNull(),
  accessoryInventoryId: varchar("accessory_inventory_id").notNull(),
  slot: integer("slot").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type PetEquippedAccessory = typeof petEquippedAccessories.$inferSelect;

export const coinPurchases = pgTable("coin_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  amountUsd: integer("amount_usd").notNull(),
  coinsReceived: integer("coins_received").notNull(),
  stripeSessionId: text("stripe_session_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
  profileImage: true,
  isAdmin: true,
  coins: true,
});

export const insertShopItemSchema = createInsertSchema(shopItems).omit({
  id: true,
  createdAt: true,
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const updateUsernameSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

export const updateProfilePicSchema = z.object({
  profileImage: z.string(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginData = z.infer<typeof loginSchema>;
export type ShopItem = typeof shopItems.$inferSelect;
export type InsertShopItem = z.infer<typeof insertShopItemSchema>;
export type UserInventoryItem = typeof userInventory.$inferSelect;
export type RewardBundle = typeof rewardBundles.$inferSelect;
export type RewardBundleItem = typeof rewardBundleItems.$inferSelect;
export type UserReward = typeof userRewards.$inferSelect;
export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertSupportMessageSchema = createInsertSchema(supportMessages).omit({ id: true, isRead: true, createdAt: true });
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type SupportMessage = typeof supportMessages.$inferSelect;

export const locationEnemies = pgTable("location_enemies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  isBoss: boolean("is_boss").notNull().default(false),
  coinReward: integer("coin_reward").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const enemyDrops = pgTable("enemy_drops", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enemyId: varchar("enemy_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  dropRate: integer("drop_rate").notNull().default(10),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const badges = pgTable("badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  badgeId: varchar("badge_id").notNull(),
  awardedAt: timestamp("awarded_at").notNull().default(sql`now()`),
});

export const fishTemplateParts = pgTable("fish_template_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fishItemId: varchar("fish_item_id").notNull(),
  partType: text("part_type").notNull(),
  imageUrl: text("image_url").notNull(),
  posX: integer("pos_x").notNull().default(100),
  posY: integer("pos_y").notNull().default(100),
  width: integer("width").notNull().default(200),
  height: integer("height").notNull().default(200),
  zIndex: integer("z_index").notNull().default(1),
});

export const pondFish = pgTable("pond_fish", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const playerFishInventory = pgTable("player_fish_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  caughtAt: timestamp("caught_at").notNull().default(sql`now()`),
});

export const playerFishingEquipment = pgTable("player_fishing_equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  poleInventoryId: varchar("pole_inventory_id"),
  baitInventoryId: varchar("bait_inventory_id"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const playerMarketListings = pgTable("player_market_listings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull(),
  sellerName: text("seller_name").notNull(),
  inventoryId: varchar("inventory_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  itemName: text("item_name").notNull(),
  itemImageUrl: text("item_image_url"),
  itemType: text("item_type").notNull(),
  price: integer("price").notNull(),
  status: text("status").notNull().default("active"),
  buyerId: varchar("buyer_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type PlayerMarketListing = typeof playerMarketListings.$inferSelect;

export const worldDecorItems = pgTable("world_decor_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const worldDecorPlacements = pgTable("world_decor_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: text("world_id").notNull(),
  decorItemId: varchar("decor_item_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  posX: real("pos_x").notNull().default(45),
  posY: real("pos_y").notNull().default(45),
  size: integer("size").notNull().default(100),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const fishBarrels = pgTable("fish_barrels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: text("world_id").notNull(),
  posX: real("pos_x").notNull().default(50),
  posY: real("pos_y").notNull().default(50),
  size: integer("size").notNull().default(80),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type CoinPurchase = typeof coinPurchases.$inferSelect;
export type WorldLocation = typeof worldLocations.$inferSelect;
export type World = typeof worlds.$inferSelect;
export type WorldBuilding = typeof worldBuildings.$inferSelect;
export type GameSetting = typeof gameSettings.$inferSelect;
export type LocationObject = typeof locationObjects.$inferSelect;
export type PetTemplate = typeof petTemplates.$inferSelect;
export type PetTemplatePart = typeof petTemplateParts.$inferSelect;
export type LocationEnemy = typeof locationEnemies.$inferSelect;
export type EnemyDrop = typeof enemyDrops.$inferSelect;
export type Badge = typeof badges.$inferSelect;
export type UserBadge = typeof userBadges.$inferSelect;
export type FishTemplatePart = typeof fishTemplateParts.$inferSelect;
export type PondFish = typeof pondFish.$inferSelect;
export type PlayerFishInventory = typeof playerFishInventory.$inferSelect;
export type PlayerFishingEquipment = typeof playerFishingEquipment.$inferSelect;
export type WorldDecorItem = typeof worldDecorItems.$inferSelect;
export type WorldDecorPlacement = typeof worldDecorPlacements.$inferSelect;
export type FishBarrel = typeof fishBarrels.$inferSelect;
