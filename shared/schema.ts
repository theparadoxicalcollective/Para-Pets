import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, timestamp, integer, real, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  profileImage: text("profile_image"),
  coins: integer("coins").notNull().default(0),
  essence: integer("essence").notNull().default(1000),
  raidTotalDamage: integer("raid_total_damage").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  isModerator: boolean("is_moderator").notNull().default(false),
  // Marks server-managed PvP bot accounts so they're excluded from public
  // leaderboards (Hall of Earnings, Devotion, PvP) but still surface in
  // PvP opponent matchmaking.
  isBot: boolean("is_bot").notNull().default(false),
  isBanned: boolean("is_banned").notNull().default(false),
  banUntil: timestamp("ban_until"),
  activePetId: varchar("active_pet_id"),
  activeHouseBundleId: varchar("active_house_bundle_id"),
  lastUsernameChange: timestamp("last_username_change"),
  lastProfilePicChange: timestamp("last_profile_pic_change"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  marketExtraSlots: integer("market_extra_slots").notNull().default(0),
  accessoryExtraSlots: integer("accessory_extra_slots").notNull().default(0),
  welcomeV2Sent: boolean("welcome_v2_sent").notNull().default(false),
  totalCoinsEarned: integer("total_coins_earned").notNull().default(0),
  totalFishCaught: integer("total_fish_caught").notNull().default(0),
  watcherShoutoutsEnabled: boolean("watcher_shoutouts_enabled").notNull().default(true),
  lastWatcherGreetedAt: timestamp("last_watcher_greeted_at"),
  // Daily pet-petting reward: timestamp of the last time the player claimed
  // the +10 coins for petting a pet on the Care page.
  lastPettingRewardAt: timestamp("last_petting_reward_at"),
  // Number of petting rewards already granted today (UTC). Resets when a new
  // UTC day begins. First petting of the day is always a guaranteed 10-coin
  // grant; up to 4 additional random grants (3-5 coins each) follow.
  pettingRewardsToday: integer("petting_rewards_today").notNull().default(0),
  moltenBlocksHighScore: integer("molten_blocks_high_score").notNull().default(0),
  tutorial_hatch_potions_claimed: boolean("tutorial_hatch_potions_claimed").notNull().default(false),
  tutorial_reward_claimed: boolean("tutorial_reward_claimed").notNull().default(false),
  tutorial_quest_completed: boolean("tutorial_quest_completed").notNull().default(false),
  signup_referrer: text("signup_referrer"),
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
  specialSkillType: text("special_skill_type"),
  healthRestored: integer("health_restored"),
  manaRestored: integer("mana_restored"),
  petsRevived: integer("pets_revived"),
  petsHealed: integer("pets_healed"),
  atkBoost: integer("atk_boost"),
  defBoost: integer("def_boost"),
  healthBoost: integer("health_boost"),
  specialType: text("special_type"),
  specialAmount: integer("special_amount"),
  shopPosX: real("shop_pos_x").notNull().default(50),
  shopPosY: real("shop_pos_y").notNull().default(50),
  shopWidth: integer("shop_width").notNull().default(72),
  fishingType: text("fishing_type"),
  // For type === "fishing" + fishingType === "fish": when true, this fish
  // uses the extended "Sea Animal" parts layer set (head_accessory,
  // eyes_open, head, front_arm/leg, body, back_arm/leg, back_accessory,
  // tail_1/2/3) instead of the standard fish parts. The aquarium
  // renderer keys off this flag to pick the right layer order + per-part
  // animations.
  isSeaAnimal: boolean("is_sea_animal").notNull().default(false),
  hooklessImageUrl: text("hookless_image_url"),
  rarityBoostPercent: integer("rarity_boost_percent"),
  starRarity: integer("star_rarity"),
  poleMaxUses: integer("pole_max_uses"),
  facingDirection: text("facing_direction"),
  poleSlowdown3: real("pole_slowdown_3"),
  poleSlowdown4: real("pole_slowdown_4"),
  poleSlowdown5: real("pole_slowdown_5"),
  baitCatchBoost: integer("bait_catch_boost"),
  baitRarityBoostStar: integer("bait_rarity_boost_star"),
  fishSwimZone: text("fish_swim_zone"),
  catchEasePercent: integer("catch_ease_percent"),
  skillDamagePercent: integer("skill_damage_percent"),
  skillHealPercent: integer("skill_heal_percent"),
  skillType: text("skill_type"),
  skillAffects: text("skill_affects"),
  // For type === "gift": how many loyalty points this gift awards when given
  // to a pet on the Pet Care page (cap 1000 per pet).
  giftPoints: integer("gift_points"),
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
  // Feed points are accumulated when edibles are fed to a pet. They are a
  // separate currency from pet level/XP and do not auto-level the pet.
  petFeedPoints: integer("pet_feed_points").notNull().default(0),
  // Hunger meter — current points where MAX = pet_health. Decays only while
  // the pet is placed in the pet house (inside or outside). Refilled by
  // feeding edibles (each edible's stat-boost amount = hunger pts restored).
  // -1 = "uninitialized" (treated as full on first read so existing pets
  // don't appear starving on day one).
  petHunger: integer("pet_hunger").notNull().default(-1),
  // Mood meter 0-100. Stays at 100 while hunger > 0; once hunger hits zero
  // it drains slowly the longer the pet is neglected. Feeding bumps it back.
  petMood: integer("pet_mood").notNull().default(100),
  // Last time we applied time-based hunger/mood decay for this pet.
  petStatsUpdatedAt: timestamp("pet_stats_updated_at").notNull().default(sql`now()`),
  petNickname: text("pet_nickname"),
  isListed: boolean("is_listed").notNull().default(false),
  poleUsesLeft: integer("pole_uses_left"),
  quantity: integer("quantity").notNull().default(1),
  // Per-pet petting reward tracking. Each pet has its own daily allotment
  // (1 guaranteed +10 coin reward + up to 4 random extras), so a player
  // visiting Pet Care for each of their pets gets coins from each one.
  lastPettingRewardAt: timestamp("last_petting_reward_at"),
  pettingRewardsToday: integer("petting_rewards_today").notNull().default(0),
  // Loyalty meter 0-1000. Only increases when a "gift" item is given to the
  // pet on the Pet Care page (each gift adds shopItem.giftPoints).
  petLoyalty: integer("pet_loyalty").notNull().default(0),
  // Care timestamps used by the mood-decay algorithm to penalise neglect.
  lastFedAt: timestamp("last_fed_at"),
  lastPettedAt: timestamp("last_petted_at"),
  // Sliding 1-hour window for mood-boosting pets. Up to 3 mood bumps per
  // window; once it expires the next petting opens a fresh window.
  moodPettingWindowStart: timestamp("mood_petting_window_start"),
  moodPettingCount: integer("mood_petting_count").notNull().default(0),
  // Set whenever this pet (as the active pet) is defeated in a world battle
  // or its player loses a PvP battle.
  lastBattleDefeatAt: timestamp("last_battle_defeat_at"),
  // XP boost granted by the loyalty reward. xpBoostUntil is the expiry time.
  xpBoostUntil: timestamp("xp_boost_until"),
  xpBoostPct: integer("xp_boost_pct").notNull().default(0),
  // Extra accessory slots purchased for THIS pet specifically (max 2).
  // Base slots = 3, so a pet can have up to 5 total.
  accessoryExtraSlots: integer("accessory_extra_slots").notNull().default(0),
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
  facing: text("facing").default("front"),
  frontAssembled: text("front_assembled"),
  backAssembled: text("back_assembled"),
  sleepingImageUrl: text("sleeping_image_url"),
  canFly: boolean("can_fly").notNull().default(false),
  // True for pets created from the Test Animator sandbox. They are isolated
  // from the live game (filtered out of the regular admin pet list) so admins
  // can experiment with parts without polluting real gameplay data.
  isTest: boolean("is_test").notNull().default(false),
  // Per-template idle animation style. null = standard behaviour. Set to
  // "marionette" for the Haunted Marionette so its above_head, body, arms,
  // and accessories animate with puppet-specific timing.
  idleStyle: text("idle_style"),
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
  essence: true,
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
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/, "Username can only contain letters, numbers, underscores, and periods (periods cannot be at the start or end)"),
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

