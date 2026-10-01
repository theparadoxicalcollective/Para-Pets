import { resolvePetArtwork } from "./petArtwork";
import { processEvolutionImageUpdate } from "./evolutionImageUpload";
import { AccountConflictError } from "./accounts/errors";
import { publicAccount } from "./accounts/publicAccount";
import { grantWelcomeBundle } from "./accounts/welcomeBundle";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { insertUserSchema, updateUsernameSchema, insertShopItemSchema, rewardBundles, rewardBundleItems, userRewards, userInventory, houseBundles as houseBundlesTable, users as usersTable, coinPurchases, deletedAccounts, petAnimationProfileSchema, petEquippedAccessories } from "@shared/schema";
import { executeRewardClaim } from "./rewardClaim";
import { executeDailyQuestClaim } from "./dailyQuestClaim";
import { registerQuestRoutes } from "./routes/quest.routes";
import { LONELLE_KEY, parseLonelleProgress } from "./lonelleQuest";
import { executeFishCatchRewardClaim } from "./fishCatchRewardClaim";
import { FishSaleError, sellFish } from "./fishSale";
import { db } from "./db";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import sharp from "sharp";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { COIN_PACKAGES } from "./payments/config";
import { fulfillStripePurchase } from "./payments/fulfillStripePurchase";
import { StripePurchaseError } from "./payments/errors";
import { claimPurchaseMilestone } from "./milestones/claimPurchaseMilestone";
import { PurchaseMilestoneError } from "./milestones/errors";
import { requireAdmin, requireAuthenticated } from "./auth";
import { purchaseInventoryItem } from "./inventoryPurchase";
import { tryConsumeInventoryQuantity, tryConsumeOneFromInventory } from "./inventoryConsumption";
import { registerAccountRoutes } from "./routes/account.routes";
import { registerSupportRoutes } from "./routes/support.routes";
import { registerBadgeRoutes, registerPlayerBadgeRoutes } from "./routes/badge.routes";
import { registerFishingAquariumRoutes, registerFishingRoutes, type FishingRouteDependencies } from "./routes/fishing.routes";
import { registerMarketplaceRoutes, type MarketplaceRouteDependencies } from "./routes/marketplace.routes";
import {
  buyListing,
  cancelListing,
  collectProceeds,
  createFishListing,
  createInventoryListing,
} from "./marketplace/transactions";
import { claimTutorialReward, completeTutorial, grantTutorialHatchPotions } from "./tutorial/tutorialService";
import { BEGIN_JOURNEY_TUTORIAL } from "./tutorial/config";
import { invalidTutorialRequest, TutorialError } from "./tutorial/errors";
import { CaveTierLockedError, isCaveTierAccessible } from "./caveProgress";
import { executeAcceptGift, executeSendGift } from "./gifts/transactions";
import { executeDecorPlacement, executeDecorRemoval } from "./housing/decorTransactions";
import { registerGiftRoutes } from "./routes/gift.routes";
import { registerHomeDecorRoutes } from "./routes/homeDecor.routes";
import { registerHouseBundleRoutes } from "./routes/houseBundle.routes";
import { registerPetHouseVisitorRoutes } from "./routes/petHouseVisitor.routes";
import { registerFounderRoutes } from "./routes/founder.routes";
import { registerVeridianWatcherQuoteRoutes } from "./routes/veridianWatcherQuote.routes";
import { registerWatcherShoutoutPreferenceRoutes } from "./routes/watcherShoutoutPreference.routes";
import { registerPetHousePositionRoutes } from "./routes/petHousePosition.routes";
import { registerElysianClearingCombatRoutes } from "./routes/elysianClearingCombat.routes";
import { registerClearingEquipmentRoutes } from "./routes/clearingEquipment.routes";
import { registerClearingAdminRoutes } from "./routes/clearingAdmin.routes";
import { registerClearingShopRoutes } from "./routes/clearingShop.routes";
import { registerSoulExchangeRoutes } from "./routes/soulExchange.routes";
import { registerCostumeAdminRoutes } from "./routes/costumeAdmin.routes";
import { registerCostumePlayerRoutes } from "./routes/costumePlayer.routes";
import { registerMiniPetRoutes } from "./routes/miniPet.routes";
import { registerCardAdminRoutes } from "./routes/cardAdmin.routes";
import { registerNpcPhaseRoutes } from "./routes/npcPhase.routes";
import { registerCardCollectionRoutes } from "./routes/cardCollection.routes";
import { registerRedeemCodeRoutes } from "./routes/redeemCode.routes";
import { registerForumRoutes } from "./routes/forum.routes";
import { registerRaidRoutes } from "./routes/raid.routes";
import { registerPvpRoutes } from "./routes/pvp.routes";
import { registerFriendsRoutes } from "./routes/friends.routes";
import { registerMoltenBlocksRoutes } from "./routes/moltenBlocks.routes";
import { registerEnemyAdminRoutes } from "./routes/enemyAdmin.routes";
import { registerLavaCrawlRoutes } from "./routes/lavaCrawl.routes";
import { registerCauldronRoutes } from "./routes/cauldron.routes";
import { registerMixingTreeRecipeRoutes } from "./routes/mixingTreeRecipe.routes";
import { registerMaintenanceRoutes } from "./routes/maintenance.routes";
import { registerClientErrorRoutes } from "./routes/clientDiagnostics.routes";
import { grantBundleCards, parseBundleCards } from "./cards";
import { getEffectivePetLayer } from "@shared/petLayer";
import { startVeridianWatcherBackgroundJobs } from "./veridianWatcher/backgroundJobs";

type ShopPurchaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function sendTutorialError(res: Response, error: unknown, operation: string) {
  if (error instanceof TutorialError) {
    const status = error.code === "invalid_request" ? 400
      : error.code === "player_not_found" ? 404
      : error.code === "tutorial_not_completed" ? 409
      : error.code === "reward_item_unavailable" ? 503
      : 409;
    return res.status(status).json({ errorCode: error.code, message: error.message });
  }
  console.error(`[tutorial] ${operation} error:`, error);
  return res.status(500).json({ errorCode: "tutorial_operation_failed", message: "Tutorial operation failed" });
}

function requireEmptyTutorialBody(body: unknown): void {
  if (body == null) return;
  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    throw invalidTutorialRequest();
  }
}



// ── Daily Quest helpers ───────────────────────────────────────────────────────
function getCentralDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

async function incrementQuestProgress(userId: string, questKey: string): Promise<void> {
  try {
    const date = getCentralDate();
    const questRes = await db.execute(
      sql`SELECT target_count FROM daily_quests WHERE quest_key = ${questKey} AND is_active = true LIMIT 1`
    );
    if (!questRes.rows[0]) return;
    const targetCount = (questRes.rows[0] as any).target_count as number;

    // Upsert progress row; skip increment if already completed
    const result = await db.execute(sql`
      INSERT INTO user_daily_quest_progress (user_id, quest_key, quest_date, progress, completed)
      VALUES (${userId}, ${questKey}, ${date}, 1, ${1 >= targetCount})
      ON CONFLICT (user_id, quest_key, quest_date) DO UPDATE
      SET
        progress = CASE
          WHEN user_daily_quest_progress.completed THEN user_daily_quest_progress.progress
          ELSE LEAST(${targetCount}, user_daily_quest_progress.progress + 1)
        END,
        completed = CASE
          WHEN user_daily_quest_progress.completed THEN true
          ELSE LEAST(${targetCount}, user_daily_quest_progress.progress + 1) >= ${targetCount}
        END
      RETURNING completed
    `);

    if ((result.rows[0] as any)?.completed) {
      await db.execute(sql`
        INSERT INTO user_quest_log_state (user_id, has_unseen_completion)
        VALUES (${userId}, true)
        ON CONFLICT (user_id) DO UPDATE SET has_unseen_completion = true
      `);
    }
  } catch (err) {
    console.error("Quest progress error:", err);
  }
}

// ── Pet leveling helper ───────────────────────────────────────────────────────
// XP needed to advance from `level` to `level + 1`.
function xpForLevel(level: number): number {
  return Math.floor(100 + level * 30 + level * level * 5);
}
// Apply `pointsToAdd` XP to a pet's current level/points and return the new values.
function applyPetXp(currentLevel: number, currentPoints: number, pointsToAdd: number): { newLevel: number; newPoints: number } {
  let totalPoints = currentPoints + pointsToAdd;
  let newLevel = currentLevel;
  while (newLevel < 100) {
    const needed = xpForLevel(newLevel);
    if (totalPoints < needed) break;
    totalPoints -= needed;
    newLevel++;
  }
  if (newLevel >= 100) totalPoints = 0;
  return { newLevel, newPoints: totalPoints };
}

// ── In-memory caches for static/rarely-changing data ─────────────────────────
// Pet template parts never change during a session (only admins modify them).
// Caching for 10 minutes eliminates repeated DB hits across all users.
const templatePartsCache = new Map<string, { data: any; expiresAt: number }>();
const TEMPLATE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCachedTemplateParts(templateId: string) {
  const entry = templatePartsCache.get(templateId);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  templatePartsCache.delete(templateId);
  return null;
}

function setCachedTemplateParts(templateId: string, data: any) {
  templatePartsCache.set(templateId, { data, expiresAt: Date.now() + TEMPLATE_CACHE_TTL });
}

const COIN_PACKS = COIN_PACKAGES;

const stripePriceCache: Record<string, string> = {};

async function getOrCreateStripePrice(stripe: any, pack: typeof COIN_PACKS[0]): Promise<string> {
  if (stripePriceCache[pack.id]) return stripePriceCache[pack.id];

  const targetAmount = pack.priceUsd * 100;
  const prices = await stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] });
  const matchingPrice = prices.data.find((p: any) =>
    p.unit_amount === targetAmount && p.currency === 'usd' && (p.product as any)?.active !== false
  );
  if (matchingPrice) {
    stripePriceCache[pack.id] = matchingPrice.id;
    return matchingPrice.id;
  }

  const product = await stripe.products.create({
    name: `${pack.label} - Para Pets`,
    description: `Purchase ${pack.coins} coins for Para Pets`,
    metadata: { coins: pack.coins.toString(), packId: pack.id },
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: targetAmount,
    currency: 'usd',
  });
  stripePriceCache[pack.id] = price.id;
  return price.id;
}

const MAX_PER_SESSION = 100;
const MAX_PER_DAY = 500;

const isAuthenticated = requireAuthenticated;
const isAdmin = requireAdmin;

const DEFAULT_WELCOME_CONFIG = {
  coinAmount: 500,
  message: "A new adventure begins! These gifts are yours to keep — may your journey be legendary.",
  items: [
    { name: "Ire Deer",              qty: 1  },
    { name: "Subtle Growth",         qty: 1  },
    { name: "Basic Health Potion",   qty: 10 },
    { name: "Basic Mana Potion",     qty: 10 },
    { name: "Group Revive",          qty: 1  },
    { name: "Mossy Moonlight",       qty: 1  },
    { name: "Scorched Relevance",    qty: 1  },
    { name: "Sturdy Rod",            qty: 1  },
    { name: "Small Hatching Potion", qty: 1  },
  ],
};

function computeItemEffect(shop: any): string | null {
  if (!shop) return null;
  if (shop.type === "potion") {
    const parts: string[] = [];
    if (shop.healthRestored) parts.push(`+${shop.healthRestored} HP`);
    if (shop.manaRestored) parts.push(`+${shop.manaRestored} MP`);
    if (shop.petsRevived) parts.push(`Revive ${shop.petsRevived}`);
    return parts.join(" · ") || null;
  }
  if (shop.type === "accessory") {
    const parts: string[] = [];
    if (shop.atkBoost) parts.push(`+${shop.atkBoost} ATK`);
    if (shop.defBoost) parts.push(`+${shop.defBoost} DEF`);
    if (shop.healthBoost) parts.push(`+${shop.healthBoost} HP`);
    return parts.join(" · ") || null;
  }
  if (shop.type === "power_up" || shop.type === "item") {
    if (shop.statBoostType && shop.statBoostAmount) {
      const label = shop.statBoostType === "health" ? "HP" : shop.statBoostType === "atk" ? "ATK" : shop.statBoostType === "def" ? "DEF" : String(shop.statBoostType).toUpperCase();
      return `+${shop.statBoostAmount} ${label}`;
    }
    return null;
  }
  if (shop.type === "edibles") return shop.statBoostAmount ? `+${shop.statBoostAmount} Feed pts` : null;
  if (shop.type === "fishing") {
    if (shop.fishingType === "fish") {
      const rarities = ["Common","Uncommon","Rare","Epic","Legendary"];
      return `${"★".repeat(shop.starRarity ?? 1)} ${rarities[(shop.starRarity ?? 1) - 1] ?? ""}`.trim();
    }
    if (shop.fishingType === "pole") return shop.poleMaxUses ? `${shop.poleMaxUses} uses` : "Unlimited uses";
    if (shop.fishingType === "bait") return shop.rarityBoostPercent ? `+${shop.rarityBoostPercent}% on ${"★".repeat(shop.baitRarityBoostStar ?? 3)}` : "Bait";
  }
  if (shop.type === "special") {
    if (shop.specialType === "hatch_time") return shop.specialAmount ? `−${shop.specialAmount}% hatch time` : "Reduces hatch time";
    return shop.specialType ?? null;
  }
  if (shop.type === "pet") {
    if (shop.specialSkill) return `Skill: ${shop.specialSkill}`;
    if (shop.starRarity) return `${"★".repeat(shop.starRarity)} Rarity`;
  }
  return null;
}

async function getWelcomeBundleConfig() {
  try {
    const raw = await storage.getGameSetting("welcome_bundle_config");
    if (raw) return JSON.parse(raw) as typeof DEFAULT_WELCOME_CONFIG;
  } catch {}
  return DEFAULT_WELCOME_CONFIG;
}

async function grantWelcomeV2Bundle(userId: string): Promise<void> {
  await grantWelcomeBundle(userId, await getWelcomeBundleConfig());
}

const WORLD_BG_SEED: Record<string, string> = {
  sky_realm: "bg_sky_realm_td.webp",
  snowy_mountain: "bg_snowy_mountain_td.webp",
  volcanic: "bg_volcanic_td.webp",
  haunted_woods: "bg_haunted_woods_td.webp",
  enchanted_grove: "bg_enchanted_grove_td.webp",
  island: "bg_island_td.webp",
  desert: "bg_desert_td.webp",
  swamp: "bg_swamp_v5.webp",
};

async function seedWorldBackgrounds() {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const { db } = await import("./db");
    const { worlds } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    for (const [worldId, filename] of Object.entries(WORLD_BG_SEED)) {
      const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
      if (!world || world.bgUrl) continue;

      const imgPath = path.join(process.cwd(), "attached_assets", filename);
      if (!fs.existsSync(imgPath)) continue;

      const data = fs.readFileSync(imgPath);
      const ext = filename.endsWith(".png") ? "png" : filename.endsWith(".gif") ? "gif" : "jpeg";
      const dataUrl = `data:image/${ext};base64,${data.toString("base64")}`;

      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const resized = await sharp(imageBuffer)
        .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 88 })
        .toBuffer();
      const processed = `data:image/jpeg;base64,${resized.toString("base64")}`;

      await db.update(worlds).set({ bgUrl: processed }).where(eq(worlds.id, worldId));
      console.log(`Seeded background for world: ${worldId}`);
    }
  } catch (err) {
    console.error("World background seed error:", err);
  }
}

function makeBadgeSvgUrl(
  bg1: string, bg2: string,
  ribbon1: string, ribbon2: string,
  medalBg: string, medalStroke: string,
  starFill: string, starStroke: string,
  gemFill: string,
  textColor: string,
  line1: string, line2?: string
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </radialGradient>
    <radialGradient id="med" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${ribbon1}"/>
      <stop offset="50%" stop-color="${ribbon2}"/>
      <stop offset="100%" stop-color="${medalBg}"/>
    </radialGradient>
    <radialGradient id="gem" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="${gemFill}"/>
      <stop offset="100%" stop-color="${medalBg}"/>
    </radialGradient>
    <filter id="gl">
      <feGaussianBlur stdDeviation="1.5" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <rect width="100" height="100" rx="16" fill="url(#bg)"/>
  <polygon points="50,7 53,17 63,17 55,23 58,33 50,27 42,33 45,23 37,17 47,17"
           fill="url(#med)" filter="url(#gl)" opacity="0.95"/>
  <polygon points="50,9 52.5,16.5 60.5,16.5 54.2,21 56.8,28.5 50,24 43.2,28.5 45.8,21 39.5,16.5 47.5,16.5"
           fill="none" stroke="${starStroke}" stroke-width="0.6" opacity="0.7"/>
  <line x1="30" y1="29" x2="42" y2="37" stroke="url(#med)" stroke-width="4.5" stroke-linecap="round"/>
  <line x1="70" y1="29" x2="58" y2="37" stroke="url(#med)" stroke-width="4.5" stroke-linecap="round"/>
  <circle cx="50" cy="62" r="26" fill="${medalBg}" stroke="${medalStroke}" stroke-width="2.5"/>
  <circle cx="50" cy="62" r="23" fill="url(#med)" opacity="0.18"/>
  <circle cx="50" cy="62" r="21" fill="none" stroke="${ribbon2}" stroke-width="1" opacity="0.7"/>
  <circle cx="50" cy="62" r="19" fill="none" stroke="${starStroke}" stroke-width="0.5" opacity="0.4"/>
  <circle cx="50" cy="62" r="26" fill="none" stroke="${starStroke}" stroke-width="1.5" opacity="0.85"/>
  <polygon points="50,46 52.5,54 61,54 54.5,59 57,67 50,62 43,67 45.5,59 39,54 47.5,54"
           fill="url(#med)" filter="url(#gl)"/>
  <polygon points="50,48 52,55 59.5,55 53.5,59.5 55.5,67 50,63.5 44.5,67 46.5,59.5 40.5,55 48,55"
           fill="none" stroke="${starStroke}" stroke-width="0.5" opacity="0.7"/>
  <circle cx="50" cy="56" r="2.8" fill="url(#gem)" opacity="0.95"/>
  ${line2
    ? `<text x="50" y="72" text-anchor="middle" fill="${textColor}" font-size="7.5" font-weight="bold" font-family="serif">${line1}</text>
       <text x="50" y="80" text-anchor="middle" fill="${textColor}" font-size="6" font-family="serif" opacity="0.8">${line2}</text>`
    : `<text x="50" y="76" text-anchor="middle" fill="${textColor}" font-size="7.5" font-weight="bold" font-family="serif">${line1}</text>`
  }
  <circle cx="50" cy="62" r="26" fill="none" stroke="${starStroke}" stroke-width="0.8" stroke-dasharray="3,4" opacity="0.3"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const ACQUISITION_BADGES = {
  minor: {
    name: "Minor Acquisition", points: 1500, dailyRewardCoins: 10, claimType: "daily" as const,
    svgUrl: makeBadgeSvgUrl("#3a1a05","#1a0a02","#f5c850","#c88820","#2a1005","#8b5e10","#f5d060","#f5e070","#ff9090","#fff0c0","$10 Pack"),
  },
  advanced: {
    name: "Advanced Acquisition", points: 3000, dailyRewardCoins: 500, claimType: "weekly" as const,
    svgUrl: makeBadgeSvgUrl("#0a1830","#050e1e","#70b8f0","#1a70d0","#081830","#1a60c0","#80c8ff","#a0d8ff","#70e8ff","#d0f0ff","$100 Pack"),
  },
  legendary: {
    name: "Legendary Acquisition", points: 3500, dailyRewardCoins: 1000, claimType: "weekly" as const,
    svgUrl: makeBadgeSvgUrl("#1a0030","#0e001e","#d080f0","#6010c0","#180028","#5010a0","#e090ff","#f0b0ff","#c060ff","#f0e0ff","$500 Pack","LIMIT"),
  },
} as const;

// ── Fisher Badges (cumulative catch count) ────────────────────────────
const FISHER_BADGES = {
  angler: {
    name: "The Angler", rarity: "common", points: 1000, dailyCoins: 10, catchCount: 300,
    imageUrl: "/world-assets/Photoroom_20260707_11349_PM_1783458650009.png",
    obtainDescription: "Catch 300 fish.",
  },
  masterAngler: {
    name: "Master Angler", rarity: "uncommon", points: 2000, dailyCoins: 25, catchCount: 500,
    imageUrl: "/world-assets/Photoroom_20260707_11428_PM_1783458650009.png",
    obtainDescription: "Catch 500 fish.",
  },
  legendaryAngler: {
    name: "Legendary Angler", rarity: "rare", points: 3500, dailyCoins: 50, catchCount: 750,
    imageUrl: "/world-assets/Photoroom_20260707_11506_PM_1783458650009.png",
    obtainDescription: "Catch 750 fish.",
  },
} as const;

// ── Fish Book Completion Badges (catch every species in a biome) ───────
const FISH_BOOK_BADGES = {
  volcanic: {
    name: "Flame Fisher", rarity: "rare", points: 3000, dailyCoins: 50, worldId: "volcanic",
    imageUrl: "/world-assets/Photoroom_20260707_11649_PM_1783458650009.png",
    obtainDescription: "Catch every species in the Volcanic Isle Fish Book.",
  },
  haunted: {
    name: "Phantom Fisher", rarity: "rare", points: 3000, dailyCoins: 50, worldId: "haunted_woods",
    imageUrl: "/world-assets/Photoroom_20260707_11800_PM_1783458650009.png",
    obtainDescription: "Catch every species in the Haunted Woods Fish Book.",
  },
  bayou: {
    name: "Bayou Sage", rarity: "rare", points: 3000, dailyCoins: 50, worldId: "swamp",
    imageUrl: "/world-assets/Photoroom_20260707_11559_PM_1783458650009.png",
    obtainDescription: "Catch every species in the Elysian Bayou Fish Book.",
  },
} as const;

// ── Brawler PvP Badges ───────────────────────────────────────────────
const BRAWLER_BADGES = {
  brawler: {
    name: "The Brawler",
    imageUrl: "/world-assets/Photoroom_20260704_100600_PM_1783220772468.png",
    winsRequired: 100,
    points: 1000,
    rarity: "uncommon",
    obtainDescription: "Win 100 PvP battles.",
  },
  advanced: {
    name: "Advanced Brawler",
    imageUrl: "/world-assets/Photoroom_20260704_95312_PM_1783220772468.png",
    winsRequired: 300,
    points: 2000,
    rarity: "rare",
    obtainDescription: "Win 300 PvP battles.",
  },
  legendary: {
    name: "Legendary Brawler",
    imageUrl: "/world-assets/Photoroom_20260704_100308_PM_1783220772468.png",
    winsRequired: 500,
    points: 3500,
    rarity: "legendary",
    obtainDescription: "Win 500 PvP battles.",
  },
} as const;

async function getOrCreateBrawlerBadge(key: keyof typeof BRAWLER_BADGES): Promise<string> {
  const meta = BRAWLER_BADGES[key];
  const existing = await storage.getBadgeByName(meta.name);
  if (existing) return existing.id;
  const badge = await storage.createBadge(meta.name, meta.imageUrl, null, meta.points, "daily");
  // Set rarity + obtainDescription on new badge
  await storage.updateBadge(badge.id, { rarity: meta.rarity, obtainDescription: meta.obtainDescription });
  return badge.id;
}

async function maybeAwardBrawlerBadges(userId: string, totalWins: number): Promise<void> {
  try {
    if (totalWins >= 100) {
      const id = await getOrCreateBrawlerBadge("brawler");
      await storage.awardBadge(userId, id);
    }
    if (totalWins >= 300) {
      const id = await getOrCreateBrawlerBadge("advanced");
      await storage.awardBadge(userId, id);
    }
    if (totalWins >= 500) {
      const id = await getOrCreateBrawlerBadge("legendary");
      await storage.awardBadge(userId, id);
    }
  } catch (err) {
    console.error("[badges] Error awarding brawler badges:", err);
  }
}

async function getOrCreateFisherBadge(key: keyof typeof FISHER_BADGES): Promise<string> {
  const meta = FISHER_BADGES[key];
  const existing = await storage.getBadgeByName(meta.name);
  if (existing) return existing.id;
  const badge = await storage.createBadge(meta.name, meta.imageUrl, meta.dailyCoins, meta.points, "daily");
  await storage.updateBadge(badge.id, { rarity: meta.rarity, obtainDescription: meta.obtainDescription });
  return badge.id;
}

async function getOrCreateFishBookBadge(key: keyof typeof FISH_BOOK_BADGES): Promise<string> {
  const meta = FISH_BOOK_BADGES[key];
  const existing = await storage.getBadgeByName(meta.name);
  if (existing) return existing.id;
  const badge = await storage.createBadge(meta.name, meta.imageUrl, meta.dailyCoins, meta.points, "daily");
  await storage.updateBadge(badge.id, { rarity: meta.rarity, obtainDescription: meta.obtainDescription });
  return badge.id;
}

async function maybeAwardFisherBadges(userId: string, totalCaught: number): Promise<void> {
  try {
    if (totalCaught >= 300) {
      const id = await getOrCreateFisherBadge("angler");
      await storage.awardBadge(userId, id);
    }
    if (totalCaught >= 500) {
      const id = await getOrCreateFisherBadge("masterAngler");
      await storage.awardBadge(userId, id);
    }
    if (totalCaught >= 750) {
      const id = await getOrCreateFisherBadge("legendaryAngler");
      await storage.awardBadge(userId, id);
    }
  } catch (err) {
    console.error("[badges] Error awarding fisher badges:", err);
  }
}

async function maybeAwardFishBookBadge(userId: string, biomeWorldId: string): Promise<void> {
  try {
    const key = (Object.keys(FISH_BOOK_BADGES) as (keyof typeof FISH_BOOK_BADGES)[])
      .find(k => FISH_BOOK_BADGES[k].worldId === biomeWorldId);
    if (!key) return;
    // Count all fish species in this biome (via their pond placement)
    const totalRes = await db.execute(sql`
      SELECT COUNT(DISTINCT pf.shop_item_id)::int AS total
      FROM pond_fish pf
      JOIN world_locations wl ON wl.id = pf.location_id
      WHERE wl.world_id = ${biomeWorldId}
    `);
    const total = (totalRes.rows[0] as any)?.total ?? 0;
    if (total === 0) return;
    // Count how many of those species this user has caught
    const caughtRes = await db.execute(sql`
      SELECT COUNT(DISTINCT pfcl.shop_item_id)::int AS caught
      FROM player_fish_catch_log pfcl
      JOIN pond_fish pf ON pf.shop_item_id = pfcl.shop_item_id
      JOIN world_locations wl ON wl.id = pf.location_id
      WHERE wl.world_id = ${biomeWorldId} AND pfcl.user_id = ${userId}
    `);
    const caught = (caughtRes.rows[0] as any)?.caught ?? 0;
    if (caught >= total) {
      const id = await getOrCreateFishBookBadge(key);
      const awarded = await storage.awardBadge(userId, id);
      if (awarded) console.log(`[badges] ${FISH_BOOK_BADGES[key].name} awarded to ${userId}`);
    }
  } catch (err) {
    console.error("[badges] Error awarding fish book badge:", err);
  }
}

async function getOrCreateAcquisitionBadge(key: keyof typeof ACQUISITION_BADGES): Promise<string> {
  const meta = ACQUISITION_BADGES[key];
  const existing = await storage.getBadgeByName(meta.name);
  if (existing) return existing.id;
  const badge = await storage.createBadge(meta.name, meta.svgUrl, meta.dailyRewardCoins, meta.points, meta.claimType);
  return badge.id;
}

export async function maybeAwardAcquisitionBadges(userId: string, purchaseAmountUsd: number): Promise<void> {
  try {
    if (purchaseAmountUsd === 25) {
      const id = await getOrCreateAcquisitionBadge("minor");
      await storage.awardBadge(userId, id);
      console.log(`[badges] Minor Acquisition awarded to ${userId}`);
    }
    if (purchaseAmountUsd >= 100) {
      const id = await getOrCreateAcquisitionBadge("advanced");
      await storage.awardBadge(userId, id);
      console.log(`[badges] Advanced Acquisition awarded to ${userId}`);
    }
    const dailyTotal = await storage.getDailyPurchaseTotal(userId);
    if (dailyTotal >= 500) {
      const id = await getOrCreateAcquisitionBadge("legendary");
      await storage.awardBadge(userId, id);
      console.log(`[badges] Legendary Acquisition awarded to ${userId}`);
    }
  } catch (err) {
    console.error("[badges] Error awarding acquisition badges:", err);
  }
}

export async function backfillBrawlerBadges(): Promise<void> {
  try {
    // Count wins per user from pvp_battles, award milestone badges to anyone who qualifies
    const rows = await db.execute(sql`
      SELECT user_id, COUNT(*)::int AS win_count
      FROM pvp_battles
      WHERE result = 'win' AND user_id IS NOT NULL
      GROUP BY user_id
      HAVING COUNT(*) >= 100
    `);
    let awarded = 0;
    for (const row of rows.rows as { user_id: string; win_count: number }[]) {
      const prev = awarded;
      await maybeAwardBrawlerBadges(row.user_id, row.win_count);
      // awardBadge is idempotent — just count iterations not actual new awards
      awarded++;
    }
    if (rows.rows.length > 0) {
      console.log(`Brawler badge backfill: checked ${rows.rows.length} qualifying player(s).`);
    }
  } catch (err) {
    console.error("Brawler badge backfill error (non-fatal):", err);
  }
}

export async function seedBrawlerBadges(): Promise<void> {
  try {
    for (const key of (["brawler", "advanced", "legendary"] as const)) {
      await getOrCreateBrawlerBadge(key);
    }
    console.log("Brawler badges seeded.");
  } catch (err) {
    console.error("Brawler badge seed error (non-fatal):", err);
  }
}

export async function backfillFisherBadges(): Promise<void> {
  try {
    // Seed the badge DB rows so they appear in the badge list immediately
    for (const key of (["angler", "masterAngler", "legendaryAngler"] as const)) {
      await getOrCreateFisherBadge(key);
    }
    // Award to any player whose total_fish_caught already qualifies
    const rows = await db.execute(sql`
      SELECT id, total_fish_caught FROM users WHERE total_fish_caught >= 300 AND is_bot = false
    `);
    for (const row of rows.rows as { id: string; total_fish_caught: number }[]) {
      await maybeAwardFisherBadges(row.id, row.total_fish_caught);
    }
    if (rows.rows.length > 0) {
      console.log(`Fisher badge backfill: processed ${rows.rows.length} qualifying player(s).`);
    }
  } catch (err) {
    console.error("Fisher badge backfill error (non-fatal):", err);
  }
}

export async function backfillFishBookBadges(): Promise<void> {
  try {
    for (const key of (["volcanic", "haunted", "bayou"] as const)) {
      await getOrCreateFishBookBadge(key);
      const meta = FISH_BOOK_BADGES[key];
      // Get all users who have caught every species in this biome
      const res = await db.execute(sql`
        SELECT pfcl.user_id
        FROM player_fish_catch_log pfcl
        JOIN pond_fish pf ON pf.shop_item_id = pfcl.shop_item_id
        JOIN world_locations wl ON wl.id = pf.location_id
        WHERE wl.world_id = ${meta.worldId}
        GROUP BY pfcl.user_id
        HAVING COUNT(DISTINCT pfcl.shop_item_id) >= (
          SELECT COUNT(DISTINCT pf2.shop_item_id)
          FROM pond_fish pf2
          JOIN world_locations wl2 ON wl2.id = pf2.location_id
          WHERE wl2.world_id = ${meta.worldId}
        )
      `);
      const badgeId = await getOrCreateFishBookBadge(key);
      for (const row of res.rows as { user_id: string }[]) {
        await storage.awardBadge(row.user_id, badgeId);
      }
      if (res.rows.length > 0) {
        console.log(`Fish book backfill (${key}): awarded to ${res.rows.length} player(s).`);
      }
    }
  } catch (err) {
    console.error("Fish book badge backfill error (non-fatal):", err);
  }
}

export async function backfillMinorAcquisitionBadge(): Promise<void> {
  try {
    const badgeId = await getOrCreateAcquisitionBadge("minor");
    const allPurchases = await db.select({ userId: coinPurchases.userId, amountUsd: coinPurchases.amountUsd }).from(coinPurchases);
    const qualifyingUserIds = [...new Set(allPurchases.filter(p => p.amountUsd === 25).map(p => p.userId))];
    let awarded = 0;
    for (const userId of qualifyingUserIds) {
      const result = await storage.awardBadge(userId, badgeId);
      if (result) awarded++;
    }
    if (qualifyingUserIds.length > 0) {
      console.log(`Minor Acquisition backfill: awarded to ${awarded}/${qualifyingUserIds.length} users.`);
    }
  } catch (err) {
    console.error("Minor Acquisition backfill error (non-fatal):", err);
  }
}

export async function backfillAdvancedAcquisitionBadge(): Promise<void> {
  try {
    const badgeId = await getOrCreateAcquisitionBadge("advanced");
    const allPurchases = await db.select({ userId: coinPurchases.userId, amountUsd: coinPurchases.amountUsd }).from(coinPurchases);
    const qualifyingUserIds = [...new Set(allPurchases.filter(p => p.amountUsd >= 100).map(p => p.userId))];
    let awarded = 0;
    for (const userId of qualifyingUserIds) {
      const result = await storage.awardBadge(userId, badgeId);
      if (result) awarded++;
    }
    if (qualifyingUserIds.length > 0) {
      console.log(`Advanced Acquisition backfill: awarded to ${awarded}/${qualifyingUserIds.length} users.`);
    }
  } catch (err) {
    console.error("Advanced Acquisition backfill error (non-fatal):", err);
  }
}

export async function backfillCoinPurchaseEarnings(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE users
      SET total_coins_earned = subq.total
      FROM (
        SELECT user_id, COALESCE(SUM(coins_received), 0) AS total
        FROM coin_purchases
        GROUP BY user_id
      ) subq
      WHERE users.id = subq.user_id
        AND users.total_coins_earned = 0
        AND subq.total > 0
    `);
    if ((result.rowCount ?? 0) > 0) {
      console.log(`Coin purchase backfill: updated ${result.rowCount} user(s).`);
    }
  } catch (err) {
    console.error("Coin purchase backfill error (non-fatal):", err);
  }
}

// Ensures totalCoinsEarned is always >= the user's current coin balance.
// This seeds legacy users whose in-game earnings were never recorded in the column.
export async function syncTotalCoinsEarnedFloor(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE users
      SET total_coins_earned = coins
      WHERE coins > total_coins_earned
    `);
    if ((result.rowCount ?? 0) > 0) {
      console.log(`totalCoinsEarned floor sync: updated ${result.rowCount} user(s).`);
    }
  } catch (err) {
    console.error("totalCoinsEarned floor sync error (non-fatal):", err);
  }
}

