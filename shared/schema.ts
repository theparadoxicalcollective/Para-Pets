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
  imageUrl: text("image_url"),
  rarity: integer("rarity"),
  hatchTime: integer("hatch_time"),
  eggImageUrl: text("egg_image_url"),
  hatchedImageUrl: text("hatched_image_url"),
  statBoostType: text("stat_boost_type"),
  statBoostAmount: integer("stat_boost_amount"),
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
  itemsUsedThisLevel: integer("items_used_this_level").notNull().default(0),
});

export const rewardBundles = pgTable("reward_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
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