export const adminMessages = pgTable("admin_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type AdminMessage = typeof adminMessages.$inferSelect;

export const locationEnemies = pgTable("location_enemies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  isBoss: boolean("is_boss").notNull().default(false),
  isMiniBoss: boolean("is_mini_boss").notNull().default(false),
  archetype: text("archetype").notNull().default("balanced"),
  bossSpecialAttack: text("boss_special_attack"),
  coinReward: integer("coin_reward").notNull().default(0),
  caveTier: integer("cave_tier"),
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
  dailyRewardCoins: integer("daily_reward_coins"),
  claimType: text("claim_type").notNull().default("daily"),
  badgePoints: integer("badge_points").notNull().default(0),
  rarity: text("rarity").notNull().default("common"),
  obtainDescription: text("obtain_description"),
  hidden: boolean("hidden").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  badgeId: varchar("badge_id").notNull(),
  awardedAt: timestamp("awarded_at").notNull().default(sql`now()`),
});

export const badgeRewardClaims = pgTable("badge_reward_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  badgeId: varchar("badge_id").notNull(),
  lastClaimedAt: timestamp("last_claimed_at").notNull().default(sql`now()`),
});

// Emblems are PvP-arena trophies awarded for ranked play (placeholder
// table: created/listed/deleted via admin only for now). Once the rank
// reward flow is built we'll add a `user_emblems` join — until then the
// table just holds the catalog of available emblems.
export const emblems = pgTable("emblems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});
export type Emblem = typeof emblems.$inferSelect;

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
}, (t) => [uniqueIndex("uq_pond_fish_location_item").on(t.locationId, t.shopItemId)]);