// ── Veridian Watcher ─────────────────────────────────────────────────────────
const VERIDIAN_WATCHER_ID = "veridian-watcher";
// Persisted on the user record (users.last_watcher_greeted_at) so it survives restarts.
const LOGIN_GREETING_COOLDOWN_MS = 3 * 60 * 60 * 1000;

// After a PvP or cave battle defeat, the pet's mood is temporarily capped.
// Mood cannot rise above BATTLE_DEFEAT_MOOD_CAP for BATTLE_DEFEAT_RECENT_MINUTES
// minutes following the loss. This makes defeat feel meaningful without being permanent.
const BATTLE_DEFEAT_RECENT_MINUTES = 60; // cap lasts 1 hour
const BATTLE_DEFEAT_MOOD_CAP = 70;       // mood ceiling while cap is active

let lastWatcherMessageAt = 0;

async function postWatcherMessage(message: string): Promise<void> {
  try {
    await storage.addWorldChatMessage({
      userId: VERIDIAN_WATCHER_ID,
      username: "Veridian Watcher",
      profileImage: null,
      message,
      isBot: true,
    });
    lastWatcherMessageAt = Date.now();
    storage.purgeOldWorldChatMessages().catch(() => {});
  } catch (err) {
    console.error("[VW] Failed to post message:", err);
  }
}


