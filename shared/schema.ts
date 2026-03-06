import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer } from "drizzle-orm/pg-core";
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
  petLevel: integer("pet_level").notNull().default(0),
  petLevelPoints: integer("pet_level_points").notNull().default(0),
  itemsUsedThisLevel: integer("items_used_this_level").notNull().default(0),
  petNickname: text("pet_nickname"),
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
  posX: integer("pos_x").notNull().default(40),
  posY: integer("pos_y").notNull().default(40),
  shopkeeperId: varchar("shopkeeper_id"),
  shopkeeperName: text("shopkeeper_name"),
  shopkeeperImageUrl: text("shopkeeper_image_url"),
  ownerImageUrl: text("owner_image_url"),
  isShop: boolean("is_shop").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
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
  posX: integer("pos_x").notNull().default(50),
  posY: integer("pos_y").notNull().default(50),
  iconSize: integer("icon_size").notNull().default(28),
  glowColor: text("glow_color").notNull().default("#ffd700"),
  isDefault: boolean("is_default").notNull().default(false),
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
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers"),
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

export type CoinPurchase = typeof coinPurchases.$inferSelect;
export type WorldLocation = typeof worldLocations.$inferSelect;
export type World = typeof worlds.$inferSelect;
export type GameSetting = typeof gameSettings.$inferSelect;
export type LocationObject = typeof locationObjects.$inferSelect;
export type PetTemplate = typeof petTemplates.$inferSelect;
export type PetTemplatePart = typeof petTemplateParts.$inferSelect;
export type LocationEnemy = typeof locationEnemies.$inferSelect;
export type EnemyDrop = typeof enemyDrops.$inferSelect;