export const playerFishInventory = pgTable("player_fish_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  caughtAt: timestamp("caught_at").notNull().default(sql`now()`),
  inAquarium: boolean("in_aquarium").notNull().default(false),
  aquariumSlot: text("aquarium_slot").notNull().default("main"),
});

export const playerFishCatchLog = pgTable("player_fish_catch_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  firstCaughtAt: timestamp("first_caught_at").notNull().default(sql`now()`),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
});

export type PlayerFishCatchLog = typeof playerFishCatchLog.$inferSelect;

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
  flipped: boolean("flipped").notNull().default(false),
  message: text("message"),
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

// ── PvP Arena ────────────────────────────────────────────────────────────────
export const pvpBattles = pgTable("pvp_battles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  opponentName: text("opponent_name").notNull(),
  opponentImageUrl: text("opponent_image_url"),
  opponentLevel: integer("opponent_level").notNull().default(1),
  opponentSkill: text("opponent_skill"),
  result: text("result").notNull(), // 'win' | 'loss'
  coinsEarned: integer("coins_earned").notNull().default(0),
  battlePointsDelta: integer("battle_points_delta").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertPvpBattleSchema = createInsertSchema(pvpBattles).omit({ id: true, createdAt: true });
export type InsertPvpBattle = z.infer<typeof insertPvpBattleSchema>;
export type PvpBattle = typeof pvpBattles.$inferSelect;

export const pvpBattleGroups = pgTable("pvp_battle_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique(),
  petInventoryIds: text("pet_inventory_ids").array().notNull().default(sql`'{}'::text[]`),
  // Cached "power rating" of the saved team. Used to match players against
  // opponents within a safe range so smaller players don't get farmed.
  attackPower: integer("attack_power").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertPvpBattleGroupSchema = createInsertSchema(pvpBattleGroups).omit({ id: true, updatedAt: true });
export type InsertPvpBattleGroup = z.infer<typeof insertPvpBattleGroupSchema>;
export type PvpBattleGroup = typeof pvpBattleGroups.$inferSelect;

// One-time tokens issued by /api/pvp/start when a ticket is consumed. The
// matching /api/pvp/result call MUST present the token, and the row is
// deleted on use. This makes the result endpoint un-callable without first
// paying a ticket — i.e. you can't farm BP/coins by hitting /result directly.
export const pvpBattleTokens = pgTable("pvp_battle_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});
export type PvpBattleToken = typeof pvpBattleTokens.$inferSelect;

// ── World pet positions ──────────────────────────────────────────────────────
export const worldPetPositions = pgTable("world_pet_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: text("world_id").notNull(),
  ownerUserId: varchar("owner_user_id").notNull(),
  posX: real("pos_x").notNull().default(50),
  posY: real("pos_y").notNull().default(75),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => [uniqueIndex("world_pet_positions_world_owner_uidx").on(t.worldId, t.ownerUserId)]);

// ── Friendships ─────────────────────────────────────────────────────────────
export const friendships = pgTable("friendships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").notNull(),
  receiverId: varchar("receiver_id").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "accepted"
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type Friendship = typeof friendships.$inferSelect;

// ── Notifications ────────────────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type Notification = typeof notifications.$inferSelect;

// ── Pet house positions ──────────────────────────────────────────────────────
export const petHousePositions = pgTable("pet_house_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  inventoryId: varchar("inventory_id").notNull(),
  posLeft: text("pos_left").notNull(),
  posTop: text("pos_top").notNull(),
  location: text("location").notNull().default("outside"),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (t) => [uniqueIndex("pet_house_positions_user_inv_uidx").on(t.userId, t.inventoryId)]);

// ── Enemy Database ────────────────────────────────────────────────────────────
export const enemies = pgTable("enemies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  atk: integer("atk").notNull().default(10),
  health: integer("health").notNull().default(100),
  isBoss: boolean("is_boss").notNull().default(false),
  archetype: text("archetype").notNull().default("balanced"),
  special1: text("special1"),
  special2: text("special2"),
  special3: text("special3"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const enemyParts = pgTable("enemy_parts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enemyId: varchar("enemy_id").notNull(),
  partType: text("part_type").notNull(),
  imageUrl: text("image_url").notNull(),
  posX: integer("pos_x").notNull().default(100),
  posY: integer("pos_y").notNull().default(100),
  width: integer("width").notNull().default(200),
  height: integer("height").notNull().default(200),
  zIndex: integer("z_index").notNull().default(1),
});

export const insertEnemySchema = createInsertSchema(enemies).omit({ id: true, createdAt: true });
export type InsertEnemy = z.infer<typeof insertEnemySchema>;
export type Enemy = typeof enemies.$inferSelect;
export type EnemyPart = typeof enemyParts.$inferSelect;

// ── Keeper's Central Spawned Enemies ─────────────────────────────────────────
export const keepersCentralEnemies = pgTable("keepers_central_enemies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enemyId: varchar("enemy_id").notNull(),
  spawnX: real("spawn_x").notNull().default(50),
  spawnY: real("spawn_y").notNull().default(50),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type KeepersCentralEnemy = typeof keepersCentralEnemies.$inferSelect;

// ── Keeper's Central Doors ────────────────────────────────────────────────────
export const kcDoors = pgTable("kc_doors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  worldId: text("world_id").notNull().default("pet_world"),
  name: text("name").notNull().default("Door"),
  posX: real("pos_x").notNull().default(50),
  posY: real("pos_y").notNull().default(60),
  triggerRadius: integer("trigger_radius").notNull().default(6),
  bgUrl: text("bg_url"),
  isShop: boolean("is_shop").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const kcDoorDecorPlacements = pgTable("kc_door_decor_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  doorId: varchar("door_id").notNull(),
  name: text("name").notNull(),
  imageUrl: text("image_url").notNull(),
  posX: real("pos_x").notNull().default(45),
  posY: real("pos_y").notNull().default(45),
  size: integer("size").notNull().default(100),
  flipped: boolean("flipped").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type KcDoor = typeof kcDoors.$inferSelect;
export type KcDoorDecorPlacement = typeof kcDoorDecorPlacements.$inferSelect;

// ── House Bundles ─────────────────────────────────────────────────────────────
export const houseBundles = pgTable("house_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  shopImageUrl: text("shop_image_url"),
  bgImageUrl: text("bg_image_url"),
  price: integer("price").notNull().default(0),
  giftNotificationX: real("gift_notification_x").notNull().default(0.05),
  giftNotificationY: real("gift_notification_y").notNull().default(0.85),
  maxOutdoorPets: integer("max_outdoor_pets").notNull().default(6),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const houseBundleBuildings = pgTable("house_bundle_buildings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bundleId: varchar("bundle_id").notNull(),
  name: text("name").notNull().default("Building"),
  imageUrl: text("image_url").notNull(),
  posX: real("pos_x").notNull().default(50),
  posY: real("pos_y").notNull().default(50),
  width: integer("width").notNull().default(120),
  flippedX: boolean("flipped_x").notNull().default(false),
  interiorImageUrl: text("interior_image_url"),
  size: text("size").notNull().default("medium"),
  leaveButtonX: real("leave_button_x").notNull().default(0.92),
  leaveButtonY: real("leave_button_y").notNull().default(0.06),
  maxPets: integer("max_pets"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Capacity limits per building size (pets, decor items)
export const BUILDING_SIZE_CAPACITY = {
  small:  { pets: 3, items: 3 },
  medium: { pets: 5, items: 6 },
  large:  { pets: 7, items: 9 },
} as const;
export type BuildingSize = keyof typeof BUILDING_SIZE_CAPACITY;

export type HouseBundle = typeof houseBundles.$inferSelect;
export type HouseBundleBuilding = typeof houseBundleBuildings.$inferSelect;

// ── Home Decor Items ──────────────────────────────────────────────────────────
export const homeDecorItems = pgTable("home_decor_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  imageUrl: text("image_url"),
  price: integer("price").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type HomeDecorItem = typeof homeDecorItems.$inferSelect;

// ── User House Bundles (ownership) ────────────────────────────────────────────
export const userHouseBundles = pgTable("user_house_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  bundleId: varchar("bundle_id").notNull(),
  purchasedAt: timestamp("purchased_at").notNull().default(sql`now()`),
});

export type UserHouseBundle = typeof userHouseBundles.$inferSelect;

// ── Location House Bundles (shop stock) ───────────────────────────────────────
export const locationHouseBundles = pgTable("location_house_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull(),
  bundleId: varchar("bundle_id").notNull(),
});

export type LocationHouseBundle = typeof locationHouseBundles.$inferSelect;

// ── Location Home Decor (shop stock) ──────────────────────────────────────────
export const locationHomeDecor = pgTable("location_home_decor", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull(),
  decorId: varchar("decor_id").notNull(),
});

export type LocationHomeDecor = typeof locationHomeDecor.$inferSelect;

// ── Player Home Decor Inventory ───────────────────────────────────────────────
export const userHomeDecorInventory = pgTable("user_home_decor_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  decorItemId: varchar("decor_item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export type UserHomeDecorInventory = typeof userHomeDecorInventory.$inferSelect;

// ── Placed Home Decor (on canvas) ─────────────────────────────────────────────
export const placedHomeDecor = pgTable("placed_home_decor", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  decorItemId: varchar("decor_item_id").notNull(),
  xPct: real("x_pct").notNull().default(0.5),
  yPct: real("y_pct").notNull().default(0.5),
  size: integer("size").notNull().default(250),
  flipped: boolean("flipped").notNull().default(false),
  location: varchar("location").notNull().default("outside"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type PlacedHomeDecor = typeof placedHomeDecor.$inferSelect;

// ── Player Gifts ──────────────────────────────────────────────────────────────
export const gifts = pgTable("gifts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull(),
  receiverId: varchar("receiver_id").notNull(),
  message: text("message"),
  coinAmount: integer("coin_amount").notNull().default(0),
  itemType: text("item_type"), // null (coins only) | 'shop_item' | 'decor'
  shopItemId: varchar("shop_item_id"),           // shopItems.id — for re-adding to receiver
  shopItemInventoryId: varchar("shop_item_inventory_id"), // userInventory.id — sender's slot
  decorItemId: varchar("decor_item_id"),          // homeDecorItems.id
  itemQuantity: integer("item_quantity").notNull().default(1),
  itemName: text("item_name"),
  itemImageUrl: text("item_image_url"),
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted'
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  expiresAt: timestamp("expires_at"), // null = never expires; set to 30 days from creation for system gifts
});

export type Gift = typeof gifts.$inferSelect;

// ── Deleted Account Email Cooldown ────────────────────────────────────────────
export const deletedAccounts = pgTable("deleted_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  deletedAt: timestamp("deleted_at").notNull().default(sql`now()`),
});

export type DeletedAccount = typeof deletedAccounts.$inferSelect;

// ── World Chat ────────────────────────────────────────────────────────────────
export const worldChatMessages = pgTable("world_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  username: varchar("username").notNull(),
  profileImage: text("profile_image"),
  message: text("message").notNull(),
  isBot: boolean("is_bot").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type WorldChatMessage = typeof worldChatMessages.$inferSelect;

// ── Veridian Watcher Quotes ───────────────────────────────────────────────────
export const veridianWatcherQuotes = pgTable("veridian_watcher_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  message: text("message").notNull(),
  addedBy: varchar("added_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type VeridianWatcherQuote = typeof veridianWatcherQuotes.$inferSelect;

// ── Founders ──────────────────────────────────────────────────────────────────
// Curated list of names shown on the public Founders page as a thank-you to
// people who supported the artist and made the game possible. Maintained
// exclusively by admins (see /api/founders endpoints). Stored as freeform
// text so an admin can write the name however they want — display name,
// real name, handle, etc. — without coupling to the user table.
export const founders = pgTable("founders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 120 }).notNull(),
  addedBy: varchar("added_by"),
  tier: varchar("tier", { length: 12 }),
  userId: varchar("user_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type Founder = typeof founders.$inferSelect;

// ── Purchase Monthly Progress ─────────────────────────────────────────────────
export const purchaseMonthlyProgress = pgTable("purchase_monthly_progress", {
  userId: varchar("user_id").notNull(),
  monthYear: varchar("month_year", { length: 7 }).notNull(),
  points: integer("points").notNull().default(0),
});

// ── Purchase Milestone Claims ─────────────────────────────────────────────────
export const purchaseMilestoneClaims = pgTable("purchase_milestone_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  milestonePoints: integer("milestone_points").notNull(),
  monthYear: varchar("month_year", { length: 7 }).notNull(),
  claimedAt: timestamp("claimed_at").notNull().default(sql`now()`),
});

// ── Purchase Milestone Rewards (admin-configured) ─────────────────────────────
export const purchaseMilestoneRewards = pgTable("purchase_milestone_rewards", {
  milestonePoints: integer("milestone_points").primaryKey(),
  rewardCoins: integer("reward_coins").default(0),
  rewardItemId: varchar("reward_item_id"),
  rewardItemName: varchar("reward_item_name"),
  rewardItemImageUrl: varchar("reward_item_image_url"),
  rewardLabel: varchar("reward_label", { length: 120 }),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// ── Chat Filter Words ─────────────────────────────────────────────────────────
export const chatFilterWords = pgTable("chat_filter_words", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  word: varchar("word", { length: 100 }).notNull().unique(),
  addedBy: varchar("added_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type ChatFilterWord = typeof chatFilterWords.$inferSelect;

// ── Runtime-managed tables ────────────────────────────────────────────────────
// These tables are created at boot via raw `CREATE TABLE IF NOT EXISTS` in
// server/index.ts (session by connect-pg-simple, the others by ad-hoc
// migrations). They are declared here ONLY so drizzle-kit push doesn't see
// them as "untracked" and offer to drop them on every deploy. Don't query
// these via the drizzle client — use the existing raw-sql helpers instead.

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const mediaBlobs = pgTable("media_blobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const appMigrations = pgTable("app_migrations", {
  key: text("key").primaryKey(),
  runAt: timestamp("run_at").notNull().default(sql`now()`),
});

export const dailyLoginRewards = pgTable("daily_login_rewards", {
  dayNumber: integer("day_number").primaryKey(),
  coinAmount: integer("coin_amount").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const dailyLoginRewardItems = pgTable("daily_login_reward_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dayNumber: integer("day_number").notNull(),
  shopItemId: varchar("shop_item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
});

export const playerDailyLoginClaims = pgTable("player_daily_login_claims", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  cycleNumber: integer("cycle_number").notNull().default(0),
  dayNumber: integer("day_number").notNull(),
  claimedAt: timestamp("claimed_at").notNull().default(sql`now()`),
});

export const dailyQuests = pgTable("daily_quests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  questKey: text("quest_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  targetCount: integer("target_count").notNull().default(1),
  coinReward: integer("coin_reward").notNull().default(0),
  rewardItemId: varchar("reward_item_id"),
  isActive: boolean("is_active").notNull().default(true),
});

export const userDailyQuestProgress = pgTable("user_daily_quest_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  questKey: text("quest_key").notNull(),
  questDate: text("quest_date").notNull(),
  progress: integer("progress").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  rewardClaimed: boolean("reward_claimed").notNull().default(false),
});

export const userQuestLogState = pgTable("user_quest_log_state", {
  userId: varchar("user_id").primaryKey(),
  lastOpenedDate: text("last_opened_date"),
  hasUnseenCompletion: boolean("has_unseen_completion").notNull().default(false),
});

export type DailyQuest = typeof dailyQuests.$inferSelect;
export type UserDailyQuestProgress = typeof userDailyQuestProgress.$inferSelect;

// Runtime table — managed by raw SQL in server/index.ts.
// Declared here so drizzle-kit treats it as tracked.
export const moltenBlocksDropItems = pgTable("molten_blocks_drop_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopItemId: varchar("shop_item_id").notNull(),
  rarity: varchar("rarity", { length: 16 }).notNull().default("common"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// Runtime table — managed by raw SQL in server/index.ts.
// Declared here so drizzle-kit treats it as tracked.
// Per-(user, world) fishing points. Starts empty: only catches made after this
// feature shipped accrue points, so old catches are never counted.
export const fishingLeaderboard = pgTable("fishing_leaderboard", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  worldId: varchar("world_id").notNull(),
  points: integer("points").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});