export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  seedWorldBackgrounds();

  registerElysianClearingCombatRoutes(app, { db, storage, isAuthenticated });
  registerClearingShopRoutes(app, { db, isAuthenticated });
  registerSoulExchangeRoutes(app, { isAuthenticated });
  registerClearingEquipmentRoutes(app, { db, storage, isAuthenticated });
  registerClearingAdminRoutes(app, { db, isAdmin });
  registerCostumeAdminRoutes(app, data => processWorldImage(data, 2000));
  registerCostumePlayerRoutes(app);
  registerMiniPetRoutes(app, data => processWorldImage(data, 1000));
  registerRedeemCodeRoutes(app);

  const marketplaceRouteDependencies: MarketplaceRouteDependencies = {
    storage,
    isAuthenticated,
    buyListing,
    cancelListing,
    collectProceeds,
    createFishListing,
    createInventoryListing,
  };

  // ── SEO: sitemap + robots (no auth required, served before any middleware) ──
  app.get("/sitemap.xml", (_req, res) => {
    const base = "https://www.parapets.net";
    const today = new Date().toISOString().split("T")[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${base}/hub</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${base}/auth</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${base}/founders</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
</urlset>`;
    res.set("Content-Type", "application/xml");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(xml);
  });

  app.use("/api/admin", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  registerAccountRoutes(app, {
    storage,
    isAuthenticated,
    containsBadWord,
    findRecentlyDeletedAccounts: async (email) => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return db
        .select({ deletedAt: deletedAccounts.deletedAt })
        .from(deletedAccounts)
        .where(and(eq(deletedAccounts.email, email.toLowerCase()), gt(deletedAccounts.deletedAt, thirtyDaysAgo)))
        .limit(1);
    },
    getFreeHouseBundles: () => db.select().from(houseBundlesTable).where(eq(houseBundlesTable.price, 0)),
    updateSignupReferrer: (userId, referrer) => db.execute(sql`UPDATE users SET signup_referrer = ${referrer} WHERE id = ${userId}`),
    grantWelcomeV2Bundle,
    postWatcherMessage,
  });


  registerMaintenanceRoutes(app, { db, storage, isAdmin });

  // ── Public: serve stored media blobs by ID ────────────────────────────────
  app.get("/api/media/:id", async (req, res) => {
    try {
      const result = await db.execute(
        sql`SELECT mime_type, data FROM media_blobs WHERE id = ${req.params.id}`
      );
      if (!result.rows.length) return res.status(404).end();
      const row = result.rows[0] as any;
      const buf = Buffer.from(row.data as string, "base64");
      res.setHeader("Content-Type", row.mime_type);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.send(buf);
    } catch (err) {
      console.error("Media blob serve error:", err);
      return res.status(500).end();
    }
  });

  registerRaidRoutes(app, { db, storage, isAuthenticated, isAdmin });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        try {
          // Block non-admins when maintenance mode is active
          if (!user.isAdmin) {
            const maintenance = await storage.getGameSetting("maintenance_mode");
            if (maintenance === "true") {
              req.logout(() => {});
              return res.status(503).json({ maintenance: true, message: "The realm is currently undergoing maintenance. Please try again soon." });
            }
          }
          req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
          if (!user.welcomeV2Sent) {
            try { await grantWelcomeV2Bundle(user.id); } catch (e) { console.error("Welcome v2 grant failed:", e); }
          }
          const freshUser = await storage.getUser(user.id);
          const safeUser = publicAccount(freshUser ?? user);
          // Log login event for metrics (fire-and-forget)
          setImmediate(async () => {
            try {
              const ip = ((req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()) || (req as any).ip || "";
              const safeIp = ip.replace(/^::ffff:/, "");
              const result = await db.execute(sql`INSERT INTO player_login_events (user_id, ip_address) VALUES (${user.id}, ${safeIp || null}) RETURNING id`);
              const rowId = (result as any).rows?.[0]?.id ?? (result as any)?.[0]?.id;
              if (rowId && safeIp && safeIp !== "::1" && !safeIp.startsWith("127.") && safeIp !== "") {
                try {
                  const geoRes = await fetch(`http://ip-api.com/json/${safeIp}?fields=country,city`);
                  const geo = await geoRes.json() as any;
                  if (geo?.country) {
                    await db.execute(sql`UPDATE player_login_events SET country = ${geo.country}, city = ${geo.city ?? null} WHERE id = ${rowId}`);
                  }
                } catch {}
              }
            } catch {}
          });
          return res.json(safeUser);
        } catch (error) { return next(error); }
      });
    })(req, res, next);
  });


  app.get("/api/auth/me", isAuthenticated, (req, res) => {
    const user = req.user as any;
    const safeUser = publicAccount(user);
    return res.json(safeUser);
  });

  app.post("/api/support-message", async (req, res) => {
    try {
      const { username, email, subject, message } = req.body;
      if (!username || !email || !subject || !message) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (message.length > 2000) {
        return res.status(400).json({ message: "Message too long (max 2000 characters)" });
      }
      const msg = await storage.createSupportMessage({ username, email, subject, message });
      // Notify all admin users so they see a toast alert (mirrors how players are notified of admin replies)
      try {
        const adminUsers = await storage.getAdminUsers();
        await Promise.all(
          adminUsers.map(admin =>
            storage.createNotification(admin.id, "support_message", `New support message from ${username}: "${subject}"`)
          )
        );
      } catch (notifErr) {
        console.error("Failed to notify admins of support message:", notifErr);
      }
      return res.json({ message: "Your message has been sent! An admin will reach out to help you.", id: msg.id });
    } catch (err) {
      console.error("Support message error:", err);
      return res.status(500).json({ message: "Failed to send message" });
    }
  });


  app.patch("/api/user/password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const isValid = await bcrypt.compare(currentPassword, fullUser.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const updated = await storage.updatePassword(user.id, hashedPassword);
      const safeUser = publicAccount(updated);
      return res.json(safeUser);
    } catch (err) {
      console.error("Change password error:", err);
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post("/api/user/delete-account", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ message: "Password is required to delete your account" });
      }
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(404).json({ message: "User not found" });
      }
      const isValid = await bcrypt.compare(password, fullUser.password);
      if (!isValid) {
        return res.status(400).json({ message: "Incorrect password" });
      }
      await storage.deleteAccount(user.id);
      req.logout((logoutErr) => {
        if (logoutErr) console.error("Logout after delete error:", logoutErr);
        req.session.destroy((destroyErr) => {
          if (destroyErr) console.error("Session destroy after delete error:", destroyErr);
          res.clearCookie("connect.sid");
          return res.json({ message: "Account deleted" });
        });
      });
    } catch (err) {
      console.error("Delete account error:", err);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.patch("/api/user/username", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { username } = req.body;

      const parse = updateUsernameSchema.safeParse({ username });
      if (!parse.success) {
        return res.status(400).json({ message: parse.error.errors[0].message });
      }

      if (await containsBadWord(username)) {
        return res.status(400).json({ message: "That username contains a forbidden word. Please choose another." });
      }

      const existing = await storage.getUserByUsernameCaseInsensitive(username);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ field: "username", message: "Username already taken" });
      }

      const updated = await storage.updateUsername(user.id, username);
      const safeUser = publicAccount(updated);
      return res.json(safeUser);
    } catch (err) {
      if (err instanceof AccountConflictError) return res.status(409).json({ field: err.field, message: err.message });
      console.error("Update username error:", err);
      return res.status(500).json({ message: "Failed to update username" });
    }
  });

  app.patch("/api/user/profile-image", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { profileImageData } = req.body;

      if (!profileImageData) {
        return res.status(400).json({ message: "No image provided" });
      }

      const base64Data = profileImageData.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const resized = await sharp(imageBuffer)
        .resize(500, 500, { fit: "cover", position: "center" })
        .jpeg({ quality: 85 })
        .toBuffer();

      const profileImage = `data:image/jpeg;base64,${resized.toString("base64")}`;

      const updated = await storage.updateProfileImage(user.id, profileImage);
      const safeUser = publicAccount(updated);
      return res.json(safeUser);
    } catch (err) {
      console.error("Update profile image error:", err);
      return res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  app.patch("/api/user/active-pet", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, "activePetId")) {
        return res.status(400).json({ message: "activePetId is required" });
      }
      const { activePetId } = req.body;
      if (activePetId !== null && (typeof activePetId !== "string" || !activePetId.trim())) {
        return res.status(400).json({ message: "activePetId must be a pet inventory id or null" });
      }

      if (activePetId !== null) {
        const invItem = await storage.getInventoryItemById(activePetId);
        if (!invItem || invItem.userId !== user.id) {
          return res.status(400).json({ message: "You don't own this pet" });
        }
        if (invItem.isListed) {
          return res.status(409).json({ message: "Remove this pet from the Player Market before making it active" });
        }
        const shopItem = await storage.getShopItem(invItem.shopItemId);
        if (!shopItem || shopItem.type.trim().toLowerCase() !== "pet") {
          return res.status(400).json({ message: "This item is not a pet" });
        }
      }

      const updated = await storage.updateActivePet(user.id, activePetId);
      const safeUser = publicAccount(updated);
      return res.json(safeUser);
    } catch (err) {
      console.error("Update active pet error:", err);
      return res.status(500).json({ message: "Failed to update active pet" });
    }
  });

  // Public profile endpoint — accessible to any authenticated player
  app.get("/api/users/:userId/profile", isAuthenticated, async (req, res) => {
    try {
      const targetUser = await storage.getUser((req.params.userId as string));
      if (!targetUser || targetUser.isBanned) {
        return res.status(404).json({ message: "User not found" });
      }

      const inventoryRows = await storage.getUserInventoryWithItems(targetUser.id);

      let activePet = null;
      if (targetUser.activePetId) {
        const activePetRow = inventoryRows.find(
          r => r.inventory.id === targetUser.activePetId && r.inventory.isHatched
        );
        if (activePetRow && activePetRow.shopItem) {
          const { shopItem, inventory: inv } = activePetRow;
          activePet = {
            inventoryId: inv.id,
            shopItemId: shopItem.id,
            name: shopItem.name,
            nickname: inv.petNickname,
            imageUrl: shopItem.imageUrl,
            hatchedImageUrl: shopItem.hatchedImageUrl,
            eggImageUrl: shopItem.eggImageUrl,
            rarity: shopItem.rarity,
            specialSkill: shopItem.specialSkill,
            petLevel: inv.petLevel,
            petHealth: inv.petHealth,
            petAtk: inv.petAtk,
            petDef: inv.petDef,
            petLevelPoints: inv.petLevelPoints,
            petTemplateId: shopItem.petTemplateId || null,
          };
        }
      }

      const accessories = inventoryRows
        .filter(r => r.shopItem?.type === "accessory")
        .map(r => ({
          inventoryId: r.inventory.id,
          name: r.shopItem!.name,
          imageUrl: r.shopItem!.imageUrl,
          atkBoost: r.shopItem!.atkBoost,
          defBoost: r.shopItem!.defBoost,
          healthBoost: r.shopItem!.healthBoost,
        }));

      return res.json({
        id: targetUser.id,
        username: targetUser.username,
        profileImage: targetUser.profileImage,
        isAdmin: targetUser.isAdmin ?? false,
        isModerator: targetUser.isModerator ?? false,
        activePet,
        accessories,
      });
    } catch (err) {
      console.error("Get public profile error:", err);
      return res.status(500).json({ message: "Failed to get profile" });
    }
  });

  registerPlayerBadgeRoutes(app, { storage, db, isAuthenticated, processWorldImage });

  registerPetHouseVisitorRoutes(app, { storage, isAuthenticated });

  registerPetHousePositionRoutes(app, { storage, isAuthenticated });

  // ── Pet hunger / mood time-decay helper ────────────────────────────────────
  // Hunger drains at HUNGER_DECAY_PER_MIN regardless of placement.
  // Max hunger is always 1000 for all pets — a full bar empties in 6 hours.
  // Mood only drains when hunger falls below 50% (starvation). Battle defeats
  // drop mood by a flat amount at the defeat site; there is no time-based cap.
  const HUNGER_DECAY_PER_MIN = 1000 / 360; // 1000 pts over 360 min (6 hours)
  const MOOD_STARVE_DECAY_PER_MIN = 0.5;
  const HUNGRY_THRESHOLD_PCT = 0.5;         // <50% hunger = "hungry"
  async function applyPetTimeDecay(inv: any): Promise<{ petHunger: number; petMood: number }> {
    const maxHunger = 1000;
    // First-touch initialization: -1 means "uninitialized" — start full.
    let hunger = inv.petHunger == null || inv.petHunger < 0 ? maxHunger : inv.petHunger;
    let mood = inv.petMood == null ? 100 : inv.petMood;
    const now = Date.now();
    const last = inv.petStatsUpdatedAt ? new Date(inv.petStatsUpdatedAt).getTime() : now;
    const minutes = Math.max(0, (now - last) / 60000);
    if (minutes > 0) {
      const newHunger = Math.max(0, hunger - HUNGER_DECAY_PER_MIN * minutes);
      // Starvation drain: applies only for the portion of the elapsed
      // interval the pet was actually below the 50% hunger threshold.
      const startHungerPct = hunger / maxHunger;
      const endHungerPct = newHunger / maxHunger;
      let starveMinutes = 0;
      if (endHungerPct < HUNGRY_THRESHOLD_PCT) {
        if (startHungerPct < HUNGRY_THRESHOLD_PCT) {
          starveMinutes = minutes;
        } else if (HUNGER_DECAY_PER_MIN > 0) {
          const hungerAtThreshold = HUNGRY_THRESHOLD_PCT * maxHunger;
          const minutesToThreshold = (hunger - hungerAtThreshold) / HUNGER_DECAY_PER_MIN;
          starveMinutes = Math.max(0, minutes - minutesToThreshold);
        }
      }
      const starveDrain = MOOD_STARVE_DECAY_PER_MIN * starveMinutes;
      const newMood = Math.max(0, mood - starveDrain);
      hunger = Math.round(newHunger);
      mood = Math.round(newMood);
    }
    // Only persist when something actually changed. The previous version
    // wrote a row for every placed pet on every /api/inventory fetch (because
    // `minutes > 0` is essentially always true), which caused a write storm
    // that made the app feel like it was stalling/restarting under load.
    // We also only refresh the timestamp when at least 1 full minute has
    // passed AND values changed — small fractional minutes get rolled into
    // the next tick without a DB write.
    const changed = hunger !== inv.petHunger || mood !== inv.petMood;
    // Only persist to DB if at least 2 minutes have elapsed since the last
    // write. Rapid successive inventory fetches (e.g. every 30s from the
    // client) still get correct computed values, but don't each hammer
    // Railway with a write round-trip. The pet's displayed stats are
    // always accurate; only the persistence is rate-limited.
    if (changed && minutes >= 2) {
      await storage.updateInventoryItem(inv.id, {
        petHunger: hunger,
        petMood: mood,
        petStatsUpdatedAt: new Date(),
      } as any);
      inv.petHunger = hunger;
      inv.petMood = mood;
      inv.petStatsUpdatedAt = new Date();
    } else if (changed) {
      // Return updated values without persisting yet.
      inv.petHunger = hunger;
      inv.petMood = mood;
    }
    return { petHunger: hunger, petMood: mood };
  }

  app.get("/api/inventory", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const rows = await storage.getUserInventoryWithItems(user.id);
      const filteredRows = rows;

      // Backfill poleUsesLeft for poles that gained a use-limit after being purchased
      await Promise.all(filteredRows.map(async ({ inventory: inv, shopItem }) => {
        if (shopItem?.fishingType === "pole" && shopItem.poleMaxUses != null && inv.poleUsesLeft == null) {
          await storage.updateInventoryItem(inv.id, { poleUsesLeft: shopItem.poleMaxUses });
          inv.poleUsesLeft = shopItem.poleMaxUses;
        }
      }));

      // Apply hunger/mood time decay for every hatched pet.
      // Decay runs for all hatched pets regardless of placement status.
      await Promise.all(filteredRows.map(async ({ inventory: inv, shopItem }) => {
        if (shopItem?.type === "pet" && inv.isHatched) {
          await applyPetTimeDecay(inv);
        }
      }));

      const itemsWithDetails = filteredRows.map(({ inventory: inv, shopItem }) => ({
        id: inv.id,
        inventoryId: inv.id,
        isListed: inv.isListed,
        shopItemId: inv.shopItemId,
        acquiredAt: inv.acquiredAt,
        name: shopItem?.name || "Unknown",
        description: shopItem?.description || null,
        type: shopItem?.type || "item",
        adornmentSlot: shopItem?.adornmentSlot ?? null,
        imageUrl: shopItem?.imageUrl || null,
        worldId: shopItem?.worldId || "",
        rarity: shopItem?.rarity || null,
        starRarity: shopItem?.starRarity ?? null,
        hatchTime: shopItem?.hatchTime || null,
        eggImageUrl: shopItem?.eggImageUrl || null,
        hatchedImageUrl: shopItem?.hatchedImageUrl || null,
        statBoostType: shopItem?.statBoostType || null,
        statBoostAmount: shopItem?.statBoostAmount || null,
        specialType: shopItem?.specialType || null,
        specialAmount: shopItem?.specialAmount || null,
        healthRestored: shopItem?.healthRestored ?? null,
        manaRestored: shopItem?.manaRestored ?? null,
        petsRevived: shopItem?.petsRevived ?? null,
        petsHealed: shopItem?.petsHealed ?? null,
        petTemplateId: shopItem?.petTemplateId || null,
        canFly: (shopItem as any)?.canFly ?? false,
        petNickname: inv.petNickname || null,
        hatchStartedAt: inv.hatchStartedAt,
        isHatched: inv.isHatched,
        isEvolved: inv.isEvolved,
        petHealth: inv.petHealth,
        petAtk: inv.petAtk,
        petDef: inv.petDef,
        petLevel: inv.petLevel,
        petLevelPoints: inv.petLevelPoints,
        petFeedPoints: inv.petFeedPoints ?? 0,
        petHunger: inv.petHunger ?? -1,
        petMood: inv.petMood ?? 100,
        petLoyalty: inv.petLoyalty ?? 0,
        lastFedAt: inv.lastFedAt ?? null,
        lastPettedAt: inv.lastPettedAt ?? null,
        lastBattleDefeatAt: inv.lastBattleDefeatAt ?? null,
        facingDirection: shopItem?.facingDirection ?? null,
        giftPoints: shopItem?.giftPoints ?? null,
        petExp: shopItem?.petExp ?? null,
        petStatsUpdatedAt: inv.petStatsUpdatedAt ?? null,
        itemsUsedThisLevel: inv.itemsUsedThisLevel,
        atkBoost: shopItem?.atkBoost ?? null,
        defBoost: shopItem?.defBoost ?? null,
        healthBoost: shopItem?.healthBoost ?? null,
        specialSkill: shopItem?.specialSkill ?? null,
        specialSkillType: (shopItem as any)?.specialSkillType ?? null,
        skillDamagePercent: shopItem?.skillDamagePercent ?? null,
        skillHealPercent: (shopItem as any)?.skillHealPercent ?? null,
        skillType: (shopItem as any)?.skillType ?? null,
        skillAffects: (shopItem as any)?.skillAffects ?? null,
        fishingType: shopItem?.fishingType ?? null,
        rarityBoostPercent: shopItem?.rarityBoostPercent ?? null,
        baitRarityBoostStar: shopItem?.baitRarityBoostStar ?? null,
        baitCatchBoost: shopItem?.baitCatchBoost ?? null,
        poleMaxUses: shopItem?.poleMaxUses ?? null,
        poleUsesLeft: inv.poleUsesLeft ?? null,
        poleSlowdown3: shopItem?.poleSlowdown3 ?? null,
        poleSlowdown4: shopItem?.poleSlowdown4 ?? null,
        poleSlowdown5: shopItem?.poleSlowdown5 ?? null,
        fishSwimZone: shopItem?.fishSwimZone ?? null,
        quantity: inv.quantity ?? 1,
        xpBoostPct: (inv as any).xpBoostPct ?? null,
        xpBoostUntil: (inv as any).xpBoostUntil ?? null,
      }));
      return res.json(itemsWithDetails);
    } catch (err) {
      console.error("Get inventory error:", err);
      return res.status(500).json({ message: "Failed to get inventory" });
    }
  });

  app.post("/api/shop/sell-items", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items array required" });
      }
      const COINS_PER_ITEM = 2;
      let totalCoinsEarned = 0;
      for (const entry of items) {
        const { inventoryId, quantity = 1 } = entry;
        if (!inventoryId || typeof inventoryId !== "string") continue;
        const invItem = await storage.getInventoryItemById(inventoryId);
        if (!invItem || invItem.userId !== user.id) continue;
        const shopItem = invItem.shopItemId ? await storage.getShopItem(invItem.shopItemId) : null;
        if (shopItem?.type === "pet") continue;
        if (shopItem?.fishingType === "fish") continue;
        const currentQty = invItem.quantity ?? 1;
        const toSell = Math.min(Math.max(1, quantity), currentQty);
        if (toSell >= currentQty) {
          await storage.removeFromInventory(inventoryId);
        } else {
          await storage.updateInventoryItem(inventoryId, { quantity: currentQty - toSell });
        }
        totalCoinsEarned += COINS_PER_ITEM * toSell;
      }
      if (totalCoinsEarned === 0) {
        return res.status(400).json({ message: "No valid items to sell" });
      }
      const updated = await storage.addCoins(user.id, totalCoinsEarned);
      return res.json({ coinsEarned: totalCoinsEarned, newBalance: updated.coins });
    } catch (err) {
      console.error("Sell items error:", err);
      return res.status(500).json({ message: "Failed to sell items" });
    }
  });

  app.delete("/api/inventory/:inventoryId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const allInv = await storage.getUserInventory(user.id);
      const item = allInv.find((inv) => inv.id === inventoryId);
      if (!item) {
        return res.status(404).json({ message: "Item not found in your inventory" });
      }
      if (item.id === user.activePetId) {
        return res.status(400).json({ message: "Cannot delete your active pet" });
      }
      const quest = await db.execute(sql`SELECT value FROM game_settings WHERE key=${LONELLE_KEY(user.id)}`);
      if (parseLonelleProgress(quest.rows[0]?.value)?.scarfInventoryId === inventoryId) {
        return res.status(409).json({ message: "Return Lonelle's quest scarf before deleting it" });
      }
      await storage.removeFromInventory(inventoryId);
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete inventory item error:", err);
      return res.status(500).json({ message: "Failed to delete item" });
    }
  });

  app.patch("/api/inventory/:inventoryId/nickname", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const { nickname } = req.body;
      const trimmed = (nickname || "").trim().slice(0, 20);
      if (trimmed && await containsBadWord(trimmed)) {
        return res.status(400).json({ message: "That name contains a forbidden word. Please choose another." });
      }
      const item = await storage.getInventoryItemById(inventoryId);
      if (!item || item.userId !== user.id) {
        return res.status(404).json({ message: "Item not found" });
      }
      const updated = await storage.updateInventoryItem(inventoryId, { petNickname: trimmed || null });
      return res.json(updated);
    } catch (err) {
      console.error("Update nickname error:", err);
      return res.status(500).json({ message: "Failed to update nickname" });
    }
  });

  app.post("/api/shop/:worldId/buy/:itemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemId } = req.params as Record<string, string>;
      const rawQuantity = req.body?.quantity ?? 1;
      const quantity = typeof rawQuantity === "number" || typeof rawQuantity === "string"
        ? Number(rawQuantity)
        : NaN;
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
        return res.status(400).json({ message: "Quantity must be a whole number between 1 and 20" });
      }

      const shopItem = await storage.getShopItem(itemId);
      if (!shopItem) {
        return res.status(404).json({ message: "Item not found" });
      }

      let isFirstPetAcquisition = false;
      if (shopItem.type === "pet") {
        const petCount = await storage.countInventoryPetCopies(user.id, itemId);
        isFirstPetAcquisition = petCount === 0;
      } else {
        const dailyCount = await storage.getDailyItemPurchaseCount(user.id);
        if (dailyCount + quantity > 100) {
          return res.status(400).json({ message: "Daily purchase limit reached (100 items/day)" });
        }
      }

      const purchaseCount = shopItem.type === "pet" ? 1 : quantity;
      const purchase = await purchaseInventoryItem({
        transaction: async (work) => await db.transaction(async (tx) => work(tx)),
        deductCoins: async (tx: ShopPurchaseTransaction, userId, cost) => {
          const [updated] = await tx
            .update(usersTable)
            .set({ coins: sql`${usersTable.coins} - ${cost}` })
            .where(and(eq(usersTable.id, userId), sql`${usersTable.coins} >= ${cost}`))
            .returning();
          return updated;
        },
        grant: async (tx: ShopPurchaseTransaction, { userId, quantity: requestedQuantity }) => {
          let invItem: any = null;
          if (shopItem.fishingType === "bait") {
            const baitChargesPerPurchase = 5;
            const [existing] = await tx.select().from(userInventory)
              .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, itemId)));
            if (existing) {
              [invItem] = await tx.update(userInventory)
                .set({ quantity: sql`COALESCE(${userInventory.quantity}, 0) + ${baitChargesPerPurchase * requestedQuantity}` })
                .where(eq(userInventory.id, existing.id)).returning();
            } else {
              [invItem] = await tx.insert(userInventory).values({ userId, shopItemId: itemId, quantity: baitChargesPerPurchase * requestedQuantity }).returning();
            }
          } else if (shopItem.type === "potion" || shopItem.type === "edibles") {
            const limit = shopItem.type === "potion" ? 50 : 30;
            // Serialize this user's stacks so topping off and overflow inserts
            // remain consistent with concurrent purchases.
            await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId})::int, hashtext(${itemId})::int)`);
            const rows: any = await tx.execute(sql`SELECT * FROM user_inventory WHERE user_id = ${userId} AND shop_item_id = ${itemId} ORDER BY acquired_at ASC NULLS FIRST FOR UPDATE`);
            let remaining = requestedQuantity;
            for (const row of (rows.rows ?? rows)) {
              if (remaining <= 0) break;
              const add = Math.min(limit - (row.quantity ?? 1), remaining);
              if (add <= 0) continue;
              [invItem] = await tx.update(userInventory).set({ quantity: sql`LEAST(${limit}, COALESCE(${userInventory.quantity}, 1) + ${add})` }).where(eq(userInventory.id, row.id)).returning();
              remaining -= add;
            }
            while (remaining > 0) {
              const chunk = Math.min(limit, remaining);
              [invItem] = await tx.insert(userInventory).values({ userId, shopItemId: itemId, quantity: chunk }).returning();
              remaining -= chunk;
            }
          } else {
            for (let i = 0; i < requestedQuantity; i++) {
              const extraFields: any = {};
              if (shopItem.fishingType === "pole" && shopItem.poleMaxUses != null) extraFields.poleUsesLeft = shopItem.poleMaxUses;
              // Pets and poles must be individual rows. Other generic shop
              // items preserve the existing storage stacking behaviour.
              if (shopItem.type !== "pet" && shopItem.fishingType !== "pole") {
                const [existing] = await tx.select().from(userInventory).where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, itemId)));
                if (existing) [invItem] = await tx.update(userInventory).set({ quantity: sql`COALESCE(${userInventory.quantity}, 0) + 1` }).where(eq(userInventory.id, existing.id)).returning();
                else [invItem] = await tx.insert(userInventory).values({ userId, shopItemId: itemId, quantity: 1 }).returning();
              } else {
                [invItem] = await tx.insert(userInventory).values({ userId, shopItemId: itemId, ...extraFields, ...(shopItem.type === "pet" ? { hatchStartedAt: new Date() } : {}) }).returning();
              }
            }
          }
          return invItem;
        },
      }, { userId: user.id, unitPrice: shopItem.price, quantity: purchaseCount });
      if (!purchase.ok) {
        return res.status(400).json({ message: "Not enough coins" });
      }
      const safeUser = publicAccount(purchase.user as any);

      // Veridian Watcher congratulation for first 4/5-star pet acquisition
      if (shopItem.type === "pet" && isFirstPetAcquisition && (shopItem.starRarity ?? 0) >= 4) {
        const stars = "⭐".repeat(shopItem.starRarity ?? 4);
        if (user.watcherShoutoutsEnabled !== false) {
          postWatcherMessage(`✨ The stars align! ${user.username} has just acquired the rare ${stars} ${shopItem.name}! A magnificent addition to their collection — well done, adventurer!`).catch(() => {});
        }
      }

      return res.json({ inventory: purchase.inventory, user: safeUser, quantity: purchaseCount });
    } catch (err) {
      console.error("Buy item error:", err);
      return res.status(500).json({ message: "Failed to purchase item" });
    }
  });

  app.post("/api/pet/:inventoryId/hatch-check", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const invItem = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!invItem || invItem.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      const shopItem = await storage.getShopItem(invItem.shopItemId);
      if (!shopItem || shopItem.type !== "pet") {
        return res.status(400).json({ message: "Not a pet" });
      }
      if (invItem.isHatched) {
        return res.json({ isHatched: true });
      }
      if (invItem.hatchStartedAt) {
        // Eggs with no hatchTime (or hatchTime=0) are always ready once started.
        // Market-purchased eggs are backdated past hatchTime so this fires for them too.
        const elapsed = Date.now() - new Date(invItem.hatchStartedAt).getTime();
        const required = shopItem.hatchTime ? shopItem.hatchTime * 3600000 : 0;
        if (elapsed >= required) {
          await storage.updateInventoryItem(invItem.id, {
            isHatched: true,
            petLevel: Math.max(1, invItem.petLevel || 0),
          });
          return res.json({ isHatched: true });
        }
      }
      return res.json({ isHatched: false });
    } catch (err) {
      console.error("Hatch check error:", err);
      return res.status(500).json({ message: "Failed to check hatch status" });
    }
  });

  app.get("/api/user/equipped-accessory-ids", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const rows = await db.execute(sql`
        SELECT pea.accessory_inventory_id AS id
        FROM pet_equipped_accessories pea
        JOIN user_inventory ui ON ui.id = pea.pet_inventory_id
        WHERE ui.user_id = ${user.id}
      `);
      return res.json((rows.rows as any[]).map(r => r.id));
    } catch (err) {
      return res.status(500).json({ message: "Failed to get equipped accessory ids" });
    }
  });

  app.get("/api/pet/:inventoryId/accessories/public", isAuthenticated, async (req, res) => {
    try {
      const { inventoryId } = req.params as Record<string, string>;
      const petInv = await storage.getInventoryItemById(inventoryId);
      if (!petInv) return res.status(404).json({ message: "Pet not found" });
      const equipped = await storage.getPetEquippedAccessories(inventoryId);
      return res.json(equipped);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get accessories" });
    }
  });

  app.get("/api/pet/:inventoryId/accessories", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const petInv = await storage.getInventoryItemById(inventoryId);
      if (!petInv || petInv.userId !== user.id) return res.status(404).json({ message: "Pet not found" });
      const equipped = await storage.getPetEquippedAccessories(inventoryId);

      // Keep this endpoint focused on the selected pet. The Closet reads
      // available items from /api/inventory, matching the working costume flow.
      return res.json({
        equipped,
        extraSlots: petInv.accessoryExtraSlots ?? 0,
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get accessories" });
    }
  });

  app.post("/api/pet/:inventoryId/equip", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const { accessoryInventoryId } = req.body;
      if (!accessoryInventoryId) return res.status(400).json({ message: "Missing accessoryInventoryId" });
      const petInv = await storage.getInventoryItemById(inventoryId);
      if (!petInv || petInv.userId !== user.id) return res.status(404).json({ message: "Pet not found" });
      if (!petInv.isHatched) return res.status(400).json({ message: "Pet has not hatched yet" });
      const accInv = await storage.getInventoryItemById(accessoryInventoryId);
      if (!accInv || accInv.userId !== user.id) return res.status(404).json({ message: "Accessory not found" });
      const accShopItem = await storage.getShopItem(accInv.shopItemId);
      if (!accShopItem || accShopItem.type?.trim().toLowerCase() !== "accessory") {
        return res.status(400).json({ message: "Item is not an accessory" });
      }
      if (accInv.isListed) return res.status(400).json({ message: "Listed accessories cannot be equipped" });
      const [equippedElsewhere] = await db.select({ petInventoryId: petEquippedAccessories.petInventoryId })
        .from(petEquippedAccessories)
        .where(eq(petEquippedAccessories.accessoryInventoryId, accessoryInventoryId))
        .limit(1);
      if (equippedElsewhere) return res.status(409).json({ message: "That accessory is already equipped to a pet" });
      const currentEquipped = await storage.getPetEquippedAccessories(inventoryId);
      // Read extra slots from the pet's own fresh DB row, not the stale Passport session
      const maxSlots = 3 + (petInv.accessoryExtraSlots ?? 0);
      if (currentEquipped.length >= maxSlots) return res.status(400).json({ message: `All ${maxSlots} accessory slots are full` });
      if (currentEquipped.find(e => e.accessoryInventoryId === accessoryInventoryId)) return res.status(400).json({ message: "Accessory already equipped" });
      const equipped = await storage.equipAccessory(inventoryId, accessoryInventoryId, maxSlots);
      const atkGain    = accShopItem.atkBoost    || 0;
      const defGain    = accShopItem.defBoost    || 0;
      const healthGain = accShopItem.healthBoost || 0;
      if (atkGain !== 0 || defGain !== 0 || healthGain !== 0) {
        await storage.updateInventoryItem(inventoryId, {
          petAtk:    petInv.petAtk    + atkGain,
          petDef:    petInv.petDef    + defGain,
          petHealth: petInv.petHealth + healthGain,
        });
      }
      return res.json({ equipped, atkGain, defGain, healthGain });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Failed to equip accessory" });
    }
  });

  app.post("/api/pet/:inventoryId/unequip", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const { accessoryInventoryId } = req.body;
      if (!accessoryInventoryId) return res.status(400).json({ message: "Missing accessoryInventoryId" });
      const petInv = await storage.getInventoryItemById(inventoryId);
      if (!petInv || petInv.userId !== user.id) return res.status(404).json({ message: "Pet not found" });
      const equipped = await storage.getPetEquippedAccessories(inventoryId);
      const record = equipped.find(e => e.accessoryInventoryId === accessoryInventoryId);
      if (!record) return res.status(404).json({ message: "Accessory not equipped" });
      const atkLoss    = record.atkBoost    || 0;
      const defLoss    = record.defBoost    || 0;
      const healthLoss = record.healthBoost || 0;
      await storage.unequipAccessory(inventoryId, accessoryInventoryId);
      if (atkLoss !== 0 || defLoss !== 0 || healthLoss !== 0) {
        await storage.updateInventoryItem(inventoryId, {
          petAtk:    Math.max(0, petInv.petAtk    - atkLoss),
          petDef:    Math.max(0, petInv.petDef    - defLoss),
          petHealth: Math.max(0, petInv.petHealth - healthLoss),
        });
      }
      return res.json({ success: true, atkLoss, defLoss, healthLoss });
    } catch (err: any) {
      return res.status(400).json({ message: err?.message || "Failed to unequip accessory" });
    }
  });


  app.post("/api/pet/:petInventoryId/unlock-accessory-slot", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { petInventoryId } = req.params as Record<string, string>;
      const petInv = await storage.getInventoryItemById(petInventoryId);
      if (!petInv || petInv.userId !== user.id) return res.status(404).json({ message: "Pet not found" });
      const currentExtra = petInv.accessoryExtraSlots ?? 0;
      if (currentExtra >= 2) return res.status(400).json({ message: "Maximum accessory slots already unlocked for this pet" });
      const SLOT_COST = 3000;
      const updated = await storage.atomicDeductCoins(user.id, SLOT_COST);
      if (!updated) return res.status(400).json({ message: "Not enough coins" });
      const updatedPet = await storage.updateInventoryItem(petInventoryId, { accessoryExtraSlots: currentExtra + 1 });
      return res.json({ extraSlots: updatedPet.accessoryExtraSlots, coins: updated.coins });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message || "Failed to unlock slot" });
    }
  });

  app.post("/api/pet/:inventoryId/power-up", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId } = req.body;

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }

      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      if (!petShopItem || petShopItem.type !== "pet") {
        return res.status(400).json({ message: "Not a pet" });
      }

      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }

      if (petInv.petLevel >= 100) {
        return res.status(400).json({ message: "Pet is at max level" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Item not found in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || (itemShopItem.type !== "power_up" && itemShopItem.type !== "item")) {
        return res.status(400).json({ message: "Not a usable power up" });
      }

      const boostType = itemShopItem.statBoostType;
      if (!boostType) {
        return res.status(400).json({ message: "This item has no stat boost" });
      }

      // slots per level: 1★→1/lvl, 2★→1/lvl, 3★→2/lvl, 4-5★→3/lvl
      const rawRarity = petShopItem.rarity || 1;
      const maxItemsPerLevel = rawRarity <= 2 ? 1 : rawRarity === 3 ? 2 : 3;
      const petLevel = petInv.petLevel || 1;
      const totalUsed = Math.max(0, petInv.itemsUsedThisLevel || 0);
      const totalAllowances = petLevel * maxItemsPerLevel;
      if (boostType !== "lvl" && totalUsed >= totalAllowances) {
        return res.status(400).json({ message: `No power-up slots available. Level up your pet to earn more!` });
      }

      const updates: any = { itemsUsedThisLevel: totalUsed + 1 };
      const boostAmount = itemShopItem.statBoostAmount || 10;

      if (boostType === "health") {
        updates.petHealth = (petInv.petHealth || 1000) + boostAmount;
      } else if (boostType === "atk") {
        updates.petAtk = (petInv.petAtk || 50) + boostAmount;
      } else if (boostType === "def") {
        updates.petDef = (petInv.petDef || 50) + boostAmount;
      } else if (boostType === "lvl") {
        const { newLevel, newPoints } = applyPetXp(petLevel, petInv.petLevelPoints || 0, boostAmount);
        updates.petLevelPoints = newPoints;
        if (newLevel > petLevel) {
          updates.petLevel = newLevel;
        }
      }

      const updatedPet = await db.transaction(async (tx) => {
        const [pet] = await tx
          .update(userInventory)
          .set(updates)
          .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
          .returning();
        if (!pet) throw new Error("Pet was not available for power up");
        const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
        if (!consumed) throw new Error("Power-up item is no longer available");
        return pet;
      });

      // Quest progress: use_powerup
      incrementQuestProgress(user.id, "use_powerup").catch(() => {});

      return res.json(updatedPet);
    } catch (err) {
      console.error("Power up error:", err);
      return res.status(500).json({ message: "Failed to power up pet" });
    }
  });

  app.post("/api/pet/:inventoryId/use-special", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId, tutorialFill } = req.body;

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }

      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      if (!petShopItem || petShopItem.type !== "pet") {
        return res.status(400).json({ message: "Not a pet" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Item not found in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "special") {
        return res.status(400).json({ message: "Not a special item" });
      }

      const specialType = itemShopItem.specialType;
      const specialAmount = itemShopItem.specialAmount || 10;

      if (specialType === "hatch_time") {
        if (petInv.isHatched) {
          return res.status(400).json({ message: "Pet is already hatched" });
        }
        // Accelerated hatch progress is RESERVED for Begin Journey. Each of
        // the three granted potions advances exactly one third of the full hatch
        // duration, so players learn the real use flow before the egg is ready.
        // It is authorized server-side (never by the client flag alone): the
        // player must have claimed tutorial potions but not yet completed the
        // quest. The client's tutorialFill is only an intent hint;
        // a spoofed flag does nothing outside the genuine tutorial window. Players
        // who have not started OR have finished the tutorial always get the
        // item's specific minute reduction below.
        let allowInstantFill = false;
        if (tutorialFill === true) {
          const trows = await db.execute(sql`SELECT tutorial_hatch_potions_claimed, tutorial_quest_completed FROM users WHERE id = ${user.id}`);
          const trow = (trows as any).rows?.[0] ?? (trows as any)?.[0];
          allowInstantFill = !!trow?.tutorial_hatch_potions_claimed && !trow?.tutorial_quest_completed;
        }
        let hatchUpdate: Record<string, any>;
        if (allowInstantFill) {
          // Tutorial only: advance one third of the configured hatch duration.
          // Three successful potion uses make the egg ready regardless of its
          // normal hatch time.
          const hatchTimeHours = (petShopItem.hatchTime ?? 24) as number;
          const tutorialStepMs = (hatchTimeHours * 3600 * 1000) / BEGIN_JOURNEY_TUTORIAL.hatchPotion.quantity;
          const currentStart = petInv.hatchStartedAt ? new Date(petInv.hatchStartedAt) : new Date();
          hatchUpdate = { hatchStartedAt: new Date(currentStart.getTime() - tutorialStepMs - 500) };
        } else {
          // NORMAL PLAY: reduce the remaining hatch time by the item's specific
          // amount (specialAmount minutes) by moving hatchStartedAt earlier —
          // it does NOT instantly finish hatching.
          const currentStart = petInv.hatchStartedAt ? new Date(petInv.hatchStartedAt) : new Date();
          hatchUpdate = { hatchStartedAt: new Date(currentStart.getTime() - specialAmount * 60 * 1000) };
        }
        const updatedPet = await db.transaction(async (tx) => {
          const [pet] = await tx
            .update(userInventory)
            .set(hatchUpdate)
          .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
          .returning();
          if (!pet) throw new Error("Pet was not available for special use");
          const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
          if (!consumed) throw new Error("Special item is no longer available");
          return pet;
        });
        return res.json(updatedPet);
      } else if (specialType === "level") {
        if (!petInv.isHatched) {
          return res.status(400).json({ message: "Pet has not hatched yet" });
        }
        const currentLevel = petInv.petLevel || 1;
        if (currentLevel >= 100) {
          return res.status(400).json({ message: "Pet is at max level" });
        }
        const { newLevel, newPoints } = applyPetXp(currentLevel, petInv.petLevelPoints || 0, specialAmount);
        const updates: any = { petLevelPoints: newPoints };
        if (newLevel !== currentLevel) {
          updates.petLevel = newLevel;
        }
        const updatedPet = await db.transaction(async (tx) => {
          const [pet] = await tx
            .update(userInventory)
            .set(updates)
            .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
            .returning();
          if (!pet) throw new Error("Pet was not available for special use");
          const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
          if (!consumed) throw new Error("Special item is no longer available");
          return pet;
        });
        return res.json(updatedPet);
      } else {
        return res.status(400).json({ message: "Unknown special type" });
      }
    } catch (err) {
      console.error("Use special error:", err);
      return res.status(500).json({ message: "Failed to use special item" });
    }
  });

  // Per-pet petting reward. Counters live on the inventory row so each of the
  // player's pets has its own daily allotment: the first successful petting
  // circle on each pet (per UTC day) always grants 10 coins; up to 4 extra
  // rewards (3-5 coins each, ~30% chance) may follow on that same pet.
  app.post("/api/pets/:inventoryId/petting-reward", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const inventoryId = String(req.params.inventoryId || "");
      if (!inventoryId) return res.status(400).json({ message: "inventoryId required" });

      const state = await storage.getPetPettingState(user.id, inventoryId);
      if (!state) return res.status(404).json({ message: "Pet not found" });

      // First 3 pettings per hour give a small mood boost (deterministic,
      // no hunger gate). The timestamp is always recorded so the neglect-decay
      // clock resets on every pet regardless of whether mood changed.
      let moodGained = 0;
      let pettingsThisHour = 0;
      const pettedPet = await storage.getInventoryItemById(inventoryId);
      if (pettedPet && pettedPet.userId === user.id) {
        const nowMs = Date.now();
        const MOOD_PETTING_WINDOW_MS = 60 * 60 * 1000;
        const MOOD_PETTING_MAX_PER_WINDOW = 3;
        const MOOD_PETTING_GAIN = 3;
        const wsRaw = (pettedPet as any).moodPettingWindowStart;
        const ws = wsRaw ? new Date(wsRaw).getTime() : 0;
        const cnt = (pettedPet as any).moodPettingCount ?? 0;
        const windowExpired = !ws || (nowMs - ws) > MOOD_PETTING_WINDOW_MS;
        const newWs = windowExpired ? nowMs : ws;
        const newCnt = windowExpired ? 1 : cnt + 1;
        const allowMoodGain = newCnt <= MOOD_PETTING_MAX_PER_WINDOW;
        moodGained = allowMoodGain ? MOOD_PETTING_GAIN : 0;
        pettingsThisHour = Math.min(newCnt, MOOD_PETTING_MAX_PER_WINDOW);
        let newMood = Math.min(100, (pettedPet.petMood ?? 100) + moodGained);
        if (pettedPet.lastBattleDefeatAt) {
          const sinceDefeatMin = (nowMs - new Date(pettedPet.lastBattleDefeatAt).getTime()) / 60000;
          if (sinceDefeatMin < BATTLE_DEFEAT_RECENT_MINUTES) {
            newMood = Math.min(newMood, BATTLE_DEFEAT_MOOD_CAP);
          }
        }
        await storage.updateInventoryItem(inventoryId, {
          petMood: newMood,
          lastPettedAt: new Date(nowMs),
          petStatsUpdatedAt: new Date(nowMs),
          moodPettingWindowStart: new Date(newWs),
          moodPettingCount: Math.min(newCnt, MOOD_PETTING_MAX_PER_WINDOW),
        } as any);
      }

      const now = new Date();
      const last = state.lastPettingRewardAt;
      const sameDay = !!last
        && last.getUTCFullYear() === now.getUTCFullYear()
        && last.getUTCMonth() === now.getUTCMonth()
        && last.getUTCDate() === now.getUTCDate();

      // Roll over to a fresh day's allotment whenever the UTC day changes.
      const countSoFar = sameDay ? (state.pettingRewardsToday ?? 0) : 0;

      const MAX_REWARDS_PER_DAY = 5;        // 1 guaranteed + 4 randomized
      const EXTRA_REWARD_CHANCE = 0.30;     // ~30% per attempt after the first

      // First petting of the day for this pet → guaranteed 10 coins.
      if (countSoFar === 0) {
        const updated = await storage.addCoins(user.id, 10);
        await storage.setPetPettingState(user.id, inventoryId, now, 1);
        return res.json({ rewarded: true, coins: updated.coins, amount: 10, moodGained, pettingsThisHour });
      }

      // Pet has already given its daily max → animation only.
      if (countSoFar >= MAX_REWARDS_PER_DAY) {
        const u = await storage.getUser(user.id);
        return res.json({ rewarded: false, coins: u?.coins ?? 0, moodGained, pettingsThisHour });
      }

      // Random chance for each extra reward beyond the first.
      if (Math.random() > EXTRA_REWARD_CHANCE) {
        const u = await storage.getUser(user.id);
        return res.json({ rewarded: false, coins: u?.coins ?? 0, moodGained, pettingsThisHour });
      }

      const amount = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
      const updated = await storage.addCoins(user.id, amount);
      await storage.setPetPettingState(user.id, inventoryId, now, countSoFar + 1);
      return res.json({ rewarded: true, coins: updated.coins, amount, moodGained, pettingsThisHour });
    } catch (err) {
      console.error("Petting reward error:", err);
      return res.status(500).json({ message: "Failed to grant petting reward" });
    }
  });

  // ── Molten Blocks ────────────────────────────────────────────────────────
  registerMoltenBlocksRoutes(app, { storage, isAuthenticated, isAdmin });

  app.post("/api/pet/:inventoryId/feed-edible", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId, quantity: rawQuantity } = req.body;
      if (typeof itemInventoryId !== "string" || !itemInventoryId) {
        return res.status(400).json({ message: "itemInventoryId required" });
      }
      const quantity = rawQuantity == null ? 1 : Number(rawQuantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: "Quantity must be a positive integer" });
      }

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Edible not found in inventory" });
      }
      const availableQty = itemInv.quantity ?? 0;
      if (availableQty <= 0) {
        return res.status(409).json({ message: "Edible has already been consumed" });
      }
      if (quantity > availableQty) {
        return res.status(400).json({ message: "Not enough items in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "edibles") {
        return res.status(400).json({ message: "Not an edible item" });
      }

      // Edibles grant "feed points" (lifetime tally) AND restore the pet's
      // hunger meter by the same amount, capped at the pet's HP. Mood gets a
      // small immediate bump too, since the pet is happy after eating.
      const feedPointsPerUnit = itemShopItem.statBoostAmount || 5;
      const totalFeedPoints = feedPointsPerUnit * quantity;
      const maxHunger = 1000;
      const currentHunger = petInv.petHunger == null || petInv.petHunger < 0 ? maxHunger : petInv.petHunger;
      const newHunger = Math.min(maxHunger, currentHunger + totalFeedPoints);
      // Mood gain on feed is small overall, and even smaller when the pet was
      // already too hungry to enjoy the meal. This keeps the mood bar harder
      // to fill — feeding alone can't max it out.
      const wasHungry = (currentHunger / maxHunger) < 0.5;
      const moodGain = wasHungry ? 1 : 3;
      let newMood = Math.min(100, (petInv.petMood ?? 100) + moodGain);
      // Recent battle defeats cap how high mood can rise.
      if (petInv.lastBattleDefeatAt) {
        const sinceDefeatMin = (Date.now() - new Date(petInv.lastBattleDefeatAt).getTime()) / 60000;
        if (sinceDefeatMin < BATTLE_DEFEAT_RECENT_MINUTES) {
          newMood = Math.min(newMood, BATTLE_DEFEAT_MOOD_CAP);
        }
      }
      const updates: any = {
        petFeedPoints: (petInv.petFeedPoints || 0) + totalFeedPoints,
        petHunger: newHunger,
        petMood: newMood,
        petStatsUpdatedAt: new Date(),
        lastFedAt: new Date(),
      };

      const expAdded = Math.max(0, itemShopItem.petExp ?? 0) * quantity;
      const updatedPet = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`SELECT pet_level, pet_level_points FROM user_inventory
          WHERE id = ${petInv.id} AND user_id = ${user.id} FOR UPDATE`);
        const current = locked.rows[0];
        if (!current) throw new Error("Pet was not available for feeding");
        if (expAdded > 0) {
          const { newLevel, newPoints } = applyPetXp(Number(current.pet_level), Number(current.pet_level_points), expAdded);
          updates.petLevel = newLevel;
          updates.petLevelPoints = newPoints;
        }
        const [pet] = await tx.update(userInventory)
          .set(updates)
          .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
          .returning();
        if (!pet) throw new Error("Pet was not available for feeding");
        if (!await tryConsumeInventoryQuantity(tx, user.id, itemInv.id, quantity)) {
          throw new Error("Edible is no longer available");
        }
        return pet;
      });
      // Quest progress: feed_pet
      incrementQuestProgress(user.id, "feed_pet").catch(() => {});
      return res.json({ ...updatedPet, totalFeedPoints, expAdded });
    } catch (err) {
      console.error("Feed edible error:", err);
      if (err instanceof Error && err.message === "Edible is no longer available") {
        return res.status(409).json({ message: "Edible has already been consumed" });
      }
      return res.status(500).json({ message: "Failed to feed edible" });
    }
  });

  // Give a "gift" item to a pet on the Pet Care page. Each gift adds the
  // item's giftPoints to the pet's loyalty meter (cap is rarity-based:
  // 1★=1000, 2★=2000, 3★=3000, 4★=4000, 5★=5000) and is removed from
  // inventory. Configured pet EXP also uses the standard leveling curve.
  app.post("/api/pet/:inventoryId/give-gift", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId } = req.body;
      if (typeof itemInventoryId !== "string" || !itemInventoryId) {
        return res.status(400).json({ message: "itemInventoryId required" });
      }

      const petInv = await storage.getInventoryItemById(req.params.inventoryId as string);
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Gift not found in inventory" });
      }
      if ((itemInv.quantity ?? 0) <= 0) {
        return res.status(409).json({ message: "Gift has already been consumed" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "gift") {
        return res.status(400).json({ message: "Not a gift item" });
      }

      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      const starRarity = petShopItem?.starRarity ?? 1;
      const loyaltyMaxMap: Record<number, number> = { 1: 1000, 2: 2000, 3: 3000, 4: 4000, 5: 5000 };
      const loyaltyMax = loyaltyMaxMap[starRarity] ?? 1000;

      const points = Math.max(0, itemShopItem.giftPoints || 0);
      const newLoyalty = Math.min(loyaltyMax, (petInv.petLoyalty ?? 0) + points);
      const expAdded = Math.max(0, itemShopItem.petExp ?? 0);
      const updated = await db.transaction(async (tx) => {
        const locked = await tx.execute(sql`SELECT pet_level, pet_level_points FROM user_inventory
          WHERE id = ${petInv.id} AND user_id = ${user.id} FOR UPDATE`);
        const current = locked.rows[0];
        if (!current) throw new Error("Pet was not available for gift");
        const xp = expAdded > 0
          ? applyPetXp(Number(current.pet_level), Number(current.pet_level_points), expAdded) : null;
        const [pet] = await tx.update(userInventory)
          .set({ petLoyalty: newLoyalty, ...(xp ? { petLevel: xp.newLevel, petLevelPoints: xp.newPoints } : {}) })
          .where(and(eq(userInventory.id, petInv.id), eq(userInventory.userId, user.id)))
          .returning();
        if (!pet) throw new Error("Pet was not available for gift");
        const { consumed } = await tryConsumeOneFromInventory(tx, user.id, itemInv.id);
        if (!consumed) throw new Error("Gift is no longer available");
        return pet;
      });
      return res.json({ pet: updated, loyaltyAdded: points, petLoyalty: newLoyalty, expAdded });
    } catch (err) {
      console.error("Give gift error:", err);
      if (err instanceof Error && err.message === "Gift is no longer available") {
        return res.status(409).json({ message: "Gift has already been consumed" });
      }
      return res.status(500).json({ message: "Failed to give gift" });
    }
  });

  // Claim the loyalty reward once the bar is full. Awards coins based on the
  // pet's star rarity, optionally levels up all of the player's hatched pets,
  // restores hunger + mood to max, and resets petLoyalty to 0.
  app.post("/api/pet/:inventoryId/claim-loyalty-reward", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const petInv = await storage.getInventoryItemById(req.params.inventoryId as string);
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }

      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      const starRarity = petShopItem?.starRarity ?? 1;
      const loyaltyMaxMap: Record<number, number> = { 1: 1000, 2: 2000, 3: 3000, 4: 4000, 5: 5000 };
      const loyaltyMax = loyaltyMaxMap[starRarity] ?? 1000;

      if ((petInv.petLoyalty ?? 0) < loyaltyMax) {
        return res.status(400).json({ message: "Loyalty bar is not full yet" });
      }

      // Coin rewards by star rarity
      const coinRewardMap: Record<number, number> = { 1: 1000, 2: 1000, 3: 1500, 4: 2500, 5: 3500 };
      const coinsToAward = coinRewardMap[starRarity] ?? 1000;

      // XP boost: 1-3 stars → 10%, 4-5 stars → 20%, lasts 1 hour
      const xpBoostPct = starRarity >= 4 ? 20 : 10;
      const xpBoostUntil = new Date(Date.now() + 60 * 60 * 1000);

      // Award coins to the user
      const updatedUser = await storage.addCoins(user.id, coinsToAward);

      // Fill hunger + mood, apply XP boost, and reset loyalty to 0
      const updatedPet = await storage.updateInventoryItem(petInv.id, {
        petLoyalty: 0,
        petHunger: 1000,
        petMood: 100,
        petStatsUpdatedAt: new Date(),
        lastFedAt: new Date(),
        xpBoostPct,
        xpBoostUntil,
      } as any);

      return res.json({
        pet: updatedPet,
        coinsAwarded: coinsToAward,
        xpBoostPct,
        userCoins: updatedUser.coins,
      });
    } catch (err) {
      console.error("Claim loyalty reward error:", err);
      return res.status(500).json({ message: "Failed to claim loyalty reward" });
    }
  });

  // Called by the client when the player's pet is knocked out in a world
  // battle. Drops mood and stamps lastBattleDefeatAt so the mood-cap kicks in.
  app.post("/api/pet/:inventoryId/world-defeat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const petInv = await storage.getInventoryItemById(req.params.inventoryId as string);
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      const newMood = Math.max(0, (petInv.petMood ?? 100) - 3);
      const updated = await storage.updateInventoryItem(petInv.id, {
        petMood: newMood,
        lastBattleDefeatAt: new Date(),
        petStatsUpdatedAt: new Date(),
      } as any);
      return res.json(updated);
    } catch (err) {
      console.error("World defeat mood penalty error:", err);
      return res.status(500).json({ message: "Failed to record world defeat" });
    }
  });

  app.post("/api/pet/:inventoryId/reset-stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const currentUser = await storage.getUser(user.id);
      if (!currentUser || currentUser.coins < 300) {
        return res.status(400).json({ message: "Not enough coins. Stat reset costs 300 coins." });
      }

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }

      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      if (!petShopItem || petShopItem.type !== "pet") {
        return res.status(400).json({ message: "Not a pet" });
      }

      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }

      await storage.addCoins(user.id, -300);
      await storage.unequipAllPetAccessories(petInv.id);
      const updatedPet = await storage.updateInventoryItem(petInv.id, {
        petHealth: 1000,
        petAtk: 50,
        petDef: 50,
        petLevel: 1,
        petLevelPoints: 0,
        itemsUsedThisLevel: 0,
      });

      const updatedUser = await storage.getUser(user.id);
      const safeUser = publicAccount(updatedUser!);

      return res.json({ pet: updatedPet, user: safeUser });
    } catch (err) {
      console.error("Reset stats error:", err);
      return res.status(500).json({ message: "Failed to reset stats" });
    }
  });

  // ── Revert a hatched pet back to an egg (unequips accessories, keeps stats) ──
  app.post("/api/pet/:inventoryId/revert-to-egg", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) return res.status(404).json({ message: "Pet not found" });
      const petShopItem = await storage.getShopItem(petInv.shopItemId);
      if (!petShopItem || petShopItem.type !== "pet") return res.status(400).json({ message: "Not a pet" });
      // Unequip all accessories (they stay in the player's inventory)
      await storage.unequipAllPetAccessories(petInv.id);
      // Revert to egg state — stats are preserved
      const updated = await storage.updateInventoryItem(petInv.id, {
        isHatched: false,
        hatchStartedAt: null,
      });
      return res.json({ ok: true, pet: updated });
    } catch (err) {
      console.error("Revert to egg error:", err);
      return res.status(500).json({ message: "Failed to revert pet to egg" });
    }
  });

  registerMarketplaceRoutes(app, marketplaceRouteDependencies, "details");

  // Pack names, amounts, prices, and current bonuses are public so visitors can
  // review the store before signing in. User-specific spending remains private.
  app.get("/api/coins/packs", async (req, res) => {
    try {
      const user = req.isAuthenticated() ? req.user as any : null;
      const dailyTotal = user ? await storage.getDailyPurchaseTotal(user.id) : 0;
      return res.json({
        packs: COIN_PACKS,
        dailySpent: dailyTotal,
        dailyLimit: MAX_PER_DAY,
        sessionLimit: MAX_PER_SESSION,
      });
    } catch (err) {
      console.error("Get coin packs error:", err);
      return res.status(500).json({ message: "Failed to get coin packs" });
    }
  });

  app.post("/api/coins/checkout", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { packId } = req.body;

      const pack = COIN_PACKS.find(p => p.id === packId);
      if (!pack) {
        return res.status(400).json({ message: "Invalid coin pack" });
      }

      if (pack.priceUsd > MAX_PER_SESSION) {
        return res.status(400).json({ message: `Maximum purchase is $${MAX_PER_SESSION} per transaction` });
      }

      const dailyTotal = await storage.getDailyPurchaseTotal(user.id);
      if (dailyTotal + pack.priceUsd > MAX_PER_DAY) {
        return res.status(400).json({ message: `Daily purchase limit is $${MAX_PER_DAY}. You've spent $${dailyTotal} today.` });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = process.env.APP_URL
        || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : null)
        || "https://parapets.net";

      const priceId = await getOrCreateStripePrice(stripe, pack);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/coins?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/coins?canceled=true`,
        metadata: {
          userId: user.id,
          packId: pack.id,
          coins: pack.coins.toString(),
          amountUsd: pack.priceUsd.toString(),
          priceId,
        },
      });

      return res.json({ url: session.url });
    } catch (err: any) {
      console.error("Checkout error:", err);
      const msg = err.message?.includes('production keys') || err.message?.includes('connection not found')
        ? "Coin purchases are temporarily unavailable. Please try again later."
        : "Failed to create checkout session";
      return res.status(500).json({ message: msg });
    }
  });

  app.post("/api/coins/verify", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    if (!sessionId) return res.status(400).json({ message: "Session ID required" });
    try {
      const stripe = await getUncachableStripeClient();
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
      const result = await fulfillStripePurchase(stripeSession as any, { expectedUserId: user.id });
      // Whichever entry point wins fulfillment must also award acquisition badges.
      // Keep this after commit and only on the winning path, as in the webhook.
      if (result.status === "fulfilled") {
        await maybeAwardAcquisitionBadges(result.userId, stripeSession.amount_total! / 100);
      }
      const updatedUser = await storage.getUser(user.id);
      const safeUser = publicAccount(updatedUser!);
      return res.json({
        credited: result.status === "fulfilled",
        alreadyCredited: result.status === "already_fulfilled",
        coins: result.coins,
        baseCoins: result.baseCoins,
        user: safeUser,
        eggBonus: result.status === "fulfilled" ? result.eggBonus : null,
      });
    } catch (err) {
      if (err instanceof StripePurchaseError) {
        const status = err.code === "player_mismatch" ? 403
          : ["unpaid", "invalid_state", "unsupported_package", "amount_mismatch", "currency_mismatch"].includes(err.code) ? 400
          : err.code === "concurrent_conflict" ? 409 : 404;
        return res.status(status).json({ message: err.message });
      }
      console.error("Verify purchase error:", err instanceof Error ? err.message : "unknown error");
      return res.status(502).json({ message: "Unable to verify payment with Stripe" });
    }
  });

  // ── Purchase progress bar ───────────────────────────────────────────────────
  app.get("/api/coins/progress", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const cycle = await storage.getContributionCycle(user.id);
      const cycleKey = `c-${cycle}`;
      const points = await storage.getMonthlyProgress(user.id, cycleKey);
      const claimedMilestones = await storage.getClaimedMilestones(user.id, cycleKey);
      const milestoneRewards = await storage.getMilestoneRewards();
      return res.json({ cycleKey, points, claimedMilestones, milestoneRewards });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Player-initiated milestone claim. Points accumulate on purchase; rewards
  // are only delivered here when the player clicks "Claim Reward" in the UI.
  // Grants coins/item directly to inventory (no gift inbox).
  app.post("/api/coins/claim-milestone", isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (Object.keys(body).some((key) => key !== "milestoneId") || typeof body.milestoneId !== "string") {
      return res.status(400).json({ message: "Only milestoneId may be submitted" });
    }
    try {
      const result = await claimPurchaseMilestone(user.id, body.milestoneId);
      return res.json({
        success: true,
        replayed: result.status === "already_claimed",
        milestoneId: result.milestoneId,
        claimedAt: result.claimedAt,
        coinsGranted: result.status === "claimed" ? result.reward.coins : 0,
        itemName: result.reward.itemName,
        itemImageUrl: result.reward.itemImageUrl,
        coinBalance: result.coinBalance,
      });
    } catch (err) {
      if (err instanceof PurchaseMilestoneError) {
        const status = err.code === "unknown_milestone" ? 404
          : err.code === "not_qualified" ? 409
          : ["missing_reward_configuration", "unsupported_reward_type", "invalid_reward_configuration", "invalid_legacy_claim_state"].includes(err.code) ? 422
          : err.code === "concurrent_conflict" ? 409 : 500;
        return res.status(status).json({ message: err.message, code: err.code });
      }
      console.error("Purchase milestone claim failed:", err instanceof Error ? err.message : "unknown error");
      return res.status(500).json({ message: "Unable to claim milestone reward" });
    }
  });

  app.get("/api/admin/milestone-rewards", isAdmin, async (_req, res) => {
    try {
      const rewards = await storage.getMilestoneRewards();
      return res.json(rewards);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin Metrics ─────────────────────────────────────────────────────────
  app.get("/api/admin/metrics", isAdmin, async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
      const now = new Date();
      const cutoff = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - (days - 1),
      ));

      const [dailyRows, countryRows, sourceRows, playerRows, signupRows, topPlayerRows] = await Promise.all([
        db.execute(sql`
          SELECT (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date::text AS date,
                 count(*)::int AS count,
                 count(DISTINCT user_id)::int AS "uniquePlayers"
          FROM player_login_events
          WHERE created_at >= ${cutoff}
          GROUP BY 1 ORDER BY 1
        `),
        db.execute(sql`
          SELECT coalesce(nullif(trim(country), ''), 'Unknown') AS country,
                 count(*)::int AS count,
                 count(DISTINCT user_id)::int AS "uniquePlayers"
          FROM player_login_events
          WHERE created_at >= ${cutoff}
          GROUP BY 1 ORDER BY 2 DESC LIMIT 15
        `),
        db.execute(sql`
          SELECT coalesce(nullif(trim(signup_referrer), ''), 'Direct') AS source,
                 count(*)::int AS count
          FROM users
          GROUP BY 1 ORDER BY 2 DESC
        `),
        db.execute(sql`
          SELECT count(*)::int AS "loginEvents",
                 count(DISTINCT user_id)::int AS "activePlayers"
          FROM player_login_events
          WHERE created_at >= ${cutoff}
        `),
        db.execute(sql`
          SELECT count(*)::int AS "totalPlayers",
                 count(*) FILTER (WHERE created_at >= ${cutoff})::int AS "newPlayers"
          FROM users
        `),
        db.execute(sql`
          SELECT u.id,
                 u.username,
                 u.profile_image AS "profileImage",
                 count(*)::int AS "loginCount",
                 max(e.created_at) AS "lastLoginAt"
          FROM player_login_events e
          JOIN users u ON u.id = e.user_id
          WHERE e.created_at >= ${cutoff}
          GROUP BY u.id, u.username, u.profile_image
          ORDER BY count(*) DESC, max(e.created_at) DESC
          LIMIT 10
        `),
      ]);

      const dailySignupRows = await db.execute(sql`
        SELECT (date_trunc('day', created_at AT TIME ZONE 'UTC'))::date::text AS date,
               count(*)::int AS count
        FROM users
        WHERE created_at >= ${cutoff}
        GROUP BY 1 ORDER BY 1
      `);

      const toArr = (r: any) => Array.isArray(r) ? r : ((r as any).rows ?? []);
      const activity = toArr(playerRows)[0] ?? { loginEvents: 0, activePlayers: 0 };
      const players = toArr(signupRows)[0] ?? { totalPlayers: 0, newPlayers: 0 };

      return res.json({
        overview: {
          totalPlayers: Number(players.totalPlayers) || 0,
          newPlayers: Number(players.newPlayers) || 0,
          activePlayers: Number(activity.activePlayers) || 0,
          loginEvents: Number(activity.loginEvents) || 0,
        },
        dailyLogins: toArr(dailyRows),
        dailySignups: toArr(dailySignupRows),
        loginsByCountry: toArr(countryRows),
        signupsBySource: toArr(sourceRows),
        topPlayers: toArr(topPlayerRows),
      });
    } catch (err: any) {
      console.error("[admin/metrics]", err);
      return res.status(500).json({ message: "Failed to load player metrics" });
    }
  });

  app.patch("/api/admin/milestone-rewards/:milestone", isAdmin, async (req, res) => {
    try {
      const milestonePoints = parseInt(String(req.params.milestone));
      if (![500, 2500, 5000, 10000].includes(milestonePoints)) {
        return res.status(400).json({ message: "Invalid milestone. Must be 500, 2500, 5000, or 10000" });
      }
      const { rewardCoins, rewardItemId, rewardItemName, rewardItemImageUrl, rewardLabel, starRarity } = req.body;
      await storage.setMilestoneReward(milestonePoints, {
        rewardCoins: rewardCoins !== undefined ? Number(rewardCoins) : 0,
        rewardItemId: rewardItemId || null,
        rewardItemName: rewardItemName || null,
        rewardItemImageUrl: rewardItemImageUrl || null,
        rewardLabel: rewardLabel || null,
        starRarity: starRarity != null ? Number(starRarity) : null,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/stripe/publishable-key", isAuthenticated, async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      return res.json({ publishableKey: key });
    } catch (err) {
      console.error("Get publishable key error:", err);
      return res.status(500).json({ message: "Failed to get Stripe key" });
    }
  });

  registerSupportRoutes(app, { storage, isAuthenticated, isAdmin });

  app.get("/api/admin/debug-admin-messages", isAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT id, username, subject, left(message, 40) as message_preview, created_at
        FROM admin_messages
        ORDER BY created_at DESC
        LIMIT 20
      `);
      return res.json({ tableExists: true, rows: result.rows, count: result.rows.length });
    } catch (err: any) {
      return res.json({ tableExists: false, error: err.message });
    }
  });

  app.get("/api/admin/users", isAdmin, async (_req, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const safeUsers = allUsers.map(publicAccount);
      return res.json(safeUsers);
    } catch (err) {
      console.error("Get users error:", err);
      return res.status(500).json({ message: "Failed to get users" });
    }
  });

  // ── Team endpoint (public) ────────────────────────────────────────────────
  app.get("/api/team", async (_req, res) => {
    try {
      const team = await storage.getTeamMembers();
      return res.json(team);
    } catch (err) {
      console.error("Get team error:", err);
      return res.status(500).json({ message: "Failed to get team" });
    }
  });

  // ── Moderator management ──────────────────────────────────────────────────
  app.patch("/api/admin/moderator/:userId", isAdmin, async (req: Request, res: Response) => {
    try {
      const target = await storage.getUser((req.params.userId as string));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.isAdmin) return res.status(400).json({ message: "Cannot change role of admin" });
      const { isModerator } = req.body;
      if (typeof isModerator !== "boolean") return res.status(400).json({ message: "isModerator must be boolean" });
      const updated = await storage.setModerator(target.id, isModerator);
      const safe = publicAccount(updated);
      return res.json(safe);
    } catch (err) {
      console.error("Set moderator error:", err);
      return res.status(500).json({ message: "Failed to update moderator status" });
    }
  });

  app.post("/api/admin/reset-password/:userId", isAdmin, async (req, res) => {
    try {
      const target = await storage.getUser((req.params.userId as string));
      if (!target) return res.status(404).json({ message: "User not found" });
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await storage.setPasswordResetToken(target.id, token, expires);
      return res.json({ token, resetUrl: `/reset-password/${token}` });
    } catch (err) {
      console.error("Admin reset password error:", err);
      return res.status(500).json({ message: "Failed to generate reset link" });
    }
  });

  app.post("/api/admin/ban/:userId", isAdmin, async (req, res) => {
    try {
      const target = await storage.getUser((req.params.userId as string));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.isAdmin) return res.status(400).json({ message: "Cannot banish an admin" });
      const days = typeof req.body.days === "number" && req.body.days > 0 ? req.body.days : undefined;
      const updated = await storage.banUser((req.params.userId as string), days);
      const safe = publicAccount(updated);
      return res.json(safe);
    } catch (err) {
      console.error("Ban user error:", err);
      return res.status(500).json({ message: "Failed to banish user" });
    }
  });

  app.post("/api/admin/unban/:userId", isAdmin, async (req, res) => {
    try {
      const updated = await storage.unbanUser((req.params.userId as string));
      const safe = publicAccount(updated);
      return res.json(safe);
    } catch (err) {
      console.error("Unban user error:", err);
      return res.status(500).json({ message: "Failed to unbanish user" });
    }
  });

  app.post("/api/admin/delete-account/:userId", isAdmin, async (req, res) => {
    try {
      const target = await storage.getUser((req.params.userId as string));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.isAdmin) return res.status(400).json({ message: "Cannot delete an admin account" });
      await storage.deleteAccount((req.params.userId as string));
      return res.json({ success: true });
    } catch (err) {
      console.error("Admin delete account error:", err);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.get("/api/admin/coin-purchases", isAdmin, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: coinPurchases.id,
          userId: coinPurchases.userId,
          username: usersTable.username,
          email: usersTable.email,
          amountUsd: coinPurchases.amountUsd,
          coinsReceived: coinPurchases.coinsReceived,
          stripeSessionId: coinPurchases.stripeSessionId,
          createdAt: coinPurchases.createdAt,
        })
        .from(coinPurchases)
        .innerJoin(usersTable, eq(coinPurchases.userId, usersTable.id))
        .orderBy(coinPurchases.createdAt);
      return res.json(rows.reverse());
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to fetch purchases" });
    }
  });

  app.post("/api/admin/coins/:userId", isAdmin, async (req, res) => {
    try {
      const { amount } = req.body;
      if (typeof amount !== "number" || amount === 0) {
        return res.status(400).json({ message: "Provide a valid coin amount" });
      }
      const updated = await storage.addCoins((req.params.userId as string), amount);
      const safe = publicAccount(updated);
      return res.json(safe);
    } catch (err) {
      console.error("Add coins error:", err);
      return res.status(500).json({ message: "Failed to modify coins" });
    }
  });

  app.get("/api/worlds", isAuthenticated, async (_req, res) => {
    try {
      const allWorlds = await storage.getAllWorlds();
      return res.json(allWorlds);
    } catch (err) {
      console.error("Get worlds error:", err);
      return res.status(500).json({ message: "Failed to get worlds" });
    }
  });

  app.get("/api/worlds/:worldId", isAuthenticated, async (req, res) => {
    try {
      const world = await storage.getWorld((req.params.worldId as string));
      if (!world) return res.status(404).json({ message: "World not found" });
      return res.json(world);
    } catch (err) {
      console.error("Get world error:", err);
      return res.status(500).json({ message: "Failed to get world" });
    }
  });

  // Bundled map artwork revisions invalidate only older saved overrides. Once an
  // admin uploads a background against this version, that intentional override
  // is used normally on every device.
  const MAP_BACKGROUND_ASSET_VERSION = "new-map-2026-08-30";

  app.get("/api/settings/map-background", async (_req, res) => {
    try {
      const [bgUrl, savedVersion] = await Promise.all([
        storage.getGameSetting("map_background"),
        storage.getGameSetting("map_background_asset_version"),
      ]);
      return res.json({
        bgUrl: savedVersion === MAP_BACKGROUND_ASSET_VERSION ? bgUrl : null,
      });
    } catch (err) {
      console.error("Get map background error:", err);
      return res.status(500).json({ message: "Failed to get map background" });
    }
  });

  app.patch("/api/admin/settings/map-background", isAdmin, async (req, res) => {
    try {
      const { imageData } = req.body;
      if (!imageData) {
        await Promise.all([
          storage.setGameSetting("map_background", ""),
          storage.setGameSetting("map_background_asset_version", MAP_BACKGROUND_ASSET_VERSION),
        ]);
        return res.json({ bgUrl: null });
      }
      const processed = await processWorldImage(imageData, 2000);
      await Promise.all([
        storage.setGameSetting("map_background", processed),
        storage.setGameSetting("map_background_asset_version", MAP_BACKGROUND_ASSET_VERSION),
      ]);
      return res.json({ bgUrl: processed });
    } catch (err: any) {
      console.error("Set map background error:", err);
      return res.status(500).json({ message: err.message || "Failed to update map background" });
    }
  });

  registerCauldronRoutes(app, { db, storage, isAuthenticated, isAdmin });

  app.patch("/api/admin/worlds/:worldId/position", isAdmin, async (req, res) => {
    try {
      const { posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number") {
        return res.status(400).json({ message: "posX and posY are required numbers" });
      }
      const clamped = { posX: Math.max(-10, Math.min(110, Math.round(posX))), posY: Math.max(-10, Math.min(110, Math.round(posY))) };
      const updated = await storage.updateWorldPosition((req.params.worldId as string), clamped.posX, clamped.posY);

      // Persist admin-set positions as the new defaults — restored automatically on every startup
      const allWorlds = await storage.getAllWorlds();
      await storage.setGameSetting(
        "admin_pos_worlds",
        JSON.stringify(allWorlds.map(w => ({ id: w.id, posX: w.posX, posY: w.posY })))
      );

      return res.json(updated);
    } catch (err) {
      console.error("Update world position error:", err);
      return res.status(500).json({ message: "Failed to update position" });
    }
  });

  app.post("/api/admin/worlds", isAdmin, async (req, res) => {
    try {
      const { name, iconData, bgData, glowColor, posX, posY } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Name is required" });
      }
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!slug) return res.status(400).json({ message: "Invalid name" });

      const existing = await storage.getWorld(slug);
      if (existing) return res.status(400).json({ message: "A world with this name already exists" });

      let iconUrl: string | null = null;
      let bgUrl: string | null = null;

      if (iconData) {
        iconUrl = await processWorldImage(iconData, 500);
      }
      if (bgData) {
        bgUrl = await processWorldImage(bgData, 2000);
      }

      const world = await storage.createWorld({
        id: slug,
        name: name.trim(),
        iconUrl,
        bgUrl,
        posX: posX || 50,
        posY: posY || 50,
        glowColor: glowColor || "#ffd700",
        isDefault: false,
      });
      return res.status(201).json(world);
    } catch (err) {
      console.error("Create world error:", err);
      return res.status(500).json({ message: "Failed to create world" });
    }
  });

  app.patch("/api/admin/worlds/:worldId", isAdmin, async (req, res) => {
    try {
      const world = await storage.getWorld((req.params.worldId as string));
      if (!world) return res.status(404).json({ message: "World not found" });

      const { name, glowColor, iconData, bgData, skyImageData, groundImageData, iconSize } = req.body;
      const updates: Record<string, any> = {};

      if (name && typeof name === "string" && name.trim()) updates.name = name.trim();
      if (glowColor && typeof glowColor === "string") updates.glowColor = glowColor;
      if (iconSize !== undefined) {
        if (typeof iconSize !== "number" || !Number.isFinite(iconSize)) {
          return res.status(400).json({ message: "iconSize must be a finite number" });
        }
        updates.iconSize = Math.max(16, Math.min(46, Math.round(iconSize)));
      }

      if (iconData) {
        updates.iconUrl = await processWorldImage(iconData, 500);
      }
      if (bgData) {
        updates.bgUrl = await processWorldImage(bgData, 2000);
      }
      if (skyImageData) {
        updates.skyImageUrl = await processWorldImage(skyImageData, 2000);
      }
      if (groundImageData) {
        updates.groundImageUrl = await processWorldImage(groundImageData, 2000);
      }

      if (Object.keys(updates).length === 0) {
        return res.json(world);
      }

      const updated = await storage.updateWorld((req.params.worldId as string), updates);
      return res.json(updated);
    } catch (err) {
      console.error("Update world error:", err);
      return res.status(500).json({ message: "Failed to update world" });
    }
  });

  app.delete("/api/admin/worlds/:worldId", isAdmin, async (req, res) => {
    try {
      const world = await storage.getWorld((req.params.worldId as string));
      if (!world) return res.status(404).json({ message: "World not found" });
      if (world.isDefault) return res.status(400).json({ message: "Cannot delete default worlds" });
      await storage.deleteWorld((req.params.worldId as string));
      return res.json({ message: "World deleted" });
    } catch (err) {
      console.error("Delete world error:", err);
      return res.status(500).json({ message: "Failed to delete world" });
    }
  });

  app.get("/api/world/:worldId/locations", isAuthenticated, async (req, res) => {
    try {
      const locations = await storage.getWorldLocations((req.params.worldId as string));
      return res.json(locations);
    } catch (err) {
      console.error("Get world locations error:", err);
      return res.status(500).json({ message: "Failed to get locations" });
    }
  });

  app.get("/api/location/:locationId", isAuthenticated, async (req, res) => {
    try {
      const loc = await storage.getWorldLocation((req.params.locationId as string));
      if (!loc) return res.status(404).json({ message: "Location not found" });
      return res.json(loc);
    } catch (err) {
      console.error("Get location error:", err);
      return res.status(500).json({ message: "Failed to get location" });
    }
  });

  app.post("/api/admin/world/:worldId/location", isAdmin, async (req, res) => {
    try {
      const { name, description, iconData, bgData, ownerImageData, isShop, type, posX, posY, glowColor } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Name is required" });

      let iconUrl: string | null = null;
      let bgUrl: string | null = null;
      let ownerImageUrl: string | null = null;
      if (iconData) {
        iconUrl = await processWorldImage(iconData, 1000);
      }
      if (bgData) {
        bgUrl = await processWorldImage(bgData, 2000);
      }
      if (ownerImageData) {
        ownerImageUrl = await processWorldImage(ownerImageData, 1000);
      }

      const loc = await storage.createWorldLocation({
        worldId: (req.params.worldId as string),
        name,
        type: type || (isShop ? "shop" : "battle"),
        iconUrl,
        bgUrl,
        ownerImageUrl,
        isShop: !!isShop,
        description: description || null,
        glowColor: glowColor || null,
        posX: typeof posX === "number" ? Math.max(-10, Math.min(110, posX)) : 40,
        posY: typeof posY === "number" ? Math.max(-10, Math.min(110, posY)) : 40,
        sortOrder: 0,
      });
      return res.status(201).json(loc);
    } catch (err) {
      console.error("Create world location error:", err);
      return res.status(500).json({ message: "Failed to create location" });
    }
  });

  app.get("/api/world/:worldId/decor/items", async (req, res) => {
    try {
      const items = await storage.getWorldDecorItems((req.params.worldId as string));
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get decor items" });
    }
  });

  app.post("/api/admin/world/:worldId/decor/items", isAdmin, async (req, res) => {
    try {
      const { name, imageUrl } = req.body;
      if (!name || !imageUrl) return res.status(400).json({ message: "name and imageUrl required" });
      let processedUrl = imageUrl;
      if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
        processedUrl = await processWorldImage(imageUrl, 800);
      }
      const item = await storage.createWorldDecorItem({ worldId: (req.params.worldId as string), name, imageUrl: processedUrl });
      return res.status(201).json(item);
    } catch (err: any) {
      return res.status(400).json({ message: err.message ?? "Failed to create decor item" });
    }
  });

  app.patch("/api/admin/world/decor/items/:itemId", isAdmin, async (req, res) => {
    try {
      const { name, imageUrl, message } = req.body;
      let processedUrl = imageUrl;
      if (typeof imageUrl === "string" && imageUrl.startsWith("data:")) {
        processedUrl = await processWorldImage(imageUrl, 800);
      }
      await storage.updateWorldDecorItem((req.params.itemId as string), { name, imageUrl: processedUrl, message });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(400).json({ message: err.message ?? "Failed to update decor item" });
    }
  });

  app.delete("/api/admin/world/decor/items/:itemId", isAdmin, async (req, res) => {
    try {
      await storage.deleteWorldDecorItem((req.params.itemId as string));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete decor item" });
    }
  });

  // ── True multiplayer: SSE-based presence + live position ─────────────────
  // Each connected client is tracked in _worldClients.
  // Connecting = joining the world.  Disconnecting = leaving.
  // Named SSE events: "roster" | "join" | "leave" | "move"

  interface WorldClient {
    res:      Response;
    userId:   string;
    petData:  any;   // full pet profile (no posX/posY — those live below)
    posX:     number;
    posY:     number;
  }
  const _worldClients = new Map<string, WorldClient>();

  function sendSSEEvent(res: Response, event: string, data: any) {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  }

  function broadcastWorld(event: string, data: any, excludeUserId?: string) {
    for (const [uid, client] of _worldClients) {
      if (uid !== excludeUserId) sendSSEEvent(client.res, event, data);
    }
  }

  // SSE stream — one persistent connection per user = presence
  app.get("/api/world/pet_world/position-stream", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).id;

    // Close any stale previous connection for this user (tab reload, etc.)
    const existing = _worldClients.get(userId);
    if (existing) {
      try { existing.res.end(); } catch {}
      _worldClients.delete(userId);
    }

    res.setHeader("Content-Type",  "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection",    "keep-alive");
    res.flushHeaders();

    // Look up this user's active pet
    const petData = await storage.getWorldActivePetForUser("pet_world", userId);

    // Diagnostic log so we can confirm in production whether the storage
    // lookup is finding a hatched pet for this user. If `petData` is null
    // here, the user will not appear in their own roster entry — this is
    // the single most common cause of "my pet isn't showing in KC".
    console.log(
      `[KC SSE] user=${userId} → ${petData
        ? `pet inv=${petData.inventoryId} name="${petData.name}" hasImg=${!!(petData.hatchedImageUrl || petData.imageUrl)} tpl=${petData.petTemplateId ?? "none"}`
        : "NO HATCHED PET FOUND (no roster self-entry)"}`,
    );

    if (!petData) {
      // No active pet — user can still watch the world but won't appear as a pet.
      // Send current roster so they can see who is online, then keep stream open.
      const roster = [..._worldClients.values()].map(c => ({ ...c.petData, posX: c.posX, posY: c.posY }));
      sendSSEEvent(res, "roster", roster);
      const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25_000);
      req.on("close", () => clearInterval(ping));
      return;
    }

    // Retrieve last stored position (or leave null — client seeds a default)
    const storedPos = await storage.getPetPosition("pet_world", userId);
    const posX = storedPos?.posX ?? null;
    const posY = storedPos?.posY ?? null;

    // Build roster: all currently online pets + this user's own entry
    const rosterOthers = [..._worldClients.values()].map(c => ({ ...c.petData, posX: c.posX, posY: c.posY }));
    const selfEntry    = { ...petData, posX, posY };
    sendSSEEvent(res, "roster", [...rosterOthers, selfEntry]);

    // Register in map AFTER sending roster (so self not in others' list yet)
    const resolvedPosX = posX ?? 50;
    const resolvedPosY = posY ?? 70;
    _worldClients.set(userId, { res, userId, petData, posX: resolvedPosX, posY: resolvedPosY });

    // Announce join to everyone already online
    broadcastWorld("join", { ...petData, posX: resolvedPosX, posY: resolvedPosY }, userId);

    // Keepalive ping
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch {} }, 25_000);

    req.on("close", () => {
      _worldClients.delete(userId);
      clearInterval(ping);
      broadcastWorld("leave", { userId });
    });
  });

  // Returns the live online roster (used as a fallback / admin view)
  app.get("/api/world/pet_world/active-pets", isAuthenticated, (_req, res) => {
    const online = [..._worldClients.values()].map(c => ({ ...c.petData, posX: c.posX, posY: c.posY }));
    return res.json(online);
  });

  // Players who signed in during the admin's current local day.
  // The browser supplies exact ISO boundaries so "today" follows the admin's
  // timezone while the database comparison remains unambiguous.
  app.get("/api/admin/online-today", isAdmin, async (req, res) => {
    try {
      const since = new Date(String(req.query.since ?? ""));
      const until = new Date(String(req.query.until ?? ""));
      const rangeMs = until.getTime() - since.getTime();
      if (
        Number.isNaN(since.getTime())
        || Number.isNaN(until.getTime())
        || rangeMs <= 0
        || rangeMs > 36 * 60 * 60 * 1000
      ) {
        return res.status(400).json({ message: "Valid local-day boundaries are required" });
      }

      const rows = await db.execute(sql`
        SELECT
          u.id,
          u.username,
          u.profile_image AS "profileImage",
          u.is_admin AS "isAdmin",
          u.is_moderator AS "isModerator",
          max(e.created_at) AS "lastActiveAt",
          count(*)::int AS "loginCount"
        FROM player_login_events e
        JOIN users u ON u.id = e.user_id
        WHERE e.created_at >= ${since}
          AND e.created_at < ${until}
        GROUP BY u.id, u.username, u.profile_image, u.is_admin, u.is_moderator
        ORDER BY max(e.created_at) DESC, u.username ASC
      `);
      return res.json(Array.isArray(rows) ? rows : ((rows as any).rows ?? []));
    } catch (err: any) {
      console.error("[admin/online-today]", err);
      return res.status(500).json({ message: "Failed to load today's players" });
    }
  });

  app.patch("/api/world/pet_world/pet-position", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { ownerUserId: _spoofable, posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number") {
        return res.status(400).json({ message: "posX, posY required" });
      }
      const ownerUserId = user.id;
      const client = _worldClients.get(ownerUserId);
      if (client) { client.posX = posX; client.posY = posY; }
      // Persist to DB (fire-and-forget — positional data, not critical)
      storage.upsertPetPosition("pet_world", ownerUserId, posX, posY).catch(() => {});
      // Broadcast live "move" event to all other connected clients
      broadcastWorld("move", { userId: ownerUserId, posX, posY }, ownerUserId);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update pet position" });
    }
  });

  app.get("/api/world/:worldId/decor/placements", async (req, res) => {
    try {
      const placements = await storage.getWorldDecorPlacements((req.params.worldId as string));
      return res.json(placements);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get decor placements" });
    }
  });

  app.post("/api/admin/world/:worldId/decor/placements", isAdmin, async (req, res) => {
    try {
      const { decorItemId, name, imageUrl, posX, posY } = req.body;
      if (!decorItemId || !name || !imageUrl) return res.status(400).json({ message: "decorItemId, name, imageUrl required" });
      const placement = await storage.createWorldDecorPlacement({
        worldId: (req.params.worldId as string),
        decorItemId,
        name,
        imageUrl,
        posX: posX ?? 45,
        posY: posY ?? 45,
      });
      return res.status(201).json(placement);
    } catch (err) {
      return res.status(500).json({ message: "Failed to create decor placement" });
    }
  });

  app.patch("/api/admin/world/decor/placements/:placementId", isAdmin, async (req, res) => {
    try {
      const { posX, posY, size, flipped, message } = req.body;
      const update: { posX?: number; posY?: number; size?: number; flipped?: boolean; message?: string | null } = {};
      if (posX !== undefined) update.posX = posX;
      if (posY !== undefined) update.posY = posY;
      if (size !== undefined) update.size = size;
      if (flipped !== undefined) update.flipped = flipped;
      if (message !== undefined) update.message = message || null;
      const placement = await storage.updateWorldDecorPlacement((req.params.placementId as string), update);
      return res.json(placement);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update decor placement" });
    }
  });

  app.delete("/api/admin/world/decor/placements/:placementId", isAdmin, async (req, res) => {
    try {
      await storage.deleteWorldDecorPlacement((req.params.placementId as string));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete decor placement" });
    }
  });

  app.post("/api/admin/world/:worldId/fishing-spot", isAdmin, async (req, res) => {
    try {
      const assetPath = path.join(process.cwd(), "attached_assets", "icon_myst_pond_v2.png");
      let iconUrl: string | null = null;
      if (fs.existsSync(assetPath)) {
        const buf = fs.readFileSync(assetPath);
        iconUrl = `data:image/png;base64,${buf.toString("base64")}`;
      }
      const loc = await storage.createWorldLocation({
        worldId: (req.params.worldId as string),
        name: "Fishing Spot",
        type: "fishing",
        iconUrl,
        bgUrl: null,
        ownerImageUrl: null,
        isShop: false,
        description: "A mystical fishing spot in the bayou.",
        glowColor: "#3dc7c0",
        posX: 45,
        posY: 45,
        sortOrder: 0,
      });
      return res.status(201).json(loc);
    } catch (err) {
      console.error("Create fishing spot error:", err);
      return res.status(500).json({ message: "Failed to create fishing spot" });
    }
  });

  app.post("/api/admin/world/location/:locationId/duplicate", isAdmin, async (req, res) => {
    try {
      const orig = await storage.getWorldLocation((req.params.locationId as string));
      if (!orig) return res.status(404).json({ message: "Location not found" });
      const newLoc = await storage.createWorldLocation({
        worldId: orig.worldId,
        name: orig.name,
        type: orig.type,
        iconUrl: orig.iconUrl,
        bgUrl: orig.bgUrl,
        ownerImageUrl: orig.ownerImageUrl,
        isShop: orig.isShop,
        description: orig.description,
        glowColor: orig.glowColor,
        posX: Math.min(110, (orig.posX ?? 40) + 8),
        posY: Math.min(110, (orig.posY ?? 40) + 8),
        iconSize: orig.iconSize,
        sortOrder: orig.sortOrder ?? 0,
        flipped: orig.flipped ?? false,
      });
      return res.status(201).json(newLoc);
    } catch (err) {
      console.error("Duplicate location error:", err);
      return res.status(500).json({ message: "Failed to duplicate location" });
    }
  });

  app.patch("/api/admin/world/location/:locationId", isAdmin, async (req, res) => {
    try {
      const sanitized: Record<string, any> = {};
      const { name, description, iconData, bgData, ownerImageData, isShop, type, posX, posY, glowColor } = req.body;

      if (name !== undefined) sanitized.name = name;
      if (description !== undefined) sanitized.description = description;
      if (type !== undefined) sanitized.type = type;
      if (isShop !== undefined) sanitized.isShop = !!isShop;
      if (type !== undefined && isShop === undefined) {
        sanitized.isShop = type === "shop";
      }
      if (iconData) {
        sanitized.iconUrl = await processWorldImage(iconData, 1000);
      }
      if (bgData) {
        sanitized.bgUrl = await processWorldImage(bgData, 2000);
      }
      if (ownerImageData) {
        sanitized.ownerImageUrl = await processWorldImage(ownerImageData, 1000);
      }
      if (glowColor !== undefined) sanitized.glowColor = glowColor || null;
      if (typeof posX === "number") sanitized.posX = Math.max(-10, Math.min(110, posX));
      if (typeof posY === "number") sanitized.posY = Math.max(-10, Math.min(110, posY));
      if (typeof req.body.iconSize === "number") sanitized.iconSize = Math.max(64, Math.min(900, req.body.iconSize));

      const updated = await storage.updateWorldLocation((req.params.locationId as string), sanitized);
      return res.json(updated);
    } catch (err) {
      console.error("Update world location error:", err);
      return res.status(500).json({ message: "Failed to update location" });
    }
  });

  const LOCATION_DEFAULT_BG: Record<string, string> = {
    "a1b2c3d4-0001-4000-8000-000000000001": "bg_murk_cave.webp",
    "a1b2c3d4-0002-4000-8000-000000000002": "bg_willowmere_cottage.webp",
    "a1b2c3d4-0003-4000-8000-000000000003": "bg_mosswood_lodge.webp",
    "a1b2c3d4-0004-4000-8000-000000000004": "bg_tome_toad.webp",
    "a1b2c3d4-0005-4000-8000-000000000005": "bg_swamp_critters.webp",
    "a1b2c3d4-0006-4000-8000-000000000006": "bg_mossy_cauldron.webp",
    "a1b2c3d4-0007-4000-8000-000000000007": "bg_myst_pond.webp",
    "3e20ad30-faff-4643-9e80-5e5f30010738": "bg_thicket.webp",
    "8e211716-0448-496e-8582-6ce1025ac4e4": "bg_bayous_heart.webp",
  };

  app.post("/api/admin/world/location/:locationId/reset-bg", isAdmin, async (req, res) => {
    try {
      const { locationId } = req.params as Record<string, string>;
      const bgFile = LOCATION_DEFAULT_BG[locationId];
      if (!bgFile) {
        return res.status(404).json({ message: "No default background found for this location" });
      }
      const assetPath = path.join(process.cwd(), "attached_assets", bgFile);
      if (!fs.existsSync(assetPath)) {
        return res.status(404).json({ message: "Default background file not found on disk" });
      }
      const buf = fs.readFileSync(assetPath);
      const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
      const bgUrl = await processWorldImage(dataUrl, 2000);
      const updated = await storage.updateWorldLocation(locationId, { bgUrl });
      return res.json(updated);
    } catch (err) {
      console.error("Reset location bg error:", err);
      return res.status(500).json({ message: "Failed to reset background" });
    }
  });

  app.patch("/api/admin/world/location/:locationId/position", isAdmin, async (req, res) => {
    try {
      const { posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number") {
        return res.status(400).json({ message: "posX and posY are required numbers" });
      }
      const loc = await storage.getWorldLocation((req.params.locationId as string));
      let nextSortOrder = 0;
      if (loc) {
        const siblings = await storage.getWorldLocations(loc.worldId);
        const maxOrder = siblings.reduce((m, l) => Math.max(m, l.sortOrder ?? 0), 0);
        nextSortOrder = maxOrder + 1;
      }
      const updated = await storage.updateWorldLocation((req.params.locationId as string), {
        posX: Math.max(-10, Math.min(110, posX)),
        posY: Math.max(-10, Math.min(110, posY)),
        sortOrder: nextSortOrder,
      });

      // Persist admin-set positions as the new defaults — restored automatically on every startup
      if (loc) {
        const allLocsForWorld = await storage.getWorldLocations(loc.worldId);
        await storage.setGameSetting(
          `admin_pos_locs__${loc.worldId}`,
          JSON.stringify(allLocsForWorld.map(l => ({ id: l.id, posX: l.posX, posY: l.posY })))
        );
      }

      return res.json(updated);
    } catch (err) {
      console.error("Update location position error:", err);
      return res.status(500).json({ message: "Failed to update position" });
    }
  });

  app.patch("/api/admin/world/location/:locationId/flip", isAdmin, async (req, res) => {
    try {
      const updated = await storage.flipWorldLocation((req.params.locationId as string));
      return res.json(updated);
    } catch (err) {
      console.error("Flip location error:", err);
      return res.status(500).json({ message: "Failed to flip location" });
    }
  });

  app.delete("/api/admin/world/location/:locationId", isAdmin, async (req, res) => {
    try {
      const locationId = (req.params.locationId as string);
      await storage.deleteWorldLocation(locationId);
      // Persist deletion so startup script doesn't recreate seed locations
      const raw = await storage.getGameSetting("deleted_seed_location_ids");
      const deletedIds: string[] = raw ? JSON.parse(raw) : [];
      if (!deletedIds.includes(locationId)) {
        deletedIds.push(locationId);
        await storage.setGameSetting("deleted_seed_location_ids", JSON.stringify(deletedIds));
      }
      return res.json({ message: "Location deleted" });
    } catch (err) {
      console.error("Delete world location error:", err);
      return res.status(500).json({ message: "Failed to delete location" });
    }
  });

  app.get("/api/shop/:worldId", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getShopItemsByWorld((req.params.worldId as string));
      return res.json(items);
    } catch (err) {
      console.error("Get shop items error:", err);
      return res.status(500).json({ message: "Failed to get shop items" });
    }
  });

  app.get("/api/location/:locationId/items", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getLocationItems((req.params.locationId as string));
      return res.json(items);
    } catch (err) {
      console.error("Get location items error:", err);
      return res.status(500).json({ message: "Failed to get location items" });
    }
  });

  app.post("/api/admin/location/:locationId/assign-item/:itemId", isAdmin, async (req, res) => {
    try {
      const item = await storage.getShopItem((req.params.itemId as string));
      if (!item) return res.status(404).json({ message: "Item not found" });
      // Bait items are catalog templates — copy them so the original stays available for other shops
      if (item.fishingType === "bait") {
        const { id: _id, createdAt: _ca, ...rest } = item as any;
        const copy = await storage.createShopItem({ ...rest, locationId: (req.params.locationId as string) });
        return res.json(copy);
      }
      const updated = await storage.assignItemToLocation((req.params.itemId as string), (req.params.locationId as string));
      return res.json(updated);
    } catch (err) {
      console.error("Assign item to location error:", err);
      return res.status(500).json({ message: "Failed to assign item" });
    }
  });

  app.delete("/api/admin/location/:locationId/unassign-item/:itemId", isAdmin, async (req, res) => {
    try {
      const item = await storage.getShopItem((req.params.itemId as string));
      // Bait copies were created just for this shop — delete them instead of returning to catalog
      if (item?.fishingType === "bait" && item.locationId === (req.params.locationId as string)) {
        await storage.deleteShopItem((req.params.itemId as string));
        return res.json({ ok: true });
      }
      const updated = await storage.unassignItemFromLocation((req.params.itemId as string));
      return res.json(updated);
    } catch (err) {
      console.error("Unassign item from location error:", err);
      return res.status(500).json({ message: "Failed to unassign item" });
    }
  });

  app.patch("/api/admin/shop-item/:itemId/position", isAdmin, async (req, res) => {
    try {
      const { posX, posY, width } = req.body;
      if (posX === undefined || posY === undefined) return res.status(400).json({ message: "posX and posY required" });
      const updated = await storage.updateShopItemPosition((req.params.itemId as string), posX, posY, width ?? 72);
      return res.json(updated);
    } catch (err) {
      console.error("Update shop item position error:", err);
      return res.status(500).json({ message: "Failed to update position" });
    }
  });

  app.patch("/api/admin/shop-item/:itemId/size", isAdmin, async (req, res) => {
    try {
      const { width } = req.body;
      if (typeof width !== "number") return res.status(400).json({ message: "width required" });
      const clamped = Math.max(64, Math.min(300, width));
      const item = await storage.getShopItem((req.params.itemId as string));
      if (!item) return res.status(404).json({ message: "Item not found" });
      const updated = await storage.updateShopItemPosition((req.params.itemId as string), item.shopPosX, item.shopPosY, clamped);
      return res.json(updated);
    } catch (err) {
      console.error("Update shop item size error:", err);
      return res.status(500).json({ message: "Failed to update size" });
    }
  });

  // ── Binary image serving for pet template assembled views ────────────────
  // Returns the raw image bytes instead of embedding base64 in JSON payloads.
  // Browser caches these for 24 h; they rarely change.
  app.get("/api/pet-template-image/:id/:view", async (req, res) => {
    try {
      const { id, view } = req.params as Record<string, string>;
      if (view !== "front" && view !== "back") return res.status(400).end();
      const template = await storage.getPetTemplate(id);
      const dataUri: string | null | undefined =
        view === "front" ? template?.frontAssembled : template?.backAssembled;
      if (!dataUri) return res.status(404).end();
      // Parse  data:<mime>;base64,<data>
      const match = dataUri.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) return res.status(500).end();
      const [, mime, b64] = match;
      const buf = Buffer.from(b64, "base64");
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
      res.setHeader("Content-Length", buf.length);
      return res.end(buf);
    } catch {
      return res.status(500).end();
    }
  });

  // Lightweight meta endpoint — returns id + assembled image URL refs (not base64).
  // Used by PvP battle page. Returning base64 inline was ~6 MB per request.
  app.get("/api/pet-templates/meta", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getAllPetTemplates();
      return res.json(templates.map(t => ({
        id: t.id,
        frontAssembledUrl: t.frontAssembled ? `/api/pet-template-image/${t.id}/front` : null,
        backAssembledUrl:  t.backAssembled  ? `/api/pet-template-image/${t.id}/back`  : null,
      })));
    } catch (err) {
      return res.status(500).json({ message: "Failed to get template meta" });
    }
  });

  app.get("/api/pet-template-parts/:templateId", isAuthenticated, async (req, res) => {
    try {
      const { templateId } = req.params as Record<string, string>;
      const requestedForm = req.query.form ?? "base";
      if (requestedForm !== "base" && requestedForm !== "evolution") return res.status(400).json({ message: "form must be base or evolution" });
      const cacheKey = requestedForm === "base" ? templateId : `${templateId}:evolution`;
      const cached = getCachedTemplateParts(cacheKey);
      if (cached) return res.json(cached);

      const [parts, template] = await Promise.all([
        storage.getPetTemplateParts(templateId),
        storage.getPetTemplate(templateId),
      ]);
      const artwork = requestedForm === "evolution"
        ? resolvePetArtwork(parts, await storage.getPetTemplateParts(templateId, "evolution"), template?.facing ?? "front")
        : { parts, facing: template?.facing ?? "front", form: "base" };
      const result = {
        ...artwork,
        canFly: template?.canFly ?? false,
        idleStyle: template?.idleStyle ?? null,
      };
      setCachedTemplateParts(cacheKey, result);
      return res.json(result);
    } catch (err) {
      console.error("Get pet template parts error:", err);
      return res.status(500).json({ message: "Failed to get parts" });
    }
  });

  app.get("/api/location/:locationId/objects", isAuthenticated, async (req, res) => {
    try {
      const objects = await storage.getLocationObjects((req.params.locationId as string));
      return res.json(objects);
    } catch (err) {
      console.error("Get location objects error:", err);
      return res.status(500).json({ message: "Failed to get objects" });
    }
  });

  app.post("/api/admin/location/:locationId/object", isAdmin, async (req, res) => {
    try {
      const { imageData, posX, posY, width } = req.body;
      if (!imageData) return res.status(400).json({ message: "Image is required" });
      const imageUrl = await processWorldImage(imageData, 500);
      const obj = await storage.createLocationObject({
        locationId: (req.params.locationId as string),
        imageUrl,
        posX: typeof posX === "number" ? posX : 50,
        posY: typeof posY === "number" ? posY : 50,
        width: typeof width === "number" ? width : 80,
      });
      return res.status(201).json(obj);
    } catch (err) {
      console.error("Create location object error:", err);
      return res.status(500).json({ message: "Failed to create object" });
    }
  });

  app.patch("/api/admin/location/object/:objectId/position", isAdmin, async (req, res) => {
    try {
      const { posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number") {
        return res.status(400).json({ message: "posX and posY are required numbers" });
      }
      const updated = await storage.updateLocationObject((req.params.objectId as string), {
        posX: Math.max(0, Math.min(100, Math.round(posX))),
        posY: Math.max(0, Math.min(100, Math.round(posY))),
      });
      return res.json(updated);
    } catch (err) {
      console.error("Update object position error:", err);
      return res.status(500).json({ message: "Failed to update object position" });
    }
  });

  app.patch("/api/admin/location/object/:objectId/size", isAdmin, async (req, res) => {
    try {
      const { width } = req.body;
      if (typeof width !== "number") return res.status(400).json({ message: "width is required" });
      const updated = await storage.updateLocationObject((req.params.objectId as string), { width: Math.max(20, Math.min(600, Math.round(width))) });
      return res.json(updated);
    } catch (err) {
      console.error("Update object size error:", err);
      return res.status(500).json({ message: "Failed to update object size" });
    }
  });

  app.delete("/api/admin/location/object/:objectId", isAdmin, async (req, res) => {
    try {
      await storage.deleteLocationObject((req.params.objectId as string));
      return res.json({ message: "Object deleted" });
    } catch (err) {
      console.error("Delete location object error:", err);
      return res.status(500).json({ message: "Failed to delete object" });
    }
  });

  app.get("/api/admin/pet-templates", isAdmin, async (req, res) => {
    try {
      const testOnly = req.query.testOnly === "true" || req.query.testOnly === "1";
      const includeTest = req.query.includeTest === "true" || req.query.includeTest === "1";
      const templates = await storage.getAllPetTemplates({ testOnly, includeTest });
      // Strip assembled images from the list response — they are 200-500 KB each
      // and the list can have 17+ templates. The detail endpoint (/api/admin/pet-templates/:id)
      // still returns them for the single-template editor that actually needs them.
      return res.json(templates.map(({ frontAssembled, backAssembled, ...rest }) => ({
        ...rest,
        hasFrontAssembled: !!frontAssembled,
        hasBackAssembled:  !!backAssembled,
        frontAssembledUrl: frontAssembled ? `/api/pet-template-image/${rest.id}/front` : null,
        backAssembledUrl:  backAssembled  ? `/api/pet-template-image/${rest.id}/back`  : null,
      })));
    } catch (err) {
      console.error("Get pet templates error:", err);
      return res.status(500).json({ message: "Failed to get pet templates" });
    }
  });

  app.get("/api/admin/pet-templates/:id", isAdmin, async (req, res) => {
    try {
      const templateId = req.params.id as string;
      const [template, parts, evolutionParts] = await Promise.all([
        storage.getPetTemplate(templateId),
        storage.getPetTemplateParts(templateId, "base"),
        storage.getPetTemplateParts(templateId, "evolution"),
      ]);
      if (!template) return res.status(404).json({ message: "Template not found" });
      // Strip base64 — return URL refs instead, matching the list endpoint.
      const { frontAssembled, backAssembled, ...rest } = template;
      return res.json({
        ...rest,
        hasFrontAssembled: !!frontAssembled,
        hasBackAssembled:  !!backAssembled,
        frontAssembledUrl: frontAssembled ? `/api/pet-template-image/${template.id}/front` : null,
        backAssembledUrl:  backAssembled  ? `/api/pet-template-image/${template.id}/back`  : null,
        parts,
        evolutionParts,
      });
    } catch (err) {
      console.error("Get pet template error:", err);
      return res.status(500).json({ message: "Failed to get pet template" });
    }
  });

  app.post("/api/admin/pet-templates", isAdmin, async (req, res) => {
    try {
      const { name, isTest } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Name is required" });
      }
      const template = await storage.createPetTemplate(name.trim(), { isTest: !!isTest });
      return res.status(201).json(template);
    } catch (err) {
      console.error("Create pet template error:", err);
      return res.status(500).json({ message: "Failed to create pet template" });
    }
  });

  app.patch("/api/admin/pet-templates/:id", isAdmin, async (req, res) => {
    try {
      const { name, frontAssembled, backAssembled, facing, canFly, idleStyle, sleepingImageData, clearSleepingImage } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (frontAssembled !== undefined) updates.frontAssembled = frontAssembled;
      if (backAssembled !== undefined) updates.backAssembled = backAssembled;
      if (facing !== undefined) updates.facing = facing;
      if (canFly !== undefined) updates.canFly = canFly;
      if (idleStyle !== undefined) {
        const parsed = petAnimationProfileSchema.safeParse(idleStyle);
        if (!parsed.success) return res.status(400).json({ message: "Invalid pet animation profile" });
        updates.idleStyle = parsed.data;
      }
      if (sleepingImageData) updates.sleepingImageUrl = await processWorldImage(sleepingImageData, 1000);
      if (clearSleepingImage) updates.sleepingImageUrl = null;
      const updated = await storage.updatePetTemplate((req.params.id as string), updates);
      templatePartsCache.clear();
      return res.json(updated);
    } catch (err) {
      console.error("Update pet template error:", err);
      return res.status(500).json({ message: "Failed to update pet template" });
    }
  });

  app.delete("/api/admin/pet-templates/:id", isAdmin, async (req, res) => {
    try {
      await storage.deletePetTemplate((req.params.id as string));
      return res.json({ message: "Pet template deleted" });
    } catch (err) {
      console.error("Delete pet template error:", err);
      return res.status(500).json({ message: "Failed to delete pet template" });
    }
  });

  app.post("/api/admin/pet-templates/:id/part", isAdmin, async (req, res) => {
    try {
      const { form, partType, view, imageData, posX, posY, width, height, zIndex, pivotX, pivotY, rotation } = req.body;
      if (!partType || !view || !imageData) {
        return res.status(400).json({ message: "partType, view, and imageData are required" });
      }
      const normalizedForm = form === undefined ? "base" : form;
      if (normalizedForm !== "base" && normalizedForm !== "evolution") {
        return res.status(400).json({ message: "form must be base or evolution" });
      }
      const imageUrl = await processWorldImage(imageData, 1000);
      const part = await storage.createPetTemplatePart({
        templateId: (req.params.id as string),
        form: normalizedForm,
        partType,
        view,
        imageUrl,
        posX: typeof posX === "number" ? posX : 0,
        posY: typeof posY === "number" ? posY : 0,
        width: typeof width === "number" ? width : 100,
        height: typeof height === "number" ? height : 100,
        zIndex: typeof zIndex === "number" ? zIndex : 0,
        pivotX: typeof pivotX === "number" ? Math.max(0, Math.min(100, pivotX)) : 50,
        pivotY: typeof pivotY === "number" ? Math.max(0, Math.min(100, pivotY)) : 50,
        rotation: typeof rotation === "number" ? Math.max(-180, Math.min(180, Math.round(rotation))) : 0,
      });
      templatePartsCache.clear();
      return res.status(201).json(part);
    } catch (err) {
      console.error("Create pet template part error:", err);
      return res.status(500).json({ message: "Failed to add part" });
    }
  });

  app.patch("/api/admin/pet-template-parts/:partId", isAdmin, async (req, res) => {
    try {
      const { posX, posY, width, height, zIndex, pivotX, pivotY, rotation } = req.body;
      const updates: Record<string, any> = {};
      if (typeof posX === "number") updates.posX = posX;
      if (typeof posY === "number") updates.posY = posY;
      if (typeof width === "number") updates.width = width;
      if (typeof height === "number") updates.height = height;
      if (typeof zIndex === "number") updates.zIndex = zIndex;
      if (typeof pivotX === "number") updates.pivotX = Math.max(0, Math.min(100, pivotX));
      if (typeof pivotY === "number") updates.pivotY = Math.max(0, Math.min(100, pivotY));
      if (typeof rotation === "number") updates.rotation = Math.max(-180, Math.min(180, Math.round(rotation)));
      const updated = await storage.updatePetTemplatePart((req.params.partId as string), updates);
      templatePartsCache.clear();
      return res.json(updated);
    } catch (err) {
      console.error("Update pet template part error:", err);
      return res.status(500).json({ message: "Failed to update part" });
    }
  });

  app.delete("/api/admin/pet-template-parts/:partId", isAdmin, async (req, res) => {
    try {
      await storage.deletePetTemplatePart((req.params.partId as string));
      templatePartsCache.clear();
      return res.json({ message: "Part deleted" });
    } catch (err) {
      console.error("Delete pet template part error:", err);
      return res.status(500).json({ message: "Failed to delete part" });
    }
  });

  app.post("/api/admin/pet-templates/:id/assemble", isAdmin, async (req, res) => {
    try {
      const { view, canvasWidth, canvasHeight } = req.body;
      if (!view || !canvasWidth || !canvasHeight) {
        return res.status(400).json({ message: "view, canvasWidth, canvasHeight required" });
      }
      const template = await storage.getPetTemplate((req.params.id as string));
      if (!template) return res.status(404).json({ message: "Template not found" });

      const parts = await storage.getPetTemplateParts((req.params.id as string));
      // Keep exported assembled art in the same semantic order as the admin
      // and player renderers.  Explicit zIndex remains the fallback for any
      // custom part key not covered by the canonical map.
      const facing = view === "back" ? "left" : "front";
      const viewParts = parts.filter(p => p.view === view)
        .sort((a, b) => getEffectivePetLayer(a, facing) - getEffectivePetLayer(b, facing));

      if (viewParts.length === 0) {
        return res.status(400).json({ message: `No ${view} parts to assemble` });
      }

      const cw = Math.min(canvasWidth, 1000);
      const ch = Math.min(canvasHeight, 1000);

      const composites: { input: Buffer; left: number; top: number }[] = [];

      for (const part of viewParts) {
        let buf: Buffer;
        if (part.imageUrl.startsWith("/api/media/")) {
          const blobId = part.imageUrl.slice("/api/media/".length);
          const blobResult = await db.execute(sql`SELECT data FROM media_blobs WHERE id = ${blobId}`);
          if (!blobResult.rows.length) throw new Error(`Media blob not found: ${blobId}`);
          buf = Buffer.from((blobResult.rows[0] as any).data as string, "base64");
        } else {
          const base64Data = part.imageUrl.replace(/^data:image\/\w+;base64,/, "");
          buf = Buffer.from(base64Data, "base64");
        }

        const width = Math.max(1, Math.round(part.width));
        const height = Math.max(1, Math.round(part.height));
        const resized = await sharp(buf).resize(width, height, { fit: "fill" }).png().toBuffer();
        const rotation = Math.max(-180, Math.min(180, part.rotation ?? 0));

        if (rotation === 0) {
          composites.push({
            input: resized,
            left: Math.max(0, Math.round(part.posX)),
            top: Math.max(0, Math.round(part.posY)),
          });
          continue;
        }

        // A full-canvas SVG keeps the authored pivot fixed while allowing the
        // rotated pixels to extend beyond the part's original rectangle.
        const left = Math.round(part.posX);
        const top = Math.round(part.posY);
        const pivotX = left + width * ((part.pivotX ?? 50) / 100);
        const pivotY = top + height * ((part.pivotY ?? 50) / 100);
        const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}"><image href="data:image/png;base64,${resized.toString("base64")}" x="${left}" y="${top}" width="${width}" height="${height}" transform="rotate(${rotation} ${pivotX} ${pivotY})"/></svg>`;
        composites.push({ input: await sharp(Buffer.from(overlaySvg)).png().toBuffer(), left: 0, top: 0 });
      }

      const assembled = await sharp({
        create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      })
        .composite(composites)
        .png()
        .toBuffer();

      const assembledDataUrl = `data:image/png;base64,${assembled.toString("base64")}`;

      const updates: Record<string, any> = {};
      if (view === "front") updates.frontAssembled = assembledDataUrl;
      else updates.backAssembled = assembledDataUrl;

      const updated = await storage.updatePetTemplate((req.params.id as string), updates);
      templatePartsCache.clear();
      return res.json(updated);
    } catch (err) {
      console.error("Assemble pet template error:", err);
      return res.status(500).json({ message: "Failed to assemble pet" });
    }
  });

  async function processWorldImage(imageData: string, maxSize: number): Promise<string> {
    const mimeMatch = imageData.match(/^data:(image\/[\w+.-]+);base64,/);
    if (!mimeMatch) {
      throw new Error("Invalid image format.");
    }
    const mimeType = mimeMatch[1];
    const base64Data = imageData.replace(/^data:[^;]+;base64,/, "");
    if (base64Data.length > 30 * 1024 * 1024) {
      throw new Error("Image too large. Please use a smaller file.");
    }
    const imageBuffer = Buffer.from(base64Data, "base64");
    const isGif = mimeType === "image/gif";
    let resizedBase64: string;
    let finalMime: string;
    if (isGif) {
      const resized = await sharp(imageBuffer, { animated: true })
        .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
        .gif()
        .toBuffer();
      resizedBase64 = resized.toString("base64");
      finalMime = "image/gif";
    } else {
      const resized = await sharp(imageBuffer)
        .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
        .png({ quality: 90 })
        .toBuffer();
      resizedBase64 = resized.toString("base64");
      finalMime = "image/png";
    }
    const result = await db.execute(
      sql`INSERT INTO media_blobs (mime_type, data) VALUES (${finalMime}, ${resizedBase64}) RETURNING id`
    );
    const blobId = (result.rows[0] as any).id as string;
    return `/api/media/${blobId}`;
  }

  registerCardAdminRoutes(app, { db, isAdmin, processCardImage: processWorldImage });
  registerNpcPhaseRoutes(app, { db, isAdmin, processImage: data => processWorldImage(data, 1000) });
  registerCardCollectionRoutes(app, { db, isAuthenticated });

  function processShopItemImage(imageData: string): Promise<string> {
    return processWorldImage(imageData, 2000);
  }

  app.post("/api/admin/shop", isAdmin, async (req, res) => {
    try {
      const { imageData, eggImageData, hatchedImageData, evolutionImageData, hooklessImageData, ...itemData } = req.body;
      const parse = insertShopItemSchema.safeParse(itemData);
      if (!parse.success) {
        return res.status(400).json({ message: parse.error.errors[0].message });
      }

      let evolutionImageUrl: string | null;
      try {
        evolutionImageUrl = (await processEvolutionImageUpdate({ evolutionImageData, evolutionImageUrl: itemData.evolutionImageUrl }, parse.data.type, processShopItemImage)) ?? null;
      } catch {
        return res.status(400).json({ message: "Failed to process evolution image. Please upload a valid PNG (max 20MB)." });
      }

      let imageUrl: string | null = null;
      if (imageData) {
        try { imageUrl = await (parse.data.type === "npc" ? processWorldImage(imageData, 1000) : processShopItemImage(imageData)); }
        catch (e) { console.error("Image error:", e); return res.status(400).json({ message: "Failed to process item image. Please try a different file." }); }
      }

      let eggImageUrl: string | null = null;
      if (eggImageData) {
        try { eggImageUrl = await processShopItemImage(eggImageData); }
        catch (e) { console.error("Egg image error:", e); return res.status(400).json({ message: "Failed to process egg image. Please try a different file." }); }
      }

      let hatchedImageUrl: string | null = null;
      if (hatchedImageData) {
        try { hatchedImageUrl = await processShopItemImage(hatchedImageData); }
        catch (e) { console.error("Hatched image error:", e); return res.status(400).json({ message: "Failed to process hatched image. Please try a different file." }); }
      }

      let hooklessImageUrl: string | null = null;
      if (hooklessImageData) {
        try { hooklessImageUrl = await processShopItemImage(hooklessImageData); }
        catch (e) { console.error("Hookless image error:", e); return res.status(400).json({ message: "Failed to process hookless image. Please try a different file." }); }
      }

      const item = await storage.createShopItem({ ...parse.data, imageUrl, eggImageUrl, hatchedImageUrl, evolutionImageUrl, hooklessImageUrl });
      return res.status(201).json(item);
    } catch (err) {
      console.error("Create shop item error:", err);
      return res.status(500).json({ message: "Failed to create shop item" });
    }
  });

  app.patch("/api/admin/shop/:itemId", isAdmin, async (req, res) => {
    try {
      const { imageData, eggImageData, hatchedImageData, evolutionImageData, hooklessImageData, ...updateData } = req.body;

      const existing = await storage.getShopItem(req.params.itemId as string);
      if (!existing) return res.status(404).json({ message: "Shop item not found" });
      const { id: _id, createdAt: _createdAt, ...existingData } = existing;
      const parse = insertShopItemSchema.safeParse({ ...existingData, ...updateData });
      if (!parse.success) return res.status(400).json({ message: parse.error.errors[0].message });

      try {
        const evolutionImageUrl = await processEvolutionImageUpdate({ evolutionImageData, evolutionImageUrl: updateData.evolutionImageUrl }, parse.data.type, processShopItemImage);
        if (evolutionImageUrl !== undefined) updateData.evolutionImageUrl = evolutionImageUrl;
        if (parse.data.type !== "pet") updateData.evolutionImageUrl = null;
      } catch {
        return res.status(400).json({ message: "Failed to process evolution image. Existing image was kept; please upload a valid PNG (max 20MB)." });
      }

      if (imageData) {
        try { updateData.imageUrl = await (parse.data.type === "npc" ? processWorldImage(imageData, 1000) : processShopItemImage(imageData)); }
        catch (e) { console.error("Image error:", e); return res.status(400).json({ message: "Failed to process item image. Existing image was kept; please try a different file." }); }
      }
      if (eggImageData) {
        try { updateData.eggImageUrl = await processShopItemImage(eggImageData); }
        catch (e) { console.error("Egg image error:", e); return res.status(400).json({ message: "Failed to process egg image. Existing image was kept; please try a different file." }); }
      }
      if (hatchedImageData) {
        try { updateData.hatchedImageUrl = await processShopItemImage(hatchedImageData); }
        catch (e) { console.error("Hatched image error:", e); return res.status(400).json({ message: "Failed to process hatched image. Existing image was kept; please try a different file." }); }
      }
      if (hooklessImageData) {
        try { updateData.hooklessImageUrl = await processShopItemImage(hooklessImageData); }
        catch (e) { console.error("Hookless image error:", e); return res.status(400).json({ message: "Failed to process hookless image. Existing image was kept; please try a different file." }); }
      }

      const updated = await storage.updateShopItem((req.params.itemId as string), updateData);

      // If facingDirection changed, hot-patch any SSE clients whose active pet
      // is this shop item so they see the correct facing immediately without
      // needing to reload Keeper's Central.
      if (updateData.facingDirection !== undefined) {
        const shopItemId = req.params.itemId as string;
        for (const [uid, client] of _worldClients) {
          if (client.petData?.shopItemId === shopItemId) {
            client.petData = { ...client.petData, facingDirection: updateData.facingDirection };
            const payload = { ...client.petData, posX: client.posX, posY: client.posY };
            // Tell the owner their own pet data changed
            sendSSEEvent(client.res, "join", payload);
            // Tell everyone else so their roster updates too
            broadcastWorld("join", payload, uid);
          }
        }
      }

      return res.json(updated);
    } catch (err) {
      console.error("Update shop item error:", err);
      return res.status(500).json({ message: "Failed to update shop item" });
    }
  });

  app.delete("/api/admin/shop/:itemId", isAdmin, async (req, res) => {
    try {
      await storage.deleteShopItem((req.params.itemId as string));
      return res.json({ message: "Item deleted" });
    } catch (err) {
      console.error("Delete shop item error:", err);
      return res.status(500).json({ message: "Failed to delete shop item" });
    }
  });

  app.get("/api/admin/shop-items-all", isAdmin, async (req, res) => {
    try {
      const items = await storage.getAllShopItems();
      // Exclude bait items that are location-specific copies (they have a locationId).
      // Only the original templates (locationId === null) should appear in the bundle picker.
      const catalogItems = items.filter(i => !(i.fishingType === "bait" && i.locationId !== null));
      return res.json(catalogItems);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get shop items" });
    }
  });

  app.post("/api/admin/reward-bundle", isAdmin, async (req, res) => {
    try {
      const { name, coinAmount, shopItemIds, targetUserIds, message } = req.body;
      let cards;
      try { cards = parseBundleCards(req.body.cards); }
      catch (error: any) { return res.status(400).json({ message: error.message }); }
      if (!name || (!coinAmount && (!shopItemIds || shopItemIds.length === 0) && cards.length === 0)) {
        return res.status(400).json({ message: "Bundle must have a name and at least coins, items, or cards" });
      }
      if (targetUserIds !== undefined && (!Array.isArray(targetUserIds) || targetUserIds.length === 0)) {
        return res.status(400).json({ message: "Select at least one recipient" });
      }
      let recipients: string[];
      if (targetUserIds) recipients = [...new Set<string>(targetUserIds)];
      else recipients = (await storage.getAllUsers()).filter(u => !u.isAdmin).map(u => u.id);

      const bundle = await db.transaction(async tx => {
        // Validate card references before issuing any rewards. Keep bundle contents
        // and recipient records atomic so partial sends cannot omit cards.
        for (const card of cards) {
          const found = await tx.execute(sql`SELECT id FROM card_definitions WHERE id = ${card.cardId} FOR SHARE`);
          if (!found.rows.length) throw Object.assign(new Error("Card no longer exists; refresh the catalog"), { status: 400 });
        }
        const created = await tx.insert(rewardBundles).values({ name, coinAmount: coinAmount || 0, message: message || null }).returning();
        const bundle = created[0];
        for (const itemId of shopItemIds ?? []) {
          await tx.insert(rewardBundleItems).values({ bundleId: bundle.id, shopItemId: itemId });
        }
        for (const card of cards) {
          await tx.execute(sql`INSERT INTO reward_bundle_cards (bundle_id, card_id, quantity) VALUES (${bundle.id}, ${card.cardId}, ${card.quantity})`);
        }
        for (const userId of recipients) await tx.insert(userRewards).values({ userId, bundleId: bundle.id });
        return bundle;
      });

      return res.status(201).json({ bundle, recipientCount: recipients.length });
    } catch (err: any) {
      console.error("Create reward bundle error:", err);
      return res.status(err.status === 400 ? 400 : 500).json({ message: err.status === 400 ? err.message : "Failed to create reward bundle" });
    }
  });

  app.get("/api/admin/welcome-bundle", isAdmin, async (req, res) => {
    try {
      const config = await getWelcomeBundleConfig();
      const allShopItems = await storage.getAllShopItems();
      const itemsWithDetails = config.items.map(({ name, qty }) => {
        const shop = allShopItems.find(i => i.name.toLowerCase() === name.toLowerCase());
        // Pet shop items leave `image_url` blank and use `egg_image_url`
        // as the primary art (they live in the shop as un-hatched eggs).
        // Fall back through every art column so the welcome-bundle
        // editor never renders a "?" tile when the item actually has
        // artwork — just stored under a non-default field.
        const resolvedImage =
          (shop as any)?.imageUrl
          || (shop as any)?.eggImageUrl
          || (shop as any)?.hatchedImageUrl
          || (shop as any)?.hooklessImageUrl
          || (shop as any)?.sleepingImageUrl
          || null;
        return { name, qty, found: !!shop, imageUrl: resolvedImage, type: shop?.type ?? null, effect: computeItemEffect(shop) };
      });
      return res.json({ coinAmount: config.coinAmount, message: config.message, items: itemsWithDetails });
    } catch (err) {
      console.error("Get welcome bundle config error:", err);
      return res.status(500).json({ message: "Failed to get welcome bundle config" });
    }
  });

  app.put("/api/admin/welcome-bundle", isAdmin, async (req, res) => {
    try {
      const { coinAmount, message, items } = req.body;
      const config = { coinAmount: Number(coinAmount) || 0, message: message || "", items: items || [] };
      await storage.setGameSetting("welcome_bundle_config", JSON.stringify(config));
      return res.json({ success: true, config });
    } catch (err) {
      console.error("Save welcome bundle config error:", err);
      return res.status(500).json({ message: "Failed to save welcome bundle config" });
    }
  });


  app.get("/api/rewards/pending", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.welcomeV2Sent) {
        try { await grantWelcomeV2Bundle(user.id); }
        catch (error) { console.error("Welcome reward retry deferred:", error instanceof Error ? error.message : "unavailable"); }
      }
      const rewards = await storage.getUnclaimedRewards(user.id);
      const detailed = await Promise.all(rewards.map(async (reward) => {
        const bundle = await storage.getRewardBundle(reward.bundleId);
        const items = bundle ? await storage.getRewardBundleItems(bundle.id) : [];
        const itemDetails = await Promise.all(items.map(async (bi) => {
          const shopItem = await storage.getShopItem(bi.shopItemId);
          return shopItem ? { id: shopItem.id, name: shopItem.name, description: shopItem.description || null, type: shopItem.type, imageUrl: shopItem.imageUrl, eggImageUrl: shopItem.eggImageUrl } : null;
        }));
        const cards = bundle ? (await db.execute(sql`SELECT c.id, c.name, c.artwork_url, b.quantity
          FROM reward_bundle_cards b JOIN card_definitions c ON c.id = b.card_id WHERE b.bundle_id = ${bundle.id}`)).rows : [];
        return {
          bundleId: reward.bundleId,
          rewardId: reward.id,
          bundleName: bundle?.name || "Unknown",
          bundleMessage: bundle?.message || null,
          coinAmount: bundle?.coinAmount || 0,
          items: [
            ...itemDetails.filter(Boolean),
            ...cards.map((card: any) => ({ id: card.id, name: card.name, type: "card", imageUrl: card.artwork_url, eggImageUrl: null, quantity: Number(card.quantity) })),
          ],
          createdAt: reward.createdAt,
        };
      }));
      return res.json(detailed);
    } catch (err) {
      console.error("Get pending rewards error:", err);
      return res.status(500).json({ message: "Failed to get rewards" });
    }
  });

  app.post("/api/rewards/:rewardId/claim", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;

      if (!user.emailVerified) {
        return res.status(403).json({ message: "Please verify your email before claiming rewards", code: "EMAIL_UNVERIFIED" });
      }

      const rewardId = req.params.rewardId as string;
      const skippedPets: { name: string }[] = [];
      const BAIT_CHARGES_PER_BUNDLE = 5;
      const result = await db.transaction(async (tx) => {
        let reward: any;
        let bundle: any;
        let items: any[] = [];
        return executeRewardClaim({
          eligible: async () => {
            const found = await tx.execute(sql`SELECT * FROM user_rewards WHERE id = ${rewardId} FOR UPDATE`);
            reward = found.rows[0] as any;
            if (!reward) return false;
            if (reward.user_id !== user.id) throw Object.assign(new Error("NOT_OWNER"), { code: "NOT_OWNER" });
            if (reward.claimed) return false;
            const bundles = await tx.execute(sql`SELECT * FROM reward_bundles WHERE id = ${reward.bundle_id}`);
            bundle = bundles.rows[0] as any;
            if (!bundle) throw Object.assign(new Error("BUNDLE_NOT_FOUND"), { code: "BUNDLE_NOT_FOUND" });
            items = (await tx.execute(sql`SELECT rbi.shop_item_id, si.type, si.fishing_type, si.hatch_time FROM reward_bundle_items rbi JOIN shop_items si ON si.id = rbi.shop_item_id WHERE rbi.bundle_id = ${reward.bundle_id}`)).rows as any[];
            return true;
          },
          reserve: async () => true, // row lock plus the final conditional update is the reservation.
          grantCoins: async () => { if (Number(bundle.coin_amount) > 0) await tx.execute(sql`UPDATE users SET coins = coins + ${Number(bundle.coin_amount)}, total_coins_earned = total_coins_earned + ${Number(bundle.coin_amount)} WHERE id = ${user.id}`); },
          grantItems: async () => {
            await grantBundleCards(tx, user.id, reward.bundle_id);
            for (const item of items) {
              if (item.fishing_type === "bait") {
                const updated = await tx.execute(sql`UPDATE user_inventory SET quantity = quantity + ${BAIT_CHARGES_PER_BUNDLE} WHERE id = (SELECT id FROM user_inventory WHERE user_id = ${user.id} AND shop_item_id = ${item.shop_item_id} ORDER BY id LIMIT 1) RETURNING id`);
                if (!updated.rows.length) await tx.execute(sql`INSERT INTO user_inventory (user_id, shop_item_id, quantity) VALUES (${user.id}, ${item.shop_item_id}, ${BAIT_CHARGES_PER_BUNDLE})`);
              } else if (item.type === "pet" && item.hatch_time) {
                await tx.execute(sql`INSERT INTO user_inventory (user_id, shop_item_id, hatch_started_at) VALUES (${user.id}, ${item.shop_item_id}, NOW())`);
              } else {
                await tx.execute(sql`INSERT INTO user_inventory (user_id, shop_item_id) VALUES (${user.id}, ${item.shop_item_id})`);
              }
            }
          },
          commit: async () => {
            const updated = await tx.execute(sql`UPDATE user_rewards SET claimed = true WHERE id = ${rewardId} AND user_id = ${user.id} AND claimed = false RETURNING id`);
            if (!updated.rows.length) throw new Error("Claim record changed during claim");
          },
        });
      });
      if (result === "ineligible") return res.status(404).json({ message: "Reward not found or already claimed" });
      if (result === "already-claimed") return res.status(404).json({ message: "Reward already claimed" });

      const updatedUser = await storage.getUser(user.id);
      const safeUser = publicAccount(updatedUser!);

      return res.json({ user: safeUser, skippedPets });
    } catch (err: any) {
      if (err?.code === "NOT_OWNER") return res.status(403).json({ message: "This reward is not yours" });
      if (err?.code === "BUNDLE_NOT_FOUND") return res.status(404).json({ message: "Bundle not found" });
      console.error("Claim reward error:", err);
      return res.status(500).json({ message: "Failed to claim reward" });
    }
  });

  (async () => {
    try {
      const allItems = await storage.getAllShopItems();
      if (allItems.length === 0) {
        await storage.createShopItem({ name: "Forest Sprite", price: 100, type: "pet", worldId: "haunted_woods", locationId: null, rarity: 3, hatchTime: 1, statBoostType: null, statBoostAmount: null, imageUrl: null, eggImageUrl: null, hatchedImageUrl: null, specialSkill: null, healthRestored: null, manaRestored: null, petsRevived: null, atkBoost: null, defBoost: null });
        await storage.createShopItem({ name: "Enchanted Berry", price: 50, type: "item", worldId: "haunted_woods", locationId: null, rarity: null, hatchTime: null, statBoostType: "health", statBoostAmount: 100, imageUrl: null, eggImageUrl: null, hatchedImageUrl: null, specialSkill: null, healthRestored: null, manaRestored: null, petsRevived: null, atkBoost: null, defBoost: null });
        await storage.createShopItem({ name: "Mystic Scroll", price: 75, type: "item", worldId: "haunted_woods", locationId: null, rarity: null, hatchTime: null, statBoostType: "lvl", statBoostAmount: 1, imageUrl: null, eggImageUrl: null, hatchedImageUrl: null, specialSkill: null, healthRestored: null, manaRestored: null, petsRevived: null, atkBoost: null, defBoost: null });
        console.log("Seeded test shop items in Haunted Woods");
      }
    } catch (e) {
      console.error("Seed error:", e);
    }
  })();

  app.get("/api/location/:locationId/enemies", async (req, res) => {
    try {
      const { locationId } = req.params as Record<string, string>;
      const enemies = await storage.getLocationEnemies(locationId);
      const detailed = await Promise.all(enemies.map(async (enemy) => {
        const drops = await storage.getEnemyDrops(enemy.id);
        const dropDetails = await Promise.all(drops.map(async (drop) => {
          const shopItem = await storage.getShopItem(drop.shopItemId);
          return {
            id: drop.id,
            dropRate: drop.dropRate,
            shopItem: shopItem ? { id: shopItem.id, name: shopItem.name, type: shopItem.type, imageUrl: shopItem.imageUrl } : null,
          };
        }));
        return { ...enemy, drops: dropDetails.filter(d => d.shopItem) };
      }));
      return res.json(detailed);
    } catch (err) {
      console.error("Get location enemies error:", err);
      return res.status(500).json({ message: "Failed to fetch enemies" });
    }
  });

  app.post("/api/admin/location/:locationId/enemy", isAdmin, async (req, res) => {
    try {
      const { locationId } = req.params as Record<string, string>;
      const { enemyTemplateId, coinReward, bossSpecialAttack } = req.body;
      if (!enemyTemplateId) {
        return res.status(400).json({ message: "Enemy template is required" });
      }
      const allTemplates = await storage.getAllEnemies();
      const template = allTemplates.find(e => e.id === enemyTemplateId);
      if (!template) {
        return res.status(404).json({ message: "Enemy template not found" });
      }
      const validArchetypes = ["balanced", "attacker", "tank"];
      const safeArchetype = validArchetypes.includes(template.archetype) ? template.archetype : "balanced";
      const validSpecials = ["slash", "bolt"];
      const safeBossSpecial = (template.isBoss && validSpecials.includes(bossSpecialAttack)) ? bossSpecialAttack : null;
      const enemy = await storage.createLocationEnemy({
        locationId,
        name: template.name,
        imageUrl: template.imageUrl ?? null,
        isBoss: !!template.isBoss,
        archetype: safeArchetype,
        bossSpecialAttack: safeBossSpecial,
        coinReward: coinReward || 0,
      });
      return res.status(201).json(enemy);
    } catch (err) {
      console.error("Create enemy error:", err);
      return res.status(500).json({ message: "Failed to create enemy" });
    }
  });

  app.patch("/api/admin/enemy/:enemyId", isAdmin, async (req, res) => {
    try {
      const { enemyId } = req.params as Record<string, string>;
      const { name, imageData, coinReward, isBoss, archetype, bossSpecialAttack } = req.body;
      const validArchetypes = ["balanced", "attacker", "tank"];
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (coinReward !== undefined) updates.coinReward = coinReward;
      if (isBoss !== undefined) updates.isBoss = !!isBoss;
      if (archetype !== undefined && validArchetypes.includes(archetype)) updates.archetype = archetype;
      if (bossSpecialAttack !== undefined) {
        const validSpecials = ["slash", "bolt"];
        updates.bossSpecialAttack = (updates.isBoss !== false && validSpecials.includes(bossSpecialAttack)) ? bossSpecialAttack : null;
      }
      if (imageData) {
        try { updates.imageUrl = await processWorldImage(imageData, 1000); }
        catch (e) {
          console.error("Enemy image error:", e);
          return res.status(400).json({ message: "Failed to process enemy image. Existing image was kept; please try a different file." });
        }
      }
      const enemy = await storage.updateLocationEnemy(enemyId, updates);
      return res.json(enemy);
    } catch (err) {
      console.error("Update enemy error:", err);
      return res.status(500).json({ message: "Failed to update enemy" });
    }
  });

  app.delete("/api/admin/enemy/:enemyId", isAdmin, async (req, res) => {
    try {
      await storage.deleteLocationEnemy((req.params.enemyId as string));
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete enemy error:", err);
      return res.status(500).json({ message: "Failed to delete enemy" });
    }
  });

  app.post("/api/admin/enemy/:enemyId/drop", isAdmin, async (req, res) => {
    try {
      const { enemyId } = req.params as Record<string, string>;
      const { shopItemId, dropRate } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "Item is required" });
      const rate = Math.max(1, Math.min(100, parseInt(dropRate) || 10));
      const drop = await storage.createEnemyDrop({ enemyId, shopItemId, dropRate: rate });
      return res.status(201).json(drop);
    } catch (err) {
      console.error("Create drop error:", err);
      return res.status(500).json({ message: "Failed to add drop" });
    }
  });

  app.delete("/api/admin/drop/:dropId", isAdmin, async (req, res) => {
    try {
      await storage.deleteEnemyDrop((req.params.dropId as string));
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete drop error:", err);
      return res.status(500).json({ message: "Failed to delete drop" });
    }
  });

  app.post("/api/explore/:locationId/encounter", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.activePetId) {
        return res.status(400).json({ message: "Keepers must have a pet to explore safely" });
      }
      const rawInventory = await storage.getUserInventoryWithItems(user.id);
      const inventoryJoined = rawInventory.map(({ inventory: inv, shopItem }) => ({
        ...inv,
        name: shopItem?.name || "Unknown",
        imageUrl: shopItem?.imageUrl || null,
        hatchedImageUrl: shopItem?.hatchedImageUrl || null,
        petTemplateId: shopItem?.petTemplateId || null,
        specialSkill: shopItem?.specialSkill || null,
        specialSkillType: shopItem?.specialSkillType || null,
        skillDamagePercent: shopItem?.skillDamagePercent ?? null,
        skillHealPercent: shopItem?.skillHealPercent ?? null,
        skillType: (shopItem as any)?.skillType || null,
        skillAffects: (shopItem as any)?.skillAffects || null,
        rarity: shopItem?.rarity ?? null,
      }));
      const activePet = inventoryJoined.find((inv: any) => inv.id === user.activePetId && inv.isHatched);
      if (!activePet) {
        return res.status(400).json({ message: "Keepers must have a hatched pet to explore safely" });
      }

      const { locationId } = req.params as Record<string, string>;

      // ── Cave tier encounter (Murk Cave dungeon system) ──────────────────────
      const MURK_CAVE_ID = "a1b2c3d4-0001-4000-8000-000000000001";
      const reqCaveTier = req.body?.caveTier != null ? parseInt(String(req.body.caveTier), 10) : NaN;
      if (locationId === MURK_CAVE_ID && !isNaN(reqCaveTier) && reqCaveTier >= 1 && reqCaveTier <= 10) {
        const caveProgress = await storage.getPetCaveProgress(activePet.id)
          ?? { currentTier: 1, completedTiers: [] };
        if (!isCaveTierAccessible(caveProgress, reqCaveTier)) {
          return res.status(403).json({ message: `Cave tier ${reqCaveTier} is locked` });
        }
        const CAVE_TIER_STATS: Record<number, {
          normal: { hp: number; atk: number; def: number };
          miniBoss: { hp: number; atk: number; def: number };
          boss: { hp: number; atk: number; def: number };
        }> = {
          1:  { normal:{hp:1500,   atk:55,   def:25},   miniBoss:{hp:3500,   atk:80,   def:40},    boss:{hp:8000,    atk:110,  def:55}   },
          2:  { normal:{hp:3000,   atk:95,   def:45},   miniBoss:{hp:7000,   atk:140,  def:70},    boss:{hp:16000,   atk:185,  def:95}   },
          3:  { normal:{hp:5500,   atk:160,  def:80},   miniBoss:{hp:12000,  atk:230,  def:115},   boss:{hp:28000,   atk:290,  def:145}  },
          4:  { normal:{hp:9000,   atk:250,  def:125},  miniBoss:{hp:20000,  atk:360,  def:180},   boss:{hp:48000,   atk:440,  def:220}  },
          5:  { normal:{hp:14000,  atk:370,  def:185},  miniBoss:{hp:31000,  atk:520,  def:260},   boss:{hp:75000,   atk:620,  def:310}  },
          6:  { normal:{hp:35000,  atk:800,  def:400},  miniBoss:{hp:80000,  atk:1150, def:575},   boss:{hp:190000,  atk:1400, def:700}  },
          7:  { normal:{hp:55000,  atk:1200, def:600},  miniBoss:{hp:125000, atk:1700, def:850},   boss:{hp:300000,  atk:2100, def:1050} },
          8:  { normal:{hp:85000,  atk:1800, def:900},  miniBoss:{hp:190000, atk:2500, def:1250},  boss:{hp:460000,  atk:3100, def:1550} },
          9:  { normal:{hp:130000, atk:2700, def:1350}, miniBoss:{hp:290000, atk:3700, def:1850},  boss:{hp:700000,  atk:4500, def:2250} },
          10: { normal:{hp:200000, atk:4000, def:2000}, miniBoss:{hp:450000, atk:5500, def:2750},  boss:{hp:1100000, atk:7000, def:3500} },
        };
        const tierEnemies = await storage.getLocationEnemiesByTier(locationId, reqCaveTier);
        const tierNormals = tierEnemies.filter((e: any) => !e.is_boss && !e.is_mini_boss);
        const tierMiniBoss = tierEnemies.find((e: any) => e.is_mini_boss);
        const tierBoss = tierEnemies.find((e: any) => e.is_boss);
        if (!tierBoss || !tierMiniBoss || tierNormals.length === 0) {
          return res.status(503).json({ message: "Cave is being prepared, try again soon" });
        }
        const stats = CAVE_TIER_STATS[reqCaveTier];
        const v = () => 0.95 + Math.random() * 0.10;
        const shuffled = [...tierNormals].sort(() => Math.random() - 0.5);
        const buildCaveWave = (enemy: any, type: "normal" | "miniBoss" | "boss", waveGroup: number) => {
          const base = stats[type];
          return {
            enemyId: enemy.id,
            name: enemy.name,
            imageUrl: enemy.image_url,
            isBoss: type === "boss",
            isMiniBoss: type === "miniBoss",
            waveGroup,
            archetype: "balanced",
            bossSpecialAttack: type !== "normal" ? (enemy.boss_special_attack ?? null) : null,
            level: reqCaveTier * 10,
            hp: Math.max(1, Math.floor(base.hp * v())),
            atk: Math.max(1, Math.floor(base.atk * v())),
            def: Math.max(1, Math.floor(base.def * v())),
            coinReward: type === "boss"
              ? 30 + Math.floor(Math.random() * 6)
              : type === "miniBoss"
                ? 25 + Math.floor(Math.random() * 6)
                : 15 + Math.floor(Math.random() * 6),
            drops: [],
          };
        };
        // 6 wave groups, enemies fought sequentially within each group:
        //  0: normal × 2   1: normal × 2   2: normal + mini-boss + normal
        //  3: normal × 2   4: normal × 3   5: normal × 2 + boss
        const s = shuffled;
        const n = s.length;
        const caveEncounters = [
          buildCaveWave(s[0 % n], "normal", 0), buildCaveWave(s[1 % n], "normal", 0),
          buildCaveWave(s[2 % n], "normal", 1), buildCaveWave(s[3 % n], "normal", 1),
          buildCaveWave(s[4 % n], "normal", 2), buildCaveWave(tierMiniBoss, "miniBoss", 2), buildCaveWave(s[5 % n], "normal", 2),
          buildCaveWave(s[6 % n], "normal", 3), buildCaveWave(s[7 % n], "normal", 3),
          buildCaveWave(s[8 % n], "normal", 4), buildCaveWave(s[9 % n], "normal", 4), buildCaveWave(s[10 % n], "normal", 4),
          buildCaveWave(s[11 % n], "normal", 5), buildCaveWave(s[12 % n], "normal", 5), buildCaveWave(tierBoss, "boss", 5),
        ];
        let petImageUrl = activePet.hatchedImageUrl || activePet.imageUrl || null;
        let petBackImageUrl: string | null = null;
        if (activePet.petTemplateId) {
          const template = await storage.getPetTemplate(activePet.petTemplateId);
          if (template?.frontAssembled) petImageUrl = `/api/pet-template-image/${activePet.petTemplateId}/front`;
          if (template?.backAssembled)  petBackImageUrl = `/api/pet-template-image/${activePet.petTemplateId}/back`;
        }
        return res.json({
          encounters: caveEncounters,
          isCaveEncounter: true,
          caveTier: reqCaveTier,
          pet: {
            inventoryId: activePet.id,
            name: activePet.petNickname || activePet.name || "Pet",
            level: activePet.petLevel,
            hp: activePet.petHealth,
            atk: activePet.petAtk,
            def: activePet.petDef,
            petTemplateId: activePet.petTemplateId || null,
            imageUrl: petImageUrl,
            backImageUrl: petBackImageUrl,
            specialSkill: activePet.specialSkill || null,
            specialSkillType: (activePet as any).specialSkillType || null,
            skillDamagePercent: activePet.skillDamagePercent ?? null,
            skillHealPercent: (activePet as any).skillHealPercent ?? null,
            skillType: (activePet as any).skillType || null,
            skillAffects: (activePet as any).skillAffects || null,
            rarity: (activePet as any).rarity ?? null,
          },
          extraPetImages: {},
        });
      }
      // ───────────────────────────────────────────────────────────────────────

      const enemies = await storage.getLocationEnemies(locationId);
      if (enemies.length === 0) {
        return res.json({ encounter: null });
      }

      // ── Battle Balance Configuration ────────────────────────────────────────
      // All constants are here — adjust freely without touching formulas.
      const BATTLE_CFG = {
        // Pet power formula weights
        petPower: { hpWeight: 0.08, atkWeight: 1.2, defWeight: 1.0, levelWeight: 4 },

        // Zone base difficulty — higher = harder location
        // Zone1=180  Zone2=230  Zone3=290  Zone4=360  Zone5=440  Zone6=530
        zoneBases: {
          swamp:           180,
          island:          230,
          enchanted_grove: 290,
          haunted_woods:   360,
          snowy_mountain:  440,
          desert:          440,
          volcanic:        530,
        } as Record<string, number>,
        defaultZoneBase: 180,

        // How much zone vs pet stats drive enemy power (must sum to 1.0)
        enemyPowerBlend: { zone: 0.75, pet: 0.25 },

        // Archetype multipliers for HP / ATK / DEF
        // HP is scaled ~4× vs single-pet baseline to stay challenging with up to 3 pets.
        // ATK tuned to hit a tad harder than before; boss difficulty bumped separately.
        archetypes: {
          balanced: { hpMult: 20,   atkMult: 0.30, defMult: 0.42 },
          attacker: { hpMult: 17,   atkMult: 0.38, defMult: 0.32 },
          tank:     { hpMult: 24,   atkMult: 0.24, defMult: 0.55 },
        } as Record<string, { hpMult: number; atkMult: number; defMult: number }>,

        // Encounter difficulty multipliers — boss bumped to 1.75 (was 1.45)
        difficulty: { normal: 1.0, strong: 1.12, elite: 1.25, boss: 1.75 },

        // Per-wave escalation (wave 0 = ×1.0, wave 1 = ×1.12, ...)
        waveEscalation: 0.12,

        // Random variance applied per stat (uniform between min and max)
        variance: { min: 0.95, max: 1.05 },

        // Counter-scaling: punish extreme builds slightly
        counterScale: {
          atkHeavyRatio: 1.5,   // if petATK > petDEF × ratio → enemy gains bonus HP
          atkHeavyHpBonus: 0.08,
          tankHpRatio: 1.25,    // if petHP > expected × ratio → enemy gains bonus ATK
          tankAtkBonus: 0.06,
          expectedHpPerLevel: 30, // rough HP gained per level above 1
        },

        // Stat floors
        minHp: 200, minAtk: 10, minDef: 5,
      };
      // ───────────────────────────────────────────────────────────────────────

      const petLevel = activePet.petLevel || 1;
      const petHp = activePet.petHealth || 1000;
      const petAtk = activePet.petAtk || 50;
      const petDef = activePet.petDef || 50;

      // 1. Pet power score
      const petPower =
        (petHp  * BATTLE_CFG.petPower.hpWeight)  +
        (petAtk * BATTLE_CFG.petPower.atkWeight)  +
        (petDef * BATTLE_CFG.petPower.defWeight)  +
        (petLevel * BATTLE_CFG.petPower.levelWeight);

      // 2. Zone base (look up via the location's worldId)
      const locationData = await storage.getWorldLocation(locationId);
      const zoneBase = BATTLE_CFG.zoneBases[locationData?.worldId ?? ""] ?? BATTLE_CFG.defaultZoneBase;

      // 3. Base enemy power (blend zone difficulty + pet contribution)
      const baseEnemyPower =
        (zoneBase * BATTLE_CFG.enemyPowerBlend.zone) +
        (petPower * BATTLE_CFG.enemyPowerBlend.pet);

      // 8. Counter-scaling factors (computed once, applied per enemy)
      const expectedPetHp = 1000 + (petLevel - 1) * BATTLE_CFG.counterScale.expectedHpPerLevel;
      const atkHeavyBonus = petAtk > petDef * BATTLE_CFG.counterScale.atkHeavyRatio
        ? 1 + BATTLE_CFG.counterScale.atkHeavyHpBonus : 1;
      const tankBonus = petHp > expectedPetHp * BATTLE_CFG.counterScale.tankHpRatio
        ? 1 + BATTLE_CFG.counterScale.tankAtkBonus : 1;

      const normals = enemies.filter(e => !e.isBoss).sort(() => Math.random() - 0.5);
      const bosses = enemies.filter(e => e.isBoss).sort(() => Math.random() - 0.5);
      const ordered = [...normals, ...bosses];
      const encounters = await Promise.all(ordered.map(async (enemy, waveIndex) => {
        // Wave escalation: each subsequent enemy in the queue is a bit harder
        const waveScale = 1 + waveIndex * BATTLE_CFG.waveEscalation;

        // 3. Enemy power for this wave
        const enemyPower = baseEnemyPower * waveScale;

        // 4. Archetype stat multipliers
        const archetype = (enemy as any).archetype || "balanced";
        const arc = BATTLE_CFG.archetypes[archetype] ?? BATTLE_CFG.archetypes.balanced;

        // 5. Difficulty multiplier (boss gets the boss tier; others get normal)
        const diffMult = enemy.isBoss
          ? BATTLE_CFG.difficulty.boss
          : BATTLE_CFG.difficulty.normal;

        // 7. Variance helper
        const variance = () =>
          BATTLE_CFG.variance.min +
          Math.random() * (BATTLE_CFG.variance.max - BATTLE_CFG.variance.min);

        // Generate base stats
        let enemyHp  = enemyPower * arc.hpMult  * diffMult * variance();
        let enemyAtk = enemyPower * arc.atkMult * diffMult * variance();
        let enemyDef = enemyPower * arc.defMult * diffMult * variance();

        // 8. Apply counter-scaling
        enemyHp  *= atkHeavyBonus;
        enemyAtk *= tankBonus;

        const maxLevelOffset = enemy.isBoss ? 5 : 2;
        const enemyLevel = Math.max(1, petLevel + Math.floor(Math.random() * (maxLevelOffset + 1)));

        const drops = await storage.getEnemyDrops(enemy.id);
        const dropDetails = await Promise.all(drops.map(async (drop) => {
          const shopItem = await storage.getShopItem(drop.shopItemId);
          return shopItem ? { id: drop.id, dropRate: drop.dropRate, shopItem: { id: shopItem.id, name: shopItem.name, type: shopItem.type, imageUrl: shopItem.imageUrl } } : null;
        }));

        return {
          enemyId: enemy.id,
          name: enemy.name,
          imageUrl: enemy.imageUrl,
          isBoss: enemy.isBoss,
          archetype,
          bossSpecialAttack: enemy.isBoss ? ((enemy as any).bossSpecialAttack ?? null) : null,
          level: enemyLevel,
          hp: Math.max(BATTLE_CFG.minHp, Math.floor(enemyHp)),
          atk: Math.max(BATTLE_CFG.minAtk, Math.floor(enemyAtk)),
          def: Math.max(BATTLE_CFG.minDef, Math.floor(enemyDef)),
          coinReward: enemy.coinReward,
          drops: dropDetails.filter(Boolean),
        };
      }));

      let petImageUrl = activePet.hatchedImageUrl || activePet.imageUrl || null;
      let petBackImageUrl: string | null = null;
      if (activePet.petTemplateId) {
        const template = await storage.getPetTemplate(activePet.petTemplateId);
        if (template) {
          if (template.backAssembled)  petBackImageUrl = `/api/pet-template-image/${activePet.petTemplateId}/back`;
          if (template.frontAssembled) petImageUrl     = `/api/pet-template-image/${activePet.petTemplateId}/front`;
        }
      }

      // Resolve battle-image URLs for the player's *extra* equipped pets so
      // the BattleArena can render them at the same scale/proportions as
      // the active pet. Without this, slot 0 renders the assembled
      // template (tight bounds) while slots 1–2 fall back to the raw
      // hatched portrait (lots of transparent padding) — the right-side
      // pets end up looking ~30% smaller. Same lookup as the active pet.
      // Cap at 2 since the world-battle UI only supports 2 extra pet
      // slots — prevents a client from spamming hundreds of inventory
      // lookups per encounter request.
      const extraIds: string[] = Array.isArray(req.body?.extraPetInventoryIds)
        ? req.body.extraPetInventoryIds
            .filter((x: any): x is string => typeof x === "string" && x.length > 0)
            .slice(0, 2)
        : [];
      const extraPetImages: Record<string, string> = {};
      if (extraIds.length > 0) {
        await Promise.all(extraIds.map(async (invId) => {
          const inv = inventoryJoined.find((it: any) => it.id === invId && it.isHatched);
          if (!inv) return;
          let url: string | null = inv.hatchedImageUrl || inv.imageUrl || null;
          if (inv.petTemplateId) {
            const tpl = await storage.getPetTemplate(inv.petTemplateId);
            if (tpl?.frontAssembled) url = `/api/pet-template-image/${inv.petTemplateId}/front`;
          }
          if (url) extraPetImages[invId] = url;
        }));
      }

      return res.json({
        encounters,
        pet: {
          inventoryId: activePet.id,
          name: activePet.petNickname || activePet.name || "Pet",
          level: activePet.petLevel,
          hp: activePet.petHealth,
          atk: activePet.petAtk,
          def: activePet.petDef,
          petTemplateId: activePet.petTemplateId || null,
          imageUrl: petImageUrl,
          backImageUrl: petBackImageUrl,
          specialSkill: activePet.specialSkill || null,
          specialSkillType: (activePet as any).specialSkillType || null,
          skillDamagePercent: activePet.skillDamagePercent ?? null,
          skillHealPercent: (activePet as any).skillHealPercent ?? null,
          skillType: (activePet as any).skillType || null,
          skillAffects: (activePet as any).skillAffects || null,
          rarity: (activePet as any).rarity ?? null,
        },
        extraPetImages,
      });
    } catch (err) {
      console.error("Generate encounter error:", err);
      return res.status(500).json({ message: "Failed to generate encounter" });
    }
  });

  app.post("/api/explore/defeat/:enemyId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.activePetId) {
        return res.status(400).json({ message: "No active pet" });
      }
      const inventory = await storage.getUserInventory(user.id);
      const activePet = inventory.find((inv: any) => inv.id === user.activePetId && inv.isHatched);
      if (!activePet) {
        return res.status(400).json({ message: "No active hatched pet" });
      }

      const { enemyId } = req.params as Record<string, string>;
      const { enemyLevel: clientEnemyLevel, extraPetInventoryIds } = req.body;
      const enemy = await storage.getLocationEnemy(enemyId);
      if (!enemy) {
        return res.status(404).json({ message: "Enemy not found" });
      }

      const petLevel = activePet.petLevel || 0;
      const petHp = activePet.petHealth || 1000;
      const maxLevelOffset = enemy.isBoss ? 5 : 2;
      const maxAllowedLevel = petLevel + maxLevelOffset;
      const enemyLevel = Math.max(1, Math.min(clientEnemyLevel || 1, maxAllowedLevel));
      const bossHpMult = enemy.isBoss ? 4.0 : 1.0;
      const startingHp = Math.max(200, Math.floor(petHp * 2 * bossHpMult));
      const lvlPointsEarned = Math.max(1, Math.floor(startingHp * 0.05));
      // Apply XP boost if the active pet has one from a loyalty reward
      const xpNow = Date.now();
      const activeBoostOn = activePet.xpBoostUntil && new Date(activePet.xpBoostUntil).getTime() > xpNow;
      const activePetXpMult = activeBoostOn ? (1 + ((activePet.xpBoostPct || 0) / 100)) : 1;
      const boostedPoints = Math.round(lvlPointsEarned * activePetXpMult);

      const prevLevel = activePet.petLevel || 1;
      const prevLevelPoints = activePet.petLevelPoints || 0;
      let totalPoints = prevLevelPoints + boostedPoints;
      let newLevel = activePet.petLevel;
      while (newLevel < 100) {
        const needed = Math.floor(100 + newLevel * 30 + newLevel * newLevel * 5);
        if (totalPoints < needed) break;
        totalPoints -= needed;
        newLevel++;
      }
      if (newLevel >= 100) {
        newLevel = 100;
        totalPoints = 0;
      }

      await storage.updateInventoryItem(activePet.id, {
        petLevel: newLevel,
        petLevelPoints: totalPoints,
      });

      // Grant XP to extra battle pets
      const extraPetResults: Array<{
        inventoryId: string;
        prevLevel: number;
        prevLevelPoints: number;
        newLevel: number;
        newLevelPoints: number;
        pointsNeeded: number;
        lvlPointsEarned: number;
        levelsGained: number;
        petName: string;
        petTemplateId: string | null;
      }> = [];
      if (Array.isArray(extraPetInventoryIds) && extraPetInventoryIds.length > 0) {
        for (const extraId of extraPetInventoryIds) {
          if (!extraId || extraId === activePet.id) continue;
          const extraPet = inventory.find((inv: any) => inv.id === extraId && inv.isHatched);
          if (!extraPet) continue;
          const ePrevLevel = extraPet.petLevel || 1;
          const ePrevLevelPoints = extraPet.petLevelPoints || 0;
          const extraBoostOn = extraPet.xpBoostUntil && new Date(extraPet.xpBoostUntil).getTime() > xpNow;
          const extraXpMult = extraBoostOn ? (1 + ((extraPet.xpBoostPct || 0) / 100)) : 1;
          let eTotalPoints = ePrevLevelPoints + Math.round(lvlPointsEarned * extraXpMult);
          let eNewLevel = ePrevLevel;
          while (eNewLevel < 100) {
            const needed = Math.floor(100 + eNewLevel * 30 + eNewLevel * eNewLevel * 5);
            if (eTotalPoints < needed) break;
            eTotalPoints -= needed;
            eNewLevel++;
          }
          if (eNewLevel >= 100) { eNewLevel = 100; eTotalPoints = 0; }
          await storage.updateInventoryItem(extraPet.id, { petLevel: eNewLevel, petLevelPoints: eTotalPoints });
          extraPetResults.push({
            inventoryId: extraPet.id,
            prevLevel: ePrevLevel,
            prevLevelPoints: ePrevLevelPoints,
            newLevel: eNewLevel,
            newLevelPoints: eTotalPoints,
            pointsNeeded: Math.floor(100 + eNewLevel * 30 + eNewLevel * eNewLevel * 5),
            lvlPointsEarned,
            levelsGained: Math.max(0, eNewLevel - ePrevLevel),
            petName: (extraPet as any).petNickname || (extraPet as any).name || "Pet",
            petTemplateId: (extraPet as any).petTemplateId ?? null,
          });
        }
      }

      let coinsAwarded = enemy.coinReward || 0;
      if (coinsAwarded > 0) {
        await storage.addCoins(user.id, coinsAwarded);
      }

      // Item drops — guarantee 1 per regular kill, 2-3 per boss kill.
      // Randomize selection from the admin-configured drop list.
      const drops = await storage.getEnemyDrops(enemy.id);
      const droppedItems: any[] = [];
      if (drops.length > 0) {
        const guaranteedCount = enemy.isBoss ? (2 + Math.floor(Math.random() * 2)) : 1;
        const picks: typeof drops = [];
        for (let i = 0; i < guaranteedCount; i++) {
          picks.push(drops[Math.floor(Math.random() * drops.length)]);
        }
        for (const drop of picks) {
          const shopItem = await storage.getShopItem(drop.shopItemId);
          if (shopItem) {
            const invItem = await storage.addToInventory(user.id, shopItem.id);
            if (shopItem.type === "pet") {
              await storage.updateInventoryItem(invItem.id, { hatchStartedAt: new Date() });
            }
            droppedItems.push({ name: shopItem.name, type: shopItem.type, imageUrl: shopItem.imageUrl });
          }
        }
      }

      const updatedUser = await storage.getUser(user.id);

      return res.json({
        lvlPointsEarned,
        prevLevel,
        prevLevelPoints,
        newLevel,
        newLevelPoints: totalPoints,
        pointsNeeded: Math.floor(100 + newLevel * 30 + newLevel * newLevel * 5),
        levelsGained: newLevel - prevLevel,
        coinsAwarded,
        droppedItems,
        extraPetResults,
        user: updatedUser ? publicAccount(updatedUser) : undefined,
      });
    } catch (err) {
      console.error("Defeat enemy error:", err);
      return res.status(500).json({ message: "Failed to process defeat" });
    }
  });

  app.post("/api/explore/use-potion", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.body;
      if (!inventoryId) {
        return res.status(400).json({ message: "Missing inventoryId" });
      }

      const userInv = await storage.getUserInventory(user.id);
      const potionInv = userInv.find((inv: any) => inv.id === inventoryId);
      if (!potionInv) {
        return res.status(404).json({ message: "Potion not found in inventory" });
      }

      const shopItem = await storage.getShopItem(potionInv.shopItemId);
      if (!shopItem || shopItem.type !== "potion") {
        return res.status(400).json({ message: "Item is not a potion" });
      }

      const healAmount = shopItem.healthRestored || 0;
      const manaAmount = shopItem.manaRestored || 0;
      const petsRevived = shopItem.petsRevived || 0;
      const petsHealed = shopItem.petsHealed || 0;

      // Consume only an owned, still-positive stack. In particular, a second
      // concurrent request for the final potion must not receive its effect.
      const consumption = await db.transaction((tx) =>
        tryConsumeOneFromInventory(tx, user.id, inventoryId),
      );
      if (!consumption.consumed) {
        return res.status(409).json({ message: "Potion is no longer available" });
      }
      const remainingQty = consumption.remainingQuantity;
      const depleted = remainingQty === 0;

      return res.json({ consumedInventoryId: inventoryId, remainingQuantity: remainingQty, healAmount, manaAmount, petsRevived, petsHealed, potionName: shopItem.name, remainingQty, depleted });
    } catch (err) {
      console.error("Use potion error:", err);
      return res.status(500).json({ message: "Failed to use potion" });
    }
  });

  // Public egg showcase — returns pet eggs for the hub page (no auth required)
  app.get("/api/public/eggs", async (_req, res) => {
    try {
      const allItems = await storage.getAllShopItems();
      const eggs = allItems
        .filter((i: any) => i.type === "pet" && i.eggImageUrl)
        .map((i: any) => ({ id: i.id, eggImageUrl: i.eggImageUrl }));
      return res.json(eggs);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load eggs" });
    }
  });

  // Public contribution leaderboard — top spenders (non-admin), moderators included.
  app.get("/api/public/leaderboard", async (_req, res) => {
    try {
      const rows = await db
        .select({
          userId: coinPurchases.userId,
          username: usersTable.username,
          profileImage: usersTable.profileImage,
          isModerator: usersTable.isModerator,
          totalUsd: sql<number>`SUM(${coinPurchases.amountUsd})`,
        })
        .from(coinPurchases)
        .innerJoin(usersTable, eq(coinPurchases.userId, usersTable.id))
        .where(eq(usersTable.isAdmin, false))
        .groupBy(coinPurchases.userId, usersTable.username, usersTable.profileImage, usersTable.isModerator)
        .orderBy(sql`SUM(${coinPurchases.amountUsd}) DESC`)
        .limit(20);

      const leaderboard = rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        username: r.username,
        profileImage: r.profileImage ?? null,
        isModerator: r.isModerator ?? false,
        points: Number(r.totalUsd) * 10,
      }));
      return res.json(leaderboard);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to load leaderboard" });
    }
  });

  // Public pet showcase — hatched pet images for the hub page.
  // Uses hatchedImageUrl from shop items (same source as the egg showcase),
  // falling back to frontAssembled on the linked pet template if missing.
  app.get("/api/public/pets", async (_req, res) => {
    try {
      const allItems = await storage.getAllShopItems();
      const pets = allItems
        .filter((i: any) => i.type === "pet" && i.hatchedImageUrl)
        .map((i: any) => ({ id: i.id, name: i.name, imageUrl: i.hatchedImageUrl }))
        .sort(() => Math.random() - 0.5);
      return res.json(pets);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load pets" });
    }
  });

  // Privacy policy — public read, admin write
  app.get("/api/privacy-policy", async (_req, res) => {
    try {
      const text = await storage.getGameSetting("privacy_policy");
      return res.json({ text: text ?? "" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to load privacy policy" });
    }
  });

  app.post("/api/admin/privacy-policy", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { text } = req.body;
      if (typeof text !== "string") return res.status(400).json({ message: "text required" });
      await storage.setGameSetting("privacy_policy", text);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to save privacy policy" });
    }
  });


  registerBadgeRoutes(app, { storage, db, isAuthenticated, processWorldImage }, "definitions");

  // ───────── Emblems (PvP rank-trophy catalog, admin-managed) ─────────
  app.get("/api/admin/emblems", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const all = await storage.listEmblems();
      return res.json(all);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to fetch emblems" });
    }
  });

  app.post("/api/admin/emblems", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { name, description, imageData } = req.body;
      if (!name || !imageData) return res.status(400).json({ message: "name and imageData required" });
      const imageUrl = await processWorldImage(imageData, 1000);
      const emblem = await storage.createEmblem({
        name: String(name).trim(),
        description: description ? String(description) : null,
        imageUrl,
      });
      return res.json(emblem);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to create emblem" });
    }
  });

  app.patch("/api/admin/emblems/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { name, description, imageData } = req.body;
      const updateData: { name?: string; description?: string | null; imageUrl?: string } = {};
      if (name !== undefined && String(name).trim()) updateData.name = String(name).trim();
      if (description !== undefined) updateData.description = description ? String(description) : null;
      if (imageData) updateData.imageUrl = await processWorldImage(imageData, 1000);
      await storage.updateEmblem(req.params.id as string, updateData);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to update emblem" });
    }
  });

  app.delete("/api/admin/emblems/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteEmblem(req.params.id as string);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to delete emblem" });
    }
  });

  registerBadgeRoutes(app, { storage, db, isAuthenticated, processWorldImage }, "leaderboards");


  // Batch avatar fetcher. Profile pictures are stored as base64 data URLs and
  // would otherwise be embedded in every leaderboard / chat row, blowing up
  // payloads. This endpoint returns { [userId]: dataUrl|null } for the requested
  // ids only. Frontends should cache the result with a long staleTime since
  // avatars change rarely.
  app.post("/api/users/avatars", isAuthenticated, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.userIds) ? req.body.userIds.filter((x: any) => typeof x === "string") : [];
      if (ids.length === 0) return res.json({});
      // Hard cap to prevent abuse.
      const capped = ids.slice(0, 200);
      const map = await storage.getUsersAvatars(capped);
      // Long-ish private cache — avatars rarely change.
      res.set("Cache-Control", "private, max-age=60");
      return res.json(map);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to fetch avatars" });
    }
  });

  registerBadgeRoutes(app, { storage, db, isAuthenticated, processWorldImage }, "claims");

  registerMarketplaceRoutes(app, marketplaceRouteDependencies, "lifecycle");

  const fishingRouteDependencies: FishingRouteDependencies = {
    storage,
    db,
    isAuthenticated,
    processFishPartImage: async (imageBuffer) => sharp(imageBuffer)
      .resize(600, 600, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer(),
    executeFishCatchRewardClaim,
    sellFish,
    getFishSaleErrorReason: (error) => error instanceof FishSaleError ? error.reason : null,
    incrementQuestProgress,
    maybeAwardFisherBadges,
    maybeAwardFishBookBadge,
   };
  registerFishingRoutes(app, fishingRouteDependencies);

  // ── Lava Crawl mini-game ──────────────────────────────────────────────────
  registerLavaCrawlRoutes(app, { storage, db, isAuthenticated, applyPetXp });

  registerForumRoutes(app, { db, isAuthenticated });

  app.get("/api/support-messages/my", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const rows = await db.execute(sql`
        SELECT id, subject, message, is_read, created_at
        FROM support_messages
        WHERE username = ${user.username}
        ORDER BY created_at DESC
      `);
      return res.json(rows.rows);
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/support-messages/my/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await db.execute(sql`DELETE FROM support_messages WHERE id = ${req.params.id} AND username = ${user.username}`);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  // ── Hub notices routes ───────────────────────────────────────────────────────

  app.get("/api/hub/notices", async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT id, image_url, href, label, sort_order, created_at
        FROM hub_notices ORDER BY sort_order ASC, created_at ASC
      `);
      return res.json(rows.rows);
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.post("/api/hub/notices", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const { image_url, href = "", label = "", sort_order = 0 } = req.body;
      if (!image_url) return res.status(400).json({ message: "image_url required" });
      const rows = await db.execute(sql`
        INSERT INTO hub_notices (image_url, href, label, sort_order)
        VALUES (${image_url}, ${href}, ${label}, ${sort_order})
        RETURNING id, image_url, href, label, sort_order, created_at
      `);
      return res.json(rows.rows[0]);
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/hub/notices/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      await db.execute(sql`DELETE FROM hub_notices WHERE id = ${req.params.id}`);
      return res.json({ ok: true });
    } catch (err: any) { return res.status(500).json({ message: err.message }); }
  });

  registerFishingAquariumRoutes(app, fishingRouteDependencies);

  // ── PvP Arena Routes ─────────────────────────────────────────────────────
  registerPvpRoutes(app, { storage, isAuthenticated, publicAccount, maybeAwardBrawlerBadges });

  // ── Friends + Notifications ───────────────────────────────────────────────
  registerFriendsRoutes(app, { storage, isAuthenticated });

  // ── Enemy Database + Parts Admin ──────────────────────────────────────────
  registerEnemyAdminRoutes(app, { storage, isAdmin });

  // ── Keeper's Central kill reward ──────────────────────────────────────────
  app.post("/api/world/pet_world/kc-kill-reward", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const coinsEarned = 1 + Math.floor(Math.random() * 2); // 1 or 2
      const updatedUser = await storage.addCoins(user.id, coinsEarned);

      // Find the active pet inventory item and award 5 XP
      let petResult: { petLevel: number; petLevelPoints: number } | null = null;
      if (updatedUser.activePetId) {
        const [petInv] = await db
          .select()
          .from(userInventory)
          .where(and(eq(userInventory.id, updatedUser.activePetId), eq(userInventory.userId, user.id)))
          .limit(1);
        if (petInv) {
          const { newLevel, newPoints } = applyPetXp(petInv.petLevel || 1, petInv.petLevelPoints || 0, 5);
          const updates: any = { petLevelPoints: newPoints };
          if (newLevel > (petInv.petLevel || 1)) updates.petLevel = newLevel;
          const updated = await storage.updateInventoryItem(petInv.id, updates);
          petResult = { petLevel: updated.petLevel || 1, petLevelPoints: updated.petLevelPoints || 0 };
        }
      }

      return res.json({ coins: updatedUser.coins, coinsEarned, petResult });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Keeper's Central Enemies ──────────────────────────────────────────────
  app.get("/api/world/pet_world/kc-enemies", isAuthenticated, async (_req, res) => {
    try {
      const enemies = await storage.getKeepersCentralEnemies();
      return res.json(enemies);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/kc-enemies", isAdmin, async (req, res) => {
    try {
      const { enemyId, spawnX, spawnY } = req.body;
      if (!enemyId) return res.status(400).json({ message: "enemyId required" });
      const row = await storage.addKeepersCentralEnemy(
        enemyId,
        typeof spawnX === "number" ? spawnX : 20 + Math.random() * 60,
        typeof spawnY === "number" ? spawnY : 40 + Math.random() * 40
      );
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/kc-enemies/:id", isAdmin, async (req, res) => {
    try {
      await storage.removeKeepersCentralEnemy((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── KC Doors ─────────────────────────────────────────────────────────────────
  app.get("/api/world/:worldId/kc-doors", isAuthenticated, async (req, res) => {
    try {
      const doors = await storage.getKcDoors((req.params.worldId as string));
      return res.json(doors);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/kc-doors", isAdmin, async (req, res) => {
    try {
      const { worldId = "pet_world", name = "Door", posX = 50, posY = 60, triggerRadius = 6, bgUrl = null, isShop = false } = req.body;
      const door = await storage.createKcDoor({ worldId, name, posX, posY, triggerRadius, bgUrl, isShop: !!isShop });
      return res.json(door);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/kc-doors/:id", isAdmin, async (req, res) => {
    try {
      const { name, posX, posY, triggerRadius, bgUrl, bgData, isShop } = req.body;
      const updates: { name?: string; posX?: number; posY?: number; triggerRadius?: number; bgUrl?: string | null; isShop?: boolean } = {};
      if (name !== undefined)          updates.name = name;
      if (posX !== undefined)          updates.posX = posX;
      if (posY !== undefined)          updates.posY = posY;
      if (triggerRadius !== undefined) updates.triggerRadius = triggerRadius;
      if (isShop !== undefined)        updates.isShop = !!isShop;
      if (bgData)                      updates.bgUrl = await processWorldImage(bgData, 2000);
      else if (bgUrl !== undefined)    updates.bgUrl = bgUrl;
      const door = await storage.updateKcDoor((req.params.id as string), updates);
      return res.json(door);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/kc-doors/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteKcDoor((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── KC Door Decor ─────────────────────────────────────────────────────────────
  app.get("/api/kc-doors/:doorId/decor", isAuthenticated, async (req, res) => {
    try {
      const placements = await storage.getKcDoorDecorPlacements((req.params.doorId as string));
      return res.json(placements);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/kc-doors/:doorId/decor", isAdmin, async (req, res) => {
    try {
      const { name, imageUrl, posX = 45, posY = 45, size = 100 } = req.body;
      if (!name || !imageUrl) return res.status(400).json({ message: "name and imageUrl required" });
      const placement = await storage.createKcDoorDecorPlacement({ doorId: (req.params.doorId as string), name, imageUrl, posX, posY, size });
      return res.json(placement);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/kc-door-decor/:id", isAdmin, async (req, res) => {
    try {
      const { posX, posY, size, flipped } = req.body;
      const placement = await storage.updateKcDoorDecorPlacement((req.params.id as string), { posX, posY, size, flipped });
      return res.json(placement);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/kc-door-decor/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteKcDoorDecorPlacement((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  registerHouseBundleRoutes(app, { db, storage, isAuthenticated, isAdmin, processWorldImage });

  registerHomeDecorRoutes(app, { storage, isAuthenticated, isAdmin, executeDecorPlacement, executeDecorRemoval, processWorldImage });

  registerClientErrorRoutes(app, { isAdmin });

  // ── Gifts ──────────────────────────────────────────────────────────────────
  registerGiftRoutes(app, { storage, isAuthenticated, executeSendGift, executeAcceptGift });

  // ── World Chat ─────────────────────────────────────────────────────────────
  // Base profanity / slur / explicit-sexual word list (all lowercase).
  // Admins can extend this list via /api/admin/chat-filter.
  const BASE_BAD_WORDS = [
    // Profanity
    "fuck","fucking","fucker","fucked","fucks","fuk","fck","f u c k",
    "shit","shitting","shitter","shits","sht",
    "bitch","bitches","bitching","btch",
    "asshole","assholes","ass hole",
    "cunt","cunts",
    "bastard","bastards",
    "motherfucker","motherfuckers","mf",
    "damn","damned",
    "crap",
    "piss","pissed","pisser",
    "arse","arsehole","arseholes",
    "bollocks",
    "twat","twats",
    "wanker","wankers","wank",
    "dick","dicks","dik",
    "cock","cocks",
    "pussy","pussies",
    "whore","whores",
    "slut","sluts",
    // Racist / slurs
    "nigger","niggers","nigga","niggas","nigg",
    "faggot","faggots","fag","fags",
    "retard","retards","retarded",
    "kike","kikes",
    "spic","spics",
    "chink","chinks",
    "wetback","wetbacks",
    "gook","gooks",
    "coon","coons",
    "towelhead","towelheads",
    "raghead","ragheads",
    "beaner","beaners",
    "cracker",
    "honky","honkey",
    "jigaboo",
    "porch monkey",
    "zipperhead",
    "slope",
    "redskin",
    // Explicit sexual
    "cum","cumming","cumshot",
    "jizz","jizzing",
    "blowjob","blowjobs",
    "handjob","handjobs",
    "creampie","creampies",
    "dildo","dildos",
    "anal sex",
    "rape","raping","rapist","raped",
    "molest","molesting","molester","molested",
    "pedophile","pedophilia","pedo",
    "paedophile","paedophilia",
    "cp",
  ];

  const CHAT_COOLDOWN_MS = 8000;
  const CHAT_MAX_LENGTH = 150;

  // Strip only ASCII punctuation / leet-speak substitutions for detection pass.
  // Emojis (Unicode > 127) are intentionally preserved so they are NOT treated
  // as bad-word fragments, and messages consisting purely of emojis still pass.
  function normaliseForCheck(text: string): string {
    return text
      .toLowerCase()
      .replace(/[@!1|]/g, "")          // remove common leet-speak substitution chars
      .replace(/[^a-z0-9\s\u0080-\uFFFF]/g, " ") // keep emoji/unicode, replace ASCII punctuation with space
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildWordRegex(word: string): RegExp {
    // Use word boundaries; for multi-word phrases use a simple includes check instead
    if (word.includes(" ")) return new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return new RegExp(`(?<![a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "i");
  }

  async function containsBadWord(text: string): Promise<boolean> {
    const normalised = normaliseForCheck(text);
    const allWords = [...BASE_BAD_WORDS];
    try {
      const custom = await storage.getChatFilterWords();
      custom.forEach(r => allWords.push(r.word));
    } catch {}
    return allWords.some(w => buildWordRegex(w).test(normalised));
  }

  registerWatcherShoutoutPreferenceRoutes(app, { storage, isAuthenticated });

  app.get("/api/world-chat", isAuthenticated, async (req, res) => {
    try {
      const messages = await storage.getWorldChatMessages();
      return res.json(messages);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });


  // ── Admin: Chat Filter Word Management ──────────────────────────────────────
  app.get("/api/admin/chat-filter", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin && !user.isModerator) return res.status(403).json({ message: "Forbidden" });
      const custom = await storage.getChatFilterWords();
      return res.json({ baseWords: BASE_BAD_WORDS, customWords: custom });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/chat-filter", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin && !user.isModerator) return res.status(403).json({ message: "Forbidden" });
      const { word } = req.body;
      if (!word || typeof word !== "string" || !word.trim()) return res.status(400).json({ message: "Word required" });
      const row = await storage.addChatFilterWord(word.trim(), user.username);
      return res.json(row);
    } catch (err: any) {
      if (err.message?.includes("unique")) return res.status(409).json({ message: "Word already in filter list" });
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/chat-filter/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin && !user.isModerator) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteChatFilterWord(String(req.params.id));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  registerFounderRoutes(app, { storage, isAuthenticated });

  registerVeridianWatcherQuoteRoutes(app, { storage });

  startVeridianWatcherBackgroundJobs({ db, storage, postWatcherMessage });

  // ── Daily Quest API ───────────────────────────────────────────────────────
  registerQuestRoutes(app, { db, isAuthenticated, executeDailyQuestClaim, getCentralDate });

  // World chat cleanup — delete messages older than 5 hours, runs every 30 min
  setInterval(async () => {
    try {
      const result = await db.execute(sql`
        DELETE FROM world_chat_messages
        WHERE created_at < NOW() - INTERVAL '5 hours'
      `);
      const count = (result as any).rowCount ?? 0;
      if (count > 0) console.log(`[WorldChat] Cleaned up ${count} old messages (>5h)`);
    } catch (err) {
      console.error("[WorldChat] Cleanup error:", err);
    }
  }, 30 * 60 * 1000);

  // Stale gift / reward cleanup — if a player hasn't accepted a reward bundle
  // or friend gift in 25 days, drop it so the reward box doesn't pile up with
  // forgotten items. Runs at startup and then every 6 hours.
  const cleanupStaleRewards = async () => {
    try {
      const r1 = await db.execute(sql`
        DELETE FROM user_rewards
        WHERE claimed = false
          AND created_at < NOW() - INTERVAL '25 days'
      `);
      const c1 = (r1 as any).rowCount ?? 0;
      const r2 = await db.execute(sql`
        DELETE FROM gifts
        WHERE status = 'pending'
          AND created_at < NOW() - INTERVAL '25 days'
      `);
      const c2 = (r2 as any).rowCount ?? 0;
      if (c1 > 0 || c2 > 0) {
        console.log(`[RewardCleanup] Removed ${c1} unclaimed reward bundle(s) and ${c2} pending gift(s) older than 25 days.`);
      }
    } catch (err) {
      console.error("[RewardCleanup] Error:", err);
    }
  };
  cleanupStaleRewards();
  setInterval(cleanupStaleRewards, 6 * 60 * 60 * 1000);

  // ── Tutorial: production-backed 3-star starter choices ───────────────────
  app.get("/api/tutorial/starter-pets", isAuthenticated, async (_req: any, res) => {
    try {
      const result = await db.execute(sql`
        SELECT id, name, image_url, egg_image_url, hatched_image_url,
               COALESCE(star_rarity, rarity) AS rarity
        FROM shop_items
        WHERE type = 'pet'
          AND COALESCE(star_rarity, rarity) = 3
          AND egg_image_url IS NOT NULL
          AND hatched_image_url IS NOT NULL
        ORDER BY created_at ASC, name ASC
      `);
      return res.json((result.rows as any[]).map((pet) => ({
        id: String(pet.id),
        name: String(pet.name),
        imageUrl: pet.egg_image_url || pet.image_url,
        eggImageUrl: pet.egg_image_url,
        hatchedImageUrl: pet.hatched_image_url,
        rarity: 3,
      })));
    } catch (err) {
      console.error("[tutorial] starter-pets error:", err);
      return res.status(500).json({ message: "Failed to load starter pets" });
    }
  });

  app.post("/api/tutorial/grant-starter-egg", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    const petId = typeof req.body?.petId === "string" ? req.body.petId.trim() : "";
    if (!petId || Object.keys(req.body ?? {}).some((key) => key !== "petId")) {
      return res.status(400).json({ message: "Choose a valid 3-star starter pet" });
    }
    try {
      const granted = await db.transaction(async (tx) => {
        const playerResult = await tx.execute(sql`
          SELECT COALESCE(tutorial_quest_completed, false) AS completed
          FROM users WHERE id = ${userId} FOR UPDATE
        `);
        const player = playerResult.rows[0] as any;
        if (!player) throw Object.assign(new Error("Player is unavailable"), { status: 404 });
        if (player.completed) throw Object.assign(new Error("Begin Journey is already complete"), { status: 409 });

        const petResult = await tx.execute(sql`
          SELECT id, name
          FROM shop_items
          WHERE id = ${petId}
            AND type = 'pet'
            AND COALESCE(star_rarity, rarity) = 3
            AND egg_image_url IS NOT NULL
            AND hatched_image_url IS NOT NULL
          FOR SHARE
        `);
        const pet = petResult.rows[0] as any;
        if (!pet) throw Object.assign(new Error("That 3-star starter pet is no longer available"), { status: 409 });

        // Idempotently reuse this exact unhatched starter choice. Do not return
        // an unrelated owned pet: that was the source of the client/server loop.
        const ownedResult = await tx.execute(sql`
          SELECT ui.id
          FROM user_inventory ui
          WHERE ui.user_id = ${userId}
            AND ui.shop_item_id = ${petId}
            AND COALESCE(ui.is_hatched, false) = false
            AND COALESCE(ui.is_listed, false) = false
          ORDER BY ui.acquired_at ASC
          LIMIT 1
          FOR UPDATE OF ui
        `);
        if (ownedResult.rows[0]) {
          return {
            granted: false,
            inventoryId: String((ownedResult.rows[0] as any).id),
            petId: String(pet.id),
            itemName: String(pet.name),
          };
        }

        const inventoryResult = await tx.execute(sql`
          INSERT INTO user_inventory (user_id, shop_item_id, quantity, hatch_started_at)
          VALUES (${userId}, ${petId}, 1, NOW())
          RETURNING id
        `);
        return {
          granted: true,
          inventoryId: String((inventoryResult.rows[0] as any).id),
          petId: String(pet.id),
          itemName: String(pet.name),
        };
      });
      return res.json(granted);
    } catch (err: any) {
      const status = Number(err?.status) || 500;
      if (status >= 500) console.error("[tutorial] grant-starter-egg error:", err);
      return res.status(status).json({ message: status >= 500 ? "Failed to grant starter pet" : err.message });
    }
  });

  // ── Tutorial: grant 3 free Small Hatching Potions (one-time) ────────────────
  app.post("/api/tutorial/grant-hatch-potions", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      requireEmptyTutorialBody(req.body);
      const result = await grantTutorialHatchPotions(userId);
      return res.json({
        granted: result.status === "granted",
        alreadyGranted: result.alreadyGranted,
        grantedQuantity: result.grantedQuantity,
        potionGrantStatus: result.status,
        status: result.status,
      });
    } catch (err) {
      return sendTutorialError(res, err, "grant-hatch-potions");
    }
  });

  registerMixingTreeRecipeRoutes(app, { db, isAuthenticated, isAdmin });

  // ── Tutorial: mark quest completed (no coins yet — player claims from quest log) ─
  app.post("/api/tutorial/complete", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      requireEmptyTutorialBody(req.body);
      const result = await completeTutorial(userId);
      return res.json({
        ok: true,
        status: result.status,
        tutorialCompleted: result.tutorialCompleted,
        alreadyCompleted: result.alreadyCompleted,
      });
    } catch (err) {
      return sendTutorialError(res, err, "complete");
    }
  });

  // ── Cave: per-pet progress ─────────────────────────────────────────────────
  app.get("/api/cave/progress/:petInventoryId", isAuthenticated, async (req: any, res) => {
    try {
      const { petInventoryId } = req.params;
      const progress = await storage.getPetCaveProgress(petInventoryId);
      if (!progress) {
        return res.json({ currentTier: 1, completedTiers: [] });
      }
      return res.json(progress);
    } catch (err) {
      console.error("[cave] progress error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  app.post("/api/cave/complete-tier", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user!;
      const { petInventoryId, tier } = req.body as { petInventoryId: string; tier: number };
      if (!petInventoryId || !Number.isInteger(tier) || tier < 1 || tier > 10) {
        return res.status(400).json({ message: "Invalid tier" });
      }
      // Verify the pet belongs to the user
      const inventory = await storage.getUserInventory(user.id);
      const pet = inventory.find((inv: any) => inv.id === petInventoryId);
      if (!pet) {
        return res.status(403).json({ message: "Pet not found" });
      }
      const progress = await storage.completePetCaveTier(petInventoryId, tier);
      // A tier-clear bonus is awarded once. The serialized progress update makes
      // retries and double clicks idempotent instead of duplicating rewards.
      const bonusCoins = progress.newlyCompleted ? tier * 100 : 0;
      const updatedUser = bonusCoins > 0 ? await storage.addCoins(user.id, bonusCoins) : user;
      return res.json({ ...progress, bonusCoins, newBalance: updatedUser.coins });
    } catch (err) {
      if (err instanceof CaveTierLockedError) {
        return res.status(409).json({ message: err.message });
      }
      console.error("[cave] complete-tier error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  });

  // ── Tutorial: claim completion reward (1500 coins, one-time) ────────────────
  app.post("/api/tutorial/claim-reward", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      requireEmptyTutorialBody(req.body);
      const result = await claimTutorialReward(userId);
      return res.json({
        alreadyClaimed: result.status === "already_claimed",
        coins: result.coins,
        newBalance: result.coinBalance,
        status: result.status,
      });
    } catch (err) {
      return sendTutorialError(res, err, "claim-reward");
    }
  });

  // Pre-warm the Stripe price cache in the background so the first checkout
  // request after server boot doesn't pay the cost of a slow prices.list call.
  (async () => {
    try {
      const stripe = await getUncachableStripeClient();
      await Promise.all(COIN_PACKS.map(p => getOrCreateStripePrice(stripe, p).catch(() => null)));
      console.log(`[Stripe] Pre-warmed price cache for ${Object.keys(stripePriceCache).length} coin packs`);
    } catch (err) {
      // Stripe may not be configured in dev; ignore
    }
  })();

  return httpServer;
}
