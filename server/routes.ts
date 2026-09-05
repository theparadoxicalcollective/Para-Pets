Warning: truncated output (original token count: 98799)
Total output lines: 8693

import { resolvePetArtwork } from "./petArtwork";
import { raidBossSelectionSchema, saveRaidBoss } from "./raidBossAdmin";
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
import { insertUserSchema, updateUsernameSchema, insertShopItemSchema, rewardBundles, rewardBundleItems, userRewards, userInventory, houseBundles as houseBundlesTable, userHouseBundles as userHouseBundlesTable, users as usersTable, coinPurchases, deletedAccounts, petAnimationProfileSchema, petEquippedAccessories } from "@shared/schema";
import { executeRewardClaim } from "./rewardClaim";
import { executeDailyQuestClaim } from "./dailyQuestClaim";
import { registerQuestRoutes } from "./routes/quest.routes";
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
import { invalidTutorialRequest, TutorialError } from "./tutorial/errors";
import { CaveTierLockedError, isCaveTierAccessible } from "./caveProgress";
import { executeAcceptGift, executeSendGift } from "./gifts/transactions";
import { executeDecorPlacement, executeDecorRemoval } from "./housing/decorTransactions";
import { registerGiftRoutes } from "./routes/gift.routes";
import { registerHomeDecorRoutes } from "./routes/homeDecor.routes";
import { registerElysianClearingCombatRoutes } from "./routes/elysianClearingCombat.routes";
import { registerClearingEquipmentRoutes } from "./routes/clearingEquipment.routes";
import { registerClearingAdminRoutes } from "./routes/clearingAdmin.routes";
import { registerClearingShopRoutes } from "./routes/clearingShop.routes";
import { registerSoulExchangeRoutes } from "./routes/soulExchange.routes";
import { registerCostumeAdminRoutes } from "./routes/costumeAdmin.routes";
import { registerCostumePlayerRoutes } from "./routes/costumePlayer.routes";
import { registerMiniPetRoutes } from "./routes/miniPet.routes";
import { registerCardAdminRoutes } from "./routes/cardAdmin.routes";
import { registerCardCollectionRoutes } from "./routes/cardCollection.routes";
import { grantBundleCards, parseBundleCards } from "./cards";
import { getEffectivePetLayer } from "@shared/petLayer";

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



// ── In-memory client error log (max 100 entries; resets on server restart) ────
interface ClientErrorEntry {
  id: number;
  type: "crash" | "unhandled" | "error";
  msg: string;
  source: string;
  url: string;
  ua: string;
  ts: string;
  userId?: string;
}
let _ceSeq = 0;
const _clientErrorLog: ClientErrorEntry[] = [];
const CE_MAX = 100;
function pushClientError(entry: Omit<ClientErrorEntry, "id" | "ts">): void {
  _ceSeq++;
  _clientErrorLog.unshift({ ...entry, id: _ceSeq, ts: new Date().toISOString() });
  if (_clientErrorLog.length > CE_MAX) _clientErrorLog.pop();
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


  // ── Public: check maintenance mode ───────────────────────────────────────
  // In-memory cache so every client poll doesn't hit Railway Postgres.
  // Maintenance mode rarely changes, so 60s staleness is fine.
  let _maintenanceCache: { value: boolean; at: number } | null = null;
  app.get("/api/maintenance-status", async (_req, res) => {
    try {
      const now = Date.now();
      if (_maintenanceCache && now - _maintenanceCache.at < 60_000) {
        return res.json({ maintenance: _maintenanceCache.value });
      }
      const val = await storage.getGameSetting("maintenance_mode");
      _maintenanceCache = { value: val === "true", at: now };
      return res.json({ maintenance: _maintenanceCache.value });
    } catch {
      return res.json({ maintenance: false });
    }
  });

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

  // ── Admin: toggle maintenance mode ────────────────────────────────────────
  app.post("/api/admin/maintenance", isAdmin, async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      await storage.setGameSetting("maintenance_mode", enabled ? "true" : "false");
      _maintenanceCache = null;
      return res.json({ maintenance: enabled });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Public: check raid visibility ─────────────────────────────────────────
  let _raidCache: { value: boolean; at: number } | null = null;
  app.get("/api/raid-status", async (_req, res) => {
    try {
      const now = Date.now();
      if (_raidCache && now - _raidCache.at < 60_000) {
        return res.json({ raidVisible: _raidCache.value });
      }
      const val = await storage.getGameSetting("raid_visible");
      _raidCache = { value: val === "true", at: now };
      return res.json({ raidVisible: _raidCache.value });
    } catch {
      return res.json({ raidVisible: false });
    }
  });

  // ── Admin: toggle raid visibility ──────────────────────────────────────────
  app.post("/api/admin/raid-toggle", isAdmin, async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      await storage.setGameSetting("raid_visible", enabled ? "true" : "false");
      _raidCache = { value: enabled, at: Date.now() };
      return res.json({ raidVisible: enabled });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Public: get raid boss info ─────────────────────────────────────────────
  let _raidBossVersion = 0;
  let _raidBossCache: { templateId: string | null; rarity: number | null; name: string | null; hp: number; maxHp: number; at: number } | null = null;

  app.get("/api/raid-boss", async (_req, res) => {
    try {
      const version = _raidBossVersion;
      const now = Date.now();
      if (_raidBossCache && now - _raidBossCache.at < 5_000) {
        return res.json({ templateId: _raidBossCache.templateId, rarity: _raidBossCache.rarity, name: _raidBossCache.name, hp: _raidBossCache.hp, maxHp: _raidBossCache.maxHp });
      }
      const templateId = await storage.getGameSetting("raid_boss_template_id");
      if (!templateId) {
        if (version === _raidBossVersion) _raidBossCache = { templateId: null, rarity: null, name: null, hp: 0, maxHp: 0, at: now };
        return res.json({ templateId: null, rarity: null, name: null, hp: 0, maxHp: 0 });
      }
      const [template, hpStr, maxHpStr, shopRow] = await Promise.all([
        storage.getPetTemplate(templateId),
        storage.getGameSetting("raid_boss_hp"),
        storage.getGameSetting("raid_boss_max_hp"),
        db.execute(sql`SELECT rarity FROM shop_items WHERE pet_template_id = ${templateId} AND type = 'pet' LIMIT 1`),
      ]);
      const maxHp = maxHpStr ? parseInt(maxHpStr, 10) : 10000;
      const hp = hpStr ? parseInt(hpStr, 10) : maxHp;
      const rarity: number | null = (shopRow.rows[0]?.rarity as number | null) ?? null;
      const result = { templateId, rarity, name: template?.name ?? null, hp, maxHp };
      if (version === _raidBossVersion) _raidBossCache = { ...result, at: now };
      return res.json(result);
    } catch {
      return res.json({ templateId: null, rarity: null, name: null, hp: 0, maxHp: 0 });
    }
  });

  // ── Public: raid leaderboard ──────────────────────────────────────────────
  app.get("/api/raid/leaderboard", async (_req, res) => {
    try {
      const rows: any = await db.execute(sql`
        SELECT u.id AS "userId", u.username,
               u.profile_image AS "profileImage",
               COALESCE(u.raid_total_damage, 0) AS "totalDamage"
        FROM users u
        WHERE COALESCE(u.raid_total_damage, 0) > 0
          AND (u.is_admin IS NULL OR u.is_admin = false)
        ORDER BY COALESCE(u.raid_total_damage, 0) DESC
        LIMIT 10000
      `);
      return res.json({ top: rows.rows ?? rows });
    } catch (err) {
      console.error("Raid leaderboard error:", err);
      return res.json({ top: [] });
    }
  });

  // ── Raid: reward tier config ──────────────────────────────────────────────
  const DEFAULT_RAID_TIERS = [
    { key: "t1",  label: "Champion",   rankFrom: 1,   rankTo: 3,    coins: 0, items: [] },
    { key: "t2",  label: "Hero",       rankFrom: 4,   rankTo: 10,   coins: 0, items: [] },
    { key: "t3",  label: "Elite",      rankFrom: 11,  rankTo: 25,   coins: 0, items: [] },
    { key: "t4",  label: "Veteran",    rankFrom: 26,  rankTo: 50,   coins: 0, items: [] },
    { key: "t5",  label: "Warrior",    rankFrom: 51,  rankTo: 100,  coins: 0, items: [] },
    { key: "t6",  label: "Adventurer", rankFrom: 101, rankTo: 500,  coins: 0, items: [] },
    { key: "t7",  label: "Participant",rankFrom: 1000,rankTo: null, coins: 0, items: [] },
  ];

  app.get("/api/raid/rewards", async (_req, res) => {
    try {
      const raw = await storage.getGameSetting("raid_rewards");
      if (!raw) return res.json({ tiers: DEFAULT_RAID_TIERS });
      return res.json(JSON.parse(raw));
    } catch (err) {
      return res.json({ tiers: DEFAULT_RAID_TIERS });
    }
  });

  app.post("/api/admin/raid-rewards", isAdmin, async (req, res) => {
    try {
      const { tiers } = req.body;
      if (!Array.isArray(tiers)) return res.status(400).json({ message: "Invalid tiers" });
      await storage.setGameSetting("raid_rewards", JSON.stringify({ tiers }));
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Raid: consume 1 ticket and start a battle session ─────────────────────
  const RAID_TICKET_ITEM_ID = "a1b2c3d4-9002-4000-8000-000000000099";

  app.post("/api/raid/start-battle", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ message: "Not logged in" });

      // ── 1. Verify the raid boss is alive before spending a ticket ──────────
      const bossRow: any = await db.execute(sql`
        SELECT value::INTEGER AS hp FROM game_settings WHERE key = 'raid_boss_hp'
      `);
      const bossHp = ((bossRow.rows ?? bossRow)[0]?.hp ?? 0) as number;
      if (bossHp <= 0) {
        return res.status(400).json({ message: "The Raid Boss has already been defeated!" });
      }

      // ── 2. Verify the boss template is actually set ────────────────────────
      const bossTemplateRow: any = await db.execute(sql`
        SELECT value FROM game_settings WHERE key = 'raid_boss_template_id'
      `);
      const bossTemplateId = (bossTemplateRow.rows ?? bossTemplateRow)[0]?.value as string | null;
      if (!bossTemplateId) {
        return res.status(400).json({ message: "No Raid Boss is active right now." });
      }

      // ── 3. Also fetch maxHp so the battle page can build the HP bar correctly
      const maxHpRow: any = await db.execute(sql`
        SELECT value::INTEGER AS max_hp FROM game_settings WHERE key = 'raid_boss_max_hp'
      `);
      const bossMaxHp = ((maxHpRow.rows ?? maxHpRow)[0]?.max_hp ?? bossHp) as number;

      // ── 4. Deduct 1 ticket atomically — targets a single row by id ──────────
      const result: any = await db.execute(sql`
        UPDATE user_inventory
        SET quantity = quantity - 1
        WHERE id = (
          SELECT id FROM user_inventory
          WHERE user_id = ${userId}
            AND shop_item_id = ${RAID_TICKET_ITEM_ID}
            AND quantity > 0
          ORDER BY id
          LIMIT 1
        )
        RETURNING quantity
      `);
      const rows = result.rows ?? result;
      if (!rows.length) {
        return res.status(400).json({ message: "No raid tickets remaining" });
      }
      const remaining = rows[0].quantity as number;

      // Bust the server-side cache so the next GET /api/raid-boss reflects real HP
      _raidBossVersion++;
      _raidBossCache = null;

      return res.json({ success: true, remaining, bossHp, bossMaxHp });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/raid/deal-damage", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ message: "Not logged in" });

      const { damage } = req.body as { damage: number };
      if (typeof damage !== "number" || damage <= 0 || damage > 50_000_000) {
        return res.status(400).json({ message: "Invalid damage value" });
      }
      const dmg = Math.round(damage);

      // Atomic deduct: PostgreSQL UPDATE returns the new value in a single
      // operation so two players hitting this at the same time can never
      // apply duplicate deductions. GREATEST(0, ...) with INTEGER args
      // ensures HP never goes below 0 (text GREATEST was unreliable when
      // the damage overshot the remaining HP and produced a negative string).
      const result: any = await db.execute(sql`
        UPDATE game_settings
        SET value = GREATEST(0, value::INTEGER - ${dmg})::TEXT
        WHERE key = 'raid_boss_hp'
        RETURNING GREATEST(0, value::INTEGER - ${dmg}) AS hp
      `);
      const newHp = Number((result.rows ?? result)[0]?.hp ?? 0);

      // Invalidate the in-process cache so the next GET /api/raid-boss
      // returns the fresh HP from the DB rather than the stale cached value.
      _raidBossVersion++;
      _raidBossCache = null;

      // Accumulate this player's contribution on their user row
      await db.execute(sql`
        UPDATE users
        SET raid_total_damage = COALESCE(raid_total_damage, 0) + ${dmg}
        WHERE id = ${userId}
      `);

      // ── Boss just died → distribute rewards (fire-and-forget, deduped) ──────
      // Use <= 0 so an overkill hit (where the DB value somehow slips negative)
      // still triggers distribution.
      if (newHp <= 0) {
        (async () => {
          try {
            // 1. Find out which boss was just killed
            const bossRow: any = await db.execute(sql`
              SELECT value FROM game_settings WHERE key = 'raid_boss_template_id'
            `);
            const bossId = ((bossRow.rows ?? bossRow)[0]?.value ?? "") as string;
            if (!bossId) return;

            // 2. Atomic dedup — one shared lock key per boss regardless of template
            // reuse. We UPDATE (not INSERT) so this survives across raids: if the
            // row already holds a timestamp from a previous kill, the UPDATE only
            // succeeds for the first concurrent caller because PostgreSQL serialises
            // row-level locks. We compare against a sentinel that is reset when the
            // admin starts a new raid (via /api/admin/raid-boss-hp).
            const lockKey = "raid_defeat_lock_current";
            const defeatedAt = new Date().toISOString();
            const lockResult: any = await db.execute(sql`
              INSERT INTO game_settings (key, value)
              VALUES (${lockKey}, ${defeatedAt})
              ON CONFLICT (key) DO UPDATE
                SET value = ${defeatedAt}
                WHERE game_settings.value = 'pending'
            `);
            const gotLock = ((lockResult.rowCount ?? lockResult.count ?? 0) as number) > 0;
            if (!gotLock) return; // another concurrent request already handling this

            // 3. Load reward tier config
            const rewardRaw = await storage.getGameSetting("raid_rewards");
            if (!rewardRaw) { console.log("[Raid] Boss defeated but no reward config set — skipping gifts"); return; }
            const { tiers } = JSON.parse(rewardRaw) as {
              tiers: Array<{
                key: string; label: string; rankFrom: number; rankTo: number | null;
                coins: number; items: Array<{ shopItemId: string; name: string; imageUrl: string | null }>;
              }>;
            };

            // 4. Leaderboard snapshot at time of kill
            const lb: any = await db.execute(sql`
              SELECT id
              FROM users
              WHERE COALESCE(raid_total_damage, 0) > 0
                AND (is_admin IS NULL OR is_admin = false)
              ORDER BY COALESCE(raid_total_damage, 0) DESC
            `);
            const players = (lb.rows ?? lb) as Array<{ id: string }>;
            if (!players.length) return;

            let gifted = 0;

            for (let i = 0; i < players.length; i++) {
              const rank = i + 1;
              const playerId = players[i].id;

              const tier = tiers.find(t =>
                rank >= t.rankFrom && (t.rankTo === null || rank <= t.rankTo)
              );
              if (!tier) continue;
              if (tier.coins === 0 && tier.items.length === 0) continue;

              const bundleName = `Raid Boss Defeated - ${tier.label} Tier`;
              const bundleMsg  = `Congratulations! You ranked #${rank} and earned ${tier.label} rewards.`;

              // Create one reward bundle per player then link them via user_reward
              const bundle = await storage.createRewardBundle(bundleName, tier.coins, bundleMsg);
              for (const item of tier.items) {
                await storage.addRewardBundleItem(bundle.id, item.shopItemId);
              }
              await storage.createUserReward(playerId, bundle.id);
              gifted++;
            }

            console.log(`[Raid] Rewards distributed to ${gifted} players for boss ${bossId}`);
          } catch (err) {
            console.error("[Raid] Reward distribution error:", err);
          }
        })();
      }

      return res.json({ newBossHp: newHp, damageDealt: dmg });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: set raid boss ───────────────────────────────────────────────────
  // Attack damage rules (fixed game constants):
  //   normal attack = 20% of target pet's current HP
  //   large  attack = 30% of target pet's current HP

  app.post("/api/admin/raid-boss", isAdmin, async (req, res) => {
    try {
      const parsed = raidBossSelectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
      await saveRaidBoss(db, parsed.data);
      _raidBossVersion++;
      _raidBossCache = null;
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(err.status === 404 ? 404 : 500).json({ message: err.status === 404 ? err.message : "Could not save raid boss. Please try again." });
    }
  });

  // ── Admin: set raid boss HP ────────────────────────────────────────────────
  app.post("/api/admin/raid-boss-hp", isAdmin, async (req, res) => {
    try {
      const { hp, maxHp } = req.body as { hp?: number; maxHp?: number };
      if (maxHp !== undefined) await storage.setGameSetting("raid_boss_max_hp", String(maxHp));
      if (hp !== undefined) await storage.setGameSetting("raid_boss_hp", String(hp));

      // Reset defeat lock to 'pending' so the next kill can distribute rewards,
      // and zero out per-player damage so the leaderboard is per-raid (not cumulative).
      await db.execute(sql`
        INSERT INTO game_settings (key, value) VALUES ('raid_defeat_lock_current', 'pending')
        ON CONFLICT (key) DO UPDATE SET value = 'pending'
      `);
      await db.execute(sql`UPDATE users SET raid_total_damage = 0 WHERE COALESCE(raid_total_damage, 0) > 0`);

      _raidBossVersion++;
      _raidBossCache = null;
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: manually distribute raid rewards (for recovery when auto-distribution failed) ──
  app.post("/api/admin/raid-distribute-rewards", isAdmin, async (req, res) => {
    try {
      const rewardRaw = await storage.getGameSetting("raid_rewards");
      if (!rewardRaw) return res.status(400).json({ message: "No raid_rewards config set" });
      const { tiers } = JSON.parse(rewardRaw) as {
        tiers: Array<{
          key: string; label: string; rankFrom: number; rankTo: number | null;
          coins: number; items: Array<{ shopItemId: string; name: string; imageUrl: string | null }>;
        }>;
      };

      const lb: any = await db.execute(sql`
        SELECT id FROM users
        WHERE COALESCE(raid_total_damage, 0) > 0
          AND (is_admin IS NULL OR is_admin = false)
        ORDER BY COALESCE(raid_total_damage, 0) DESC
      `);
      const players = (lb.rows ?? lb) as Array<{ id: string }>;
      if (!players.length) return res.status(400).json({ message: "No players on leaderboard" });

      let gifted = 0;

      for (let i = 0; i < players.length; i++) {
        const rank = i + 1;
        const playerId = players[i].id;
        const tier = tiers.find(t => rank >= t.rankFrom && (t.rankTo === null || rank <= t.rankTo));
        if (!tier) continue;
        if (tier.coins === 0 && tier.items.length === 0) continue;

        const bundleName = `Raid Boss Defeated - ${tier.label} Tier`;
        const bundleMsg  = `Congratulations! You ranked #${rank} and earned ${tier.label} rewards.`;

        const bundle = await storage.createRewardBundle(bundleName, tier.coins, bundleMsg);
        for (const item of tier.items) {
          await storage.addRewardBundleItem(bundle.id, item.shopItemId);
        }
        await storage.createUserReward(playerId, bundle.id);
        gifted++;
      }

      console.log(`[Raid] Manual reward distribution: ${gifted} players rewarded`);
      return res.json({ success: true, gifted });
    } catch (err: any) {
      console.error("[Raid] Manual distribution error:", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: list all templates (id + name + rarity) for pickers ─────────────
  app.get("/api/admin/templates-list", isAdmin, async (_req, res) => {
    try {
      const templates = await storage.getAllPetTemplates();
      // pet_templates has no rarity column — rarity lives on shop_items.
      // Return placeholder 1; the raid-boss GET reads rarity from shop_items directly.
      return res.json(templates.map(t => ({ id: t.id, name: t.name, rarity: 1 })));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Raid icon position on the world map ────────────────────────────────────
  app.get("/api/raid-icon-position", async (_req, res) => {
    try {
      const raw = await storage.getGameSetting("admin_pos_raid_icon");
      if (raw) {
        const parsed = JSON.parse(raw);
        return res.json({ posX: parsed.posX ?? 48, posY: parsed.posY ?? 5 });
      }
      return res.json({ posX: 48, posY: 5 });
    } catch {
      return res.json({ posX: 48, posY: 5 });
    }
  });

  app.patch("/api/admin/raid-icon-position", isAdmin, async (req, res) => {
    try {
      const { posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number") {
        return res.status(400).json({ message: "posX and posY are required numbers" });
      }
      const clamped = { posX: Math.max(-10, Math.min(110, Math.round(posX))), posY: Math.max(-10, Math.min(110, Math.round(posY))) };
      await storage.setGameSetting("admin_pos_raid_icon", JSON.stringify(clamped));
      return res.json(clamped);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });


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

  // Public pet list for visiting another player's pet house
  app.get("/api/users/:userId/pets", isAuthenticated, async (req, res) => {
    try {
      const targetUser = await storage.getUser((req.params.userId as string));
      if (!targetUser || targetUser.isBanned) {
        return res.status(404).json({ message: "User not found" });
      }

      const [inventoryRows, savedPositions] = await Promise.all([
        storage.getUserInventoryWithItems(targetUser.id),
        storage.getPetHousePositions(targetUser.id),
      ]);
      const posMap = new Map(savedPositions.map(p => [p.inventoryId, { posLeft: p.posLeft, posTop: p.posTop, location: p.location }]));

      const hatchedPets = inventoryRows
        .filter(r => r.inventory.isHatched && r.shopItem?.type === "pet")
        .map(r => {
          const pos = posMap.get(r.inventory.id);
          return {
            inventoryId: r.inventory.id,
            shopItemId: r.shopItem!.id,
            name: r.shopItem!.name,
            nickname: r.inventory.petNickname,
            imageUrl: r.shopItem!.imageUrl,
            hatchedImageUrl: r.shopItem!.hatchedImageUrl,
            eggImageUrl: r.shopItem!.eggImageUrl,
            rarity: r.shopItem!.rarity,
            petLevel: r.inventory.petLevel,
            petHealth: r.inventory.petHealth,
            petAtk: r.inventory.petAtk,
            petDef: r.inventory.petDef,
            petTemplateId: r.shopItem!.petTemplateId || null,
            posLeft: pos?.posLeft ?? null,
            posTop: pos?.posTop ?? null,
            location: pos?.location ?? null,
          };
        });

      return res.json({ username: targetUser.username, pets: hatchedPets });
    } catch (err) {
      console.error("Get user pets error:", err);
      return res.status(500).json({ message: "Failed to get pets" });
    }
  });

  // ── Pet house positions ─────────────────────────────────────────────────────
  app.get("/api/pet-house-positions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const positions = await storage.getPetHousePositions(user.id);
      return res.json(positions);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get positions" });
    }
  });

  app.patch("/api/pet-house-positions/:inventoryId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const { posLeft, posTop, location } = req.body;
      if (typeof posLeft !== "string" || typeof posTop !== "string") {
        return res.status(400).json({ message: "posLeft and posTop are required strings" });
      }
      await storage.upsertPetHousePosition(user.id, inventoryId, posLeft, posTop, location ?? "outside");
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to save position" });
    }
  });

  app.delete("/api/pet-house-positions/all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteAllPetHousePositions(user.id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to store all pets" });
    }
  });

  app.delete("/api/pet-house-positions/:inventoryId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      await storage.deletePetHousePosition(user.id, inventoryId);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to remove pet position" });
    }
  });

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
        type: shopItem?.type || "item",
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

  app.po…48799 tokens truncated…ve it from the opponent's *saved* battle group
      // (highest pet level on their roster) and only fall back to the
      // client value as a sanity-capped backup. Clamped to [1, 50].
      let lvl = 1;
      if (opponentUserId && opponentUserId !== user.id) {
        try {
          const oppGroupForLvl = await storage.getBattleGroup(String(opponentUserId));
          const oppPetIds: string[] = oppGroupForLvl?.petInventoryIds ?? [];
          if (oppPetIds.length) {
            const oppInv = await storage.getUserInventory(String(opponentUserId));
            const lvls = oppInv
              .filter((it: any) => oppPetIds.includes(it.id))
              .map((it: any) => it.petLevel ?? 1);
            if (lvls.length) lvl = Math.max(...lvls);
          }
        } catch {
          // ignore — fall back to client value below
        }
      }
      if (lvl <= 1) lvl = Math.max(1, Math.min(50, Number(opponentLevel) || 1));
      lvl = Math.max(1, Math.min(50, lvl));
      const WIN_COINS = 15 + Math.floor(lvl * 2);

      // ── Difficulty → BP table ───────────────────────────────────
      // Winners earn BP based on how tough their opponent was, computed
      // server-side from the saved attack-power totals so a client can't
      // claim "hard" for an "easy" fight.
      //
      //   easy     (player ≥ ~1.25× opponent power) → +4
      //   balanced (anywhere in between)            → +9
      //   hard     (player ≤ ~0.80× opponent power) → +12
      //
      // Losers get 0 BP (no negative scoring). The opponent who *won by
      // default* (because the attacker lost) gets a flat +5 BP credited
      // to their own ledger via a synthetic pvp_battles row, so the
      // leaderboard reflects passive defensive wins too.
      let difficulty: "easy" | "balanced" | "hard" = "balanced";
      try {
        const myGroup = await storage.getBattleGroup(user.id);
        const myPower = myGroup?.attackPower ?? 0;
        const oppGroup = opponentUserId ? await storage.getBattleGroup(String(opponentUserId)) : null;
        const oppPower = oppGroup?.attackPower ?? 0;
        if (oppPower > 0 && myPower > 0) {
          if (myPower >= oppPower * 1.25) difficulty = "easy";
          else if (myPower <= oppPower * 0.8) difficulty = "hard";
          else difficulty = "balanced";
        }
      } catch {
        // fall through with "balanced" — safe default
      }
      const winBp = difficulty === "easy" ? 4 : difficulty === "hard" ? 12 : 9;

      // Coin rewards have been removed from PvP — battle points are now
      // the sole win currency. We still compute WIN_COINS above so the
      // existing pvp_battles row schema stays satisfied and any analytics
      // that referenced opponentLevel-driven payouts keep working, but we
      // explicitly zero out the actual coin grant here.
      void WIN_COINS;
      const coinsEarned = 0;
      const battlePointsDelta = result === "win" ? winBp : 0;

      // Credit the defender +5 BP if the attacker lost. This is a synthetic
      // pvp_battles row attributed to the opponent so it shows up on the
      // leaderboard the same way as any other win. We deliberately do NOT
      // grant coins or trigger mood penalties on this side — it's a passive
      // defensive credit.
      //
      // Authz/integrity: refuse to credit the *attacker* themselves (self-BP
      // farm) and require the opponent to be a real user with a saved
      // battle group. Without this, a modified client could submit
      // {result:"loss", opponentUserId:<self>} per ticket to net +5 BP.
      if (result === "loss" && opponentUserId && String(opponentUserId) !== String(user.id)) {
        try {
          const oppUser = await storage.getUser(String(opponentUserId));
          const oppGrp = await storage.getBattleGroup(String(opponentUserId));
          if (oppUser && oppGrp && (oppGrp.petInventoryIds?.length ?? 0) > 0) {
            await storage.createPvpBattle({
              userId: String(opponentUserId),
              opponentName: user.username || "Challenger",
              opponentImageUrl: null,
              opponentLevel: lvl,
              opponentSkill: null,
              result: "win",
              coinsEarned: 0,
              battlePointsDelta: 5,
            });
          }
        } catch (e) {
          console.warn("PvP defender BP credit failed:", e);
        }
      }

      // PvP loss → bruise the active pet's mood (drops mood by 12, caps it
      // at BATTLE_DEFEAT_MOOD_CAP for the next BATTLE_DEFEAT_RECENT_MINUTES
      // via applyPetTimeDecay).
      if (result === "loss") {
        try {
          const fullUser = await storage.getUser(user.id);
          const activeId = fullUser?.activePetId;
          if (activeId) {
            const activePet = await storage.getInventoryItemById(activeId);
            if (activePet && activePet.userId === user.id) {
              const newMood = Math.max(0, (activePet.petMood ?? 100) - 3);
              await storage.updateInventoryItem(activeId, {
                petMood: newMood,
                lastBattleDefeatAt: new Date(),
                petStatsUpdatedAt: new Date(),
              } as any);
            }
          }
        } catch (e) {
          console.warn("PvP loss mood penalty failed:", e);
        }
      }

      const battle = await storage.createPvpBattle({
        userId: user.id,
        opponentName,
        opponentImageUrl: opponentImageUrl || null,
        opponentLevel: lvl,
        opponentSkill: opponentSkill || null,
        result,
        coinsEarned,
        battlePointsDelta,
      });

      // Award brawler badges on PvP wins (fire-and-forget — never block the response)
      if (result === "win") {
        storage.countPvpWins(user.id)
          .then((totalWins) => maybeAwardBrawlerBadges(user.id, totalWins))
          .catch(() => {});
      }

      return res.json({ battle, coinsEarned, battlePointsDelta });
    } catch (err) {
      console.error("PvP result error:", err);
      return res.status(500).json({ message: "Failed to record result" });
    }
  });

  // Spend one PvP ticket and "lock in" a battle attempt. Called by the
  // client right before launching the battle screen so we charge the player
  // win or lose. Returns 402 if the player has no tickets so the client can
  // show a friendly "out of tickets" message.
  app.post("/api/pvp/start", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      // Atomic spend-ticket + issue-token. If anything inside the
      // transaction fails (e.g. battle-token table missing on a fresh
      // deploy), the whole thing rolls back so the player keeps their
      // ticket. This is the bug we hit when the player saw "couldn't
      // start the match" but the ticket was still consumed.
      const result = await storage.startPvpBattleAtomic(user.id);
      if (!result.ok) {
        return res.status(402).json({ message: "No PvP tickets", ticketsRemaining: 0 });
      }
      return res.json({ ticketsRemaining: result.ticketsRemaining, battleToken: result.token });
    } catch (err) {
      console.error("PvP start error:", err);
      return res.status(500).json({ message: "Failed to start battle" });
    }
  });

  // Current player's PvP ticket count (sum of inventory stacks).
  app.get("/api/pvp/tickets", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const count = await storage.getPvpTicketCount(user.id);
      return res.json({ count });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  // ── PvP Ticket Shop ──────────────────────────────────────────────────
  // Buy PvP tickets in bundles using in-game coins. The price map is
  // server-authoritative so the client cannot fake a cheaper bundle by
  // posting a different price. Coins are deducted atomically (same
  // pattern as the regular shop buy endpoint) so a race with another
  // request can never overdraw the player's balance.
  const PVP_TICKET_BUNDLES: Record<string, { tickets: number; cost: number }> = {
    "1":  { tickets: 1,  cost: 50 },
    "3":  { tickets: 3,  cost: 250 },
    "6":  { tickets: 6,  cost: 500 },
    "15": { tickets: 15, cost: 1250 },
  };

  app.get("/api/pvp/tickets/bundles", isAuthenticated, async (_req: Request, res: Response) => {
    return res.json({
      bundles: Object.entries(PVP_TICKET_BUNDLES).map(([id, b]) => ({ id, tickets: b.tickets, cost: b.cost })),
    });
  });

  app.post("/api/pvp/tickets/buy", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const bundleId = String(req.body?.bundleId ?? "");
      const bundle = PVP_TICKET_BUNDLES[bundleId];
      if (!bundle) {
        return res.status(400).json({ message: "Invalid bundle" });
      }

      // PvP ticket shop item UUID, seeded in server/index.ts.
      // Resolved by id (rather than scanning a world's items) so the
      // lookup is a single index hit and stays correct even if the
      // ticket is later moved between worlds.
      const PVP_TICKET_ID = "a1b2c3d4-9001-4000-8000-000000000099";
      const ticketItem = await storage.getShopItem(PVP_TICKET_ID);
      if (!ticketItem || ticketItem.specialType !== "pvp_ticket") {
        return res.status(500).json({ message: "Ticket item not configured" });
      }

      // Single transactional call: deducts coins AND credits tickets in
      // one DB transaction with a SQL-side atomic increment, so the
      // player can never be charged without receiving the tickets and
      // two concurrent purchases can never lose-update each other's
      // ticket increment. Returns null only if the player can't afford
      // the bundle (the coin deduct's `coins >= cost` guard fails).
      // Cap: players may hold at most 100 PvP tickets at once.
      // Players who already have >100 (pre-cap legacy balance) keep
      // their existing count but cannot purchase more until they drop
      // below 100. Checked here so the limit is server-authoritative
      // and cannot be bypassed by a modified client.
      const PVP_TICKET_CAP = 100;
      const currentTicketCount = await storage.getPvpTicketCount(user.id);
      if (currentTicketCount >= PVP_TICKET_CAP) {
        return res.status(400).json({ message: "You've reached the 100 PvP ticket limit. Use your tickets in battle to free up space." });
      }
      if (currentTicketCount + bundle.tickets > PVP_TICKET_CAP) {
        return res.status(400).json({ message: `That bundle would exceed the 100 ticket limit. You have ${currentTicketCount} tickets — try a smaller bundle.` });
      }

      const result = await storage.purchasePvpTicketBundleAtomic(
        user.id,
        ticketItem.id,
        bundle.cost,
        bundle.tickets,
      );
      if (!result) {
        return res.status(400).json({ message: "Not enough coins" });
      }

      const safeUser = publicAccount(result.user);
      return res.json({
        user: safeUser,
        ticketsAdded: bundle.tickets,
        ticketsRemaining: result.ticketsRemaining,
        cost: bundle.cost,
      });
    } catch (err) {
      console.error("PvP ticket buy error:", err);
      return res.status(500).json({ message: "Failed to buy tickets" });
    }
  });

  // Get battle history for the logged-in user
  app.get("/api/pvp/history", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const battles = await storage.getPvpBattlesByUser(user.id, 30);
      return res.json(battles);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  // Global PvP leaderboard. Returns the top 50 ranked players AND the
  // requesting user's own rank/entry so the client can show their position
  // even when they're outside the top 50. Players past rank 50 are still
  // tracked in pvp_battles — they just don't render on the public board.
  app.get("/api/pvp/leaderboard", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const all = await storage.getPvpLeaderboardFull();
      // Send the top 100 so the client can render a dropdown view of the
      // full top-100 board while still defaulting to top-10. The "me"
      // block always reports the player's full rank across the entire
      // ranked pool — even when they're outside the top 100.
      const top = all.slice(0, 100);
      const myIdx = all.findIndex((e) => e.userId === user.id);
      let me: any = null;
      if (myIdx >= 0) {
        me = { rank: myIdx + 1, entry: all[myIdx], inTop: myIdx < 100, hidden: false };
      } else {
        // User is excluded from the public board (admin / moderator /
        // reserved alias). They still get to see THEIR OWN tracked
        // BP / W / L — we just report rank as null so the Rank panel
        // can render "N/A" instead of a number.
        const stats = await storage.getUserPvpStats(user.id);
        // Pull their own saved battle group so the hidden Rank-panel
        // entry can mirror the leaderboard rows (which now show ATK
        // alongside BP). Falls back to 0 when the user hasn't built a
        // group yet.
        const ownGroup = await storage.getBattleGroup(user.id);
        me = {
          rank: null,
          entry: {
            userId: user.id,
            username: user.username || "You",
            profileImage: user.profileImage ?? null,
            battlePoints: stats.battlePoints,
            wins: stats.wins,
            losses: stats.losses,
            attackPower: ownGroup?.attackPower ?? 0,
            isAdmin: !!user.isAdmin,
            isModerator: !!user.isModerator,
            isBot: false,
          },
          inTop: false,
          hidden: true,
        };
      }
      return res.json({ top, me, totalRanked: all.length });
    } catch (err) {
      console.error("PvP leaderboard error:", err);
      return res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Get current user's battle group
  app.get("/api/pvp/battle-group", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const group = await storage.getBattleGroup(user.id);
      return res.json(group ?? { petInventoryIds: [] });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch battle group" });
    }
  });

  // Save current user's battle group (up to 5 pets)
  app.post("/api/pvp/battle-group", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { petInventoryIds } = req.body;
      if (!Array.isArray(petInventoryIds)) return res.status(400).json({ message: "petInventoryIds must be an array" });
      const ids = petInventoryIds.slice(0, 5);
      const group = await storage.upsertBattleGroup(user.id, ids);
      return res.json(group);
    } catch (err) {
      return res.status(500).json({ message: "Failed to save battle group" });
    }
  });

  // Get all players who have battle groups set up (for opponent selection)
  app.get("/api/pvp/opponents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const all = await storage.getAllBattleGroupsWithUsers();
      // Exclude current user, bots, and groups without pets.
      const others = all.filter((g: any) => g.userId !== user.id && !g.isBot && g.petInventoryIds?.length > 0);

      // Matchmaking: match real players by ATK band.
      // ±35% first; widen to ±60% if empty; fall back to all players.
      const myGroup = await storage.getBattleGroup(user.id);
      const myPower: number = myGroup?.attackPower ?? 0;

      const inBand = (pool: any[], band: number) => {
        if (myPower <= 0) return pool.slice();
        const lo = myPower * (1 - band);
        const hi = myPower * (1 + band);
        return pool.filter((g: any) => {
          const p = g.attackPower ?? 0;
          return p >= lo && p <= hi;
        });
      };

      let matched: any[] = inBand(others, 0.35);
      if (matched.length === 0) matched = inBand(others, 0.60);
      if (matched.length === 0) matched = others.slice();
      return res.json(matched);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch opponents" });
    }
  });

  // Get a specific user's full inventory with pet details (for building opponent battle group)
  app.get("/api/pvp/opponent-pets/:userId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params as Record<string, string>;
      const group = await storage.getBattleGroup(userId);
      if (!group) return res.json([]);

      const invItems = await storage.getUserInventoryWithItems(userId);
      const petIds = group.petInventoryIds || [];

      const pets = petIds.map((invId: string) => {
        const row = invItems.find((r: any) => r.inventory.id === invId);
        if (!row) return null;
        return { ...row.inventory, ...row.shopItem, shopItem: row.shopItem, inventoryId: row.inventory.id };
      }).filter(Boolean);

      return res.json(pets);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch opponent pets" });
    }
  });

  // ── Friends ────────────────────────────────────────────────────────────────

  app.post("/api/friends/request/:targetUserId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const requesterId = (req.user as any).id;
      const { targetUserId } = req.params as Record<string, string>;
      if (requesterId === targetUserId) return res.status(400).json({ message: "Cannot friend yourself" });
      const outgoingCount = await storage.getOutgoingPendingRequestCount(requesterId);
      if (outgoingCount >= 25) return res.status(400).json({ message: "You have reached the limit of 25 unanswered friend requests. Wait for some to be accepted before sending more." });
      const result = await storage.sendFriendRequest(requesterId, targetUserId);
      // Notify the recipient about the new friend request
      const requester = await storage.getUser(requesterId);
      if (requester) {
        await storage.createNotification(
          targetUserId,
          "friend_request",
          `${requester.username} sent you a friend request!`
        );
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to send friend request" });
    }
  });

  app.get("/api/friends/requests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const requests = await storage.getPendingFriendRequests(userId);
      return res.json(requests);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get friend requests" });
    }
  });

  app.get("/api/friends/requests/count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const count = await storage.getPendingFriendRequestCount(userId);
      return res.json({ count });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get request count" });
    }
  });

  app.post("/api/friends/accept/:requestId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { requestId } = req.params as Record<string, string>;

      // Enforce 100-friend cap for the receiver before accepting
      const receiverFriends = await storage.getFriends(userId);
      if (receiverFriends.length >= 100) {
        return res.status(400).json({ message: "You have reached the 100-friend limit" });
      }

      const result = await storage.acceptFriendRequest(requestId, userId);
      if (!result) return res.status(404).json({ message: "Request not found" });

      // Also enforce cap for the requester
      const requesterFriends = await storage.getFriends(result.requesterId);
      if (requesterFriends.length > 100) {
        // Undo
        await storage.removeFriendOrRequest(userId, result.requesterId);
        return res.status(400).json({ message: "The other player has reached the 100-friend limit" });
      }
      const accepter = await storage.getUser(userId);
      if (accepter) {
        await storage.createNotification(
          result.requesterId,
          "friend_accepted",
          `${accepter.username} accepted your friend request!`
        );
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to accept friend request" });
    }
  });

  app.get("/api/notifications/unread", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const notifs = await storage.getUnreadNotifications(userId);
      return res.json(notifs);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.post("/api/notifications/mark-read", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      await storage.markNotificationsRead(userId);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to mark notifications read" });
    }
  });

  app.delete("/api/friends/:otherId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { otherId } = req.params as Record<string, string>;
      await storage.removeFriendOrRequest(userId, otherId);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to remove friend" });
    }
  });

  app.get("/api/friends", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const friends = await storage.getFriends(userId);
      return res.json(friends);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get friends" });
    }
  });

  app.get("/api/friends/status/:otherId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any).id;
      const { otherId } = req.params as Record<string, string>;
      const friendship = await storage.getFriendshipStatus(userId, otherId);
      return res.json({ friendship });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get friendship status" });
    }
  });

  // ── Enemy Database Routes ─────────────────────────────────────────────────
  app.get("/api/admin/enemies", isAdmin, async (_req, res) => {
    try {
      const all = await storage.getAllEnemies();
      return res.json(all);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/enemies", isAdmin, async (req, res) => {
    try {
      const { name, atk, health, isBoss, special1, special2, special3, imageData } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });
      let imageUrl: string | undefined = undefined;
      if (imageData) {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const resized = await sharp(imageBuffer)
          .resize(400, 400, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      }
      const enemy = await storage.createEnemy({
        name,
        imageUrl: imageUrl ?? null,
        atk: atk ?? 10,
        health: health ?? 100,
        isBoss: isBoss ?? false,
        special1: special1 ?? null,
        special2: special2 ?? null,
        special3: special3 ?? null,
      });
      return res.json(enemy);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/enemies/:id", isAdmin, async (req, res) => {
    try {
      const { name, atk, health, isBoss, special1, special2, special3, imageData } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (atk !== undefined) updates.atk = atk;
      if (health !== undefined) updates.health = health;
      if (isBoss !== undefined) updates.isBoss = isBoss;
      if (special1 !== undefined) updates.special1 = special1;
      if (special2 !== undefined) updates.special2 = special2;
      if (special3 !== undefined) updates.special3 = special3;
      if (imageData) {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const resized = await sharp(imageBuffer)
          .resize(400, 400, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        updates.imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      }
      const enemy = await storage.updateEnemy((req.params.id as string), updates);
      return res.json(enemy);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/enemies/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteEnemy((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/enemy-parts/:enemyId", isAdmin, async (req, res) => {
    try {
      const parts = await storage.getEnemyParts((req.params.enemyId as string));
      return res.json(parts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/enemy-parts/:enemyId", isAdmin, async (req, res) => {
    try {
      const { partType, imageData, posX, posY, width, height, zIndex } = req.body;
      if (!partType || !imageData) return res.status(400).json({ message: "Missing fields" });
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const resized = await sharp(imageBuffer)
        .resize(600, 600, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      const imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      const part = await storage.createEnemyPart({
        enemyId: (req.params.enemyId as string),
        partType,
        imageUrl,
        posX: posX ?? 100,
        posY: posY ?? 100,
        width: width ?? 200,
        height: height ?? 200,
        zIndex: zIndex ?? 1,
      });
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/enemy-parts/:partId", isAdmin, async (req, res) => {
    try {
      const part = await storage.updateEnemyPart((req.params.partId as string), req.body);
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/enemy-parts/:partId", isAdmin, async (req, res) => {
    try {
      await storage.deleteEnemyPart((req.params.partId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

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

  // ── Player House Bundle Routes ────────────────────────────────────────────────
  app.get("/api/house-bundles", async (_req, res) => {
    try {
      const bundles = await storage.getHouseBundles();
      return res.json(bundles);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/:userId/house-bundles", async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const owned = await storage.getUserHouseBundles(userId);
      return res.json(owned);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/users/:userId/active-house-bundle", async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const bundle = await storage.getActiveBundleWithBuildings(userId);
      return res.json(bundle ?? null);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/house-bundles/:bundleId/purchase", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const { bundleId } = req.params as { bundleId: string };
      const [bundle] = await db.select().from(houseBundlesTable).where(eq(houseBundlesTable.id, bundleId));
      if (!bundle) return res.status(404).json({ message: "Bundle not found" });
      const alreadyOwns = await storage.hasUserHouseBundle(user.id, bundleId);
      if (alreadyOwns) return res.status(400).json({ message: "Already owned" });
      // Atomic deduct using fresh DB coins value (not stale session), prevents double-purchase races
      const afterDeduct = await storage.atomicDeductCoins(user.id, bundle.price);
      if (!afterDeduct) return res.status(400).json({ message: "Not enough coins" });
      try {
        const owned = await storage.grantUserHouseBundle(user.id, bundleId);
        return res.status(201).json(owned);
      } catch (grantErr: any) {
        // If grant fails (e.g. duplicate), refund coins
        await storage.addCoins(user.id, bundle.price);
        if (grantErr.code === "23505") return res.status(400).json({ message: "Already owned" });
        throw grantErr;
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/house-bundles/:bundleId/activate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      const { bundleId } = req.params as { bundleId: string };
      const owns = await storage.hasUserHouseBundle(user.id, bundleId);
      if (!owns) return res.status(403).json({ message: "Bundle not owned" });
      await storage.setActiveHouseBundle(user.id, bundleId);
      const bundle = await storage.getActiveBundleWithBuildings(user.id);
      return res.json(bundle);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/house-bundles/deactivate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
      const user = req.user as any;
      await storage.setActiveHouseBundle(user.id, null);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── House Bundles ─────────────────────────────────────────────────────────────
  app.get("/api/admin/house-bundles", isAdmin, async (_req, res) => {
    try {
      const bundles = await storage.getHouseBundles();
      return res.json(bundles);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/house-bundles", isAdmin, async (req, res) => {
    try {
      const { name, price, shopImageData, bgImageData } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      let shopImageUrl: string | undefined;
      let bgImageUrl: string | undefined;
      if (shopImageData) shopImageUrl = await processWorldImage(shopImageData, 1000);
      if (bgImageData)   bgImageUrl   = await processWorldImage(bgImageData, 3000);
      const bundle = await storage.createHouseBundle({ name, price: price ?? 0, shopImageUrl, bgImageUrl });
      return res.status(201).json(bundle);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/house-bundles/:id", isAdmin, async (req, res) => {
    try {
      const { name, price, shopImageData, bgImageData, giftNotificationX, giftNotificationY, maxOutdoorPets } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined)  updates.name  = name;
      if (price !== undefined) updates.price = price;
      if (shopImageData) updates.shopImageUrl = await processWorldImage(shopImageData, 1000);
      if (bgImageData)   updates.bgImageUrl   = await processWorldImage(bgImageData, 3000);
      if (giftNotificationX !== undefined) updates.giftNotificationX = giftNotificationX;
      if (giftNotificationY !== undefined) updates.giftNotificationY = giftNotificationY;
      if (maxOutdoorPets !== undefined) updates.maxOutdoorPets = Math.max(0, Number(maxOutdoorPets));
      const bundle = await storage.updateHouseBundle((req.params.id as string), updates);
      return res.json(bundle);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/house-bundles/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteHouseBundle((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Grant a bundle to every existing player and activate it for those with no active bundle
  app.post("/api/admin/house-bundles/:bundleId/grant-everyone", isAdmin, async (req, res) => {
    try {
      const { bundleId } = req.params as { bundleId: string };
      const [bundle] = await db.select().from(houseBundlesTable).where(eq(houseBundlesTable.id, bundleId));
      if (!bundle) return res.status(404).json({ message: "Bundle not found" });

      const [allUsers, existingOwners] = await Promise.all([
        storage.getAllUsers(),
        db.select({ userId: userHouseBundlesTable.userId }).from(userHouseBundlesTable).where(eq(userHouseBundlesTable.bundleId, bundleId)),
      ]);

      const ownerSet = new Set(existingOwners.map(r => r.userId));
      let granted = 0, activated = 0, alreadyOwned = 0;

      for (const user of allUsers) {
        if (!ownerSet.has(user.id)) {
          await storage.grantUserHouseBundle(user.id, bundleId);
          granted++;
        } else {
          alreadyOwned++;
        }
        if (!user.activeHouseBundleId) {
          await storage.setActiveHouseBundle(user.id, bundleId);
          activated++;
        }
      }

      console.log(`Grant-everyone "${bundle.name}": granted=${granted}, activated=${activated}, alreadyOwned=${alreadyOwned}`);
      return res.json({ granted, activated, alreadyOwned, total: allUsers.length });
    } catch (err: any) {
      console.error("Grant-everyone error:", err);
      return res.status(500).json({ message: err.message });
    }
  });

  // ── House Bundle Buildings ────────────────────────────────────────────────────
  app.get("/api/admin/house-bundles/:bundleId/buildings", isAdmin, async (req, res) => {
    try {
      const buildings = await storage.getHouseBundleBuildings((req.params.bundleId as string));
      return res.json(buildings);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/house-bundles/:bundleId/buildings", isAdmin, async (req, res) => {
    try {
      const { name, imageData, size } = req.body;
      if (!name || !imageData) return res.status(400).json({ message: "name and imageData are required" });
      const imageUrl = await processWorldImage(imageData, 1000);
      const validSizes = ["small", "medium", "large"];
      const building = await storage.createHouseBundleBuilding({
        bundleId: (req.params.bundleId as string), name, imageUrl,
        ...(size && validSizes.includes(size) ? { size } : {}),
      });
      return res.status(201).json(building);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/house-bundle-buildings/:id", isAdmin, async (req, res) => {
    try {
      const { name, posX, posY, width, flippedX, imageData, interiorImageData, clearInterior, size, leaveButtonX, leaveButtonY, maxPets } = req.body;
      const updates: Record<string, any> = {};
      if (name     !== undefined) updates.name     = name;
      if (posX     !== undefined) updates.posX     = posX;
      if (posY     !== undefined) updates.posY     = posY;
      if (width    !== undefined) updates.width    = Math.max(20, Math.min(400, Number(width)));
      if (flippedX !== undefined) updates.flippedX = Boolean(flippedX);
      if (imageData) updates.imageUrl = await processWorldImage(imageData, 1000);
      if (interiorImageData) updates.interiorImageUrl = await processWorldImage(interiorImageData, 2000);
      if (clearInterior) updates.interiorImageUrl = null;
      if (size && ["small", "medium", "large"].includes(size)) updates.size = size;
      if (leaveButtonX !== undefined) updates.leaveButtonX = Math.max(0, Math.min(1, Number(leaveButtonX)));
      if (leaveButtonY !== undefined) updates.leaveButtonY = Math.max(0, Math.min(1, Number(leaveButtonY)));
      if (maxPets !== undefined) updates.maxPets = maxPets === null ? null : Math.max(0, Number(maxPets));
      const building = await storage.updateHouseBundleBuilding((req.params.id as string), updates);
      return res.json(building);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/house-bundle-buildings/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteHouseBundleBuilding((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/house-bundle-buildings/:id/duplicate", isAdmin, async (req, res) => {
    try {
      const source = await storage.getHouseBundleBuilding((req.params.id as string));
      if (!source) return res.status(404).json({ message: "Building not found" });
      const dup = await storage.createHouseBundleBuilding({
        bundleId: source.bundleId,
        name: source.name,
        imageUrl: source.imageUrl,
        posX: Math.min(95, source.posX + 5),
        posY: Math.min(95, source.posY + 5),
        width: source.width,
        flippedX: source.flippedX,
        interiorImageUrl: source.interiorImageUrl,
        size: source.size,
      });
      return res.status(201).json(dup);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Home Decor Items ──────────────────────────────────────────────────────────
  app.get("/api/admin/home-decor", isAdmin, async (_req, res) => {
    try {
      const items = await storage.getHomeDecorItems();
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/home-decor", isAdmin, async (req, res) => {
    try {
      const { name, price, imageData } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      let imageUrl: string | undefined;
      if (imageData) imageUrl = await processWorldImage(imageData, 2000);
      const item = await storage.createHomeDecorItem({ name, price: price ?? 0, imageUrl });
      return res.status(201).json(item);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/home-decor/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteHomeDecorItem((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: location house-bundle shop stock ────────────────────────────────
  app.get("/api/admin/location/:locationId/shop-bundles", isAdmin, async (req, res) => {
    try {
      const rows = await storage.getLocationHouseBundles((req.params.locationId as string));
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/location/:locationId/assign-bundle/:bundleId", isAdmin, async (req, res) => {
    try {
      const row = await storage.addBundleToShop((req.params.locationId as string), (req.params.bundleId as string));
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/location/:locationId/unassign-bundle/:bundleId", isAdmin, async (req, res) => {
    try {
      await storage.removeBundleFromShop((req.params.locationId as string), (req.params.bundleId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Player: get bundles available at a shop ────────────────────────────────
  app.get("/api/locations/:locationId/shop-bundles", isAuthenticated, async (req, res) => {
    try {
      const rows = await storage.getLocationHouseBundles((req.params.locationId as string));
      return res.json(rows.map(r => r.bundle));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: location home-decor shop stock ──────────────────────────────────
  app.get("/api/admin/location/:locationId/shop-decor", isAdmin, async (req, res) => {
    try {
      const rows = await storage.getLocationHomeDecor((req.params.locationId as string));
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/location/:locationId/assign-decor/:decorId", isAdmin, async (req, res) => {
    try {
      const row = await storage.addDecorToShop((req.params.locationId as string), (req.params.decorId as string));
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/location/:locationId/unassign-decor/:decorId", isAdmin, async (req, res) => {
    try {
      await storage.removeDecorFromShop((req.params.locationId as string), (req.params.decorId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Player: get decor available at a shop ─────────────────────────────────
  app.get("/api/locations/:locationId/shop-decor", isAuthenticated, async (req, res) => {
    try {
      const rows = await storage.getLocationHomeDecor((req.params.locationId as string));
      return res.json(rows.map(r => r.decor));
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Admin: purge all orphaned rows left by past deletions ─────────────────
  app.post("/api/admin/cleanup-orphans", isAdmin, async (_req, res) => {
    try {
      const steps: string[] = [];
      const run = async (label: string, q: string) => {
        const r = await db.execute(sql.raw(q));
        const count = (r as any).rowCount ?? 0;
        if (count > 0) steps.push(`${label}: ${count} row(s) removed`);
      };

      // house bundles
      await run("user_house_bundles orphans",       "DELETE FROM user_house_bundles WHERE bundle_id NOT IN (SELECT id FROM house_bundles)");
      await run("location_house_bundles orphans",   "DELETE FROM location_house_bundles WHERE bundle_id NOT IN (SELECT id FROM house_bundles)");
      await run("location_house_bundles loc miss",  "DELETE FROM location_house_bundles WHERE location_id NOT IN (SELECT id FROM world_locations)");
      await run("house_bundle_buildings orphans",   "DELETE FROM house_bundle_buildings WHERE bundle_id NOT IN (SELECT id FROM house_bundles)");

      // shop items / inventory
      await run("user_inventory orphans",           "DELETE FROM user_inventory WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("pet_equipped_accessories pet miss","DELETE FROM pet_equipped_accessories WHERE pet_inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("pet_equipped_accessories acc miss","DELETE FROM pet_equipped_accessories WHERE accessory_inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("pet_house_positions orphans",      "DELETE FROM pet_house_positions WHERE inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("player_market_listings item miss", "DELETE FROM player_market_listings WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("player_market_listings inv miss",  "DELETE FROM player_market_listings WHERE inventory_id NOT IN (SELECT id FROM user_inventory)");

      // fishing
      await run("pond_fish item miss",              "DELETE FROM pond_fish WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("pond_fish location miss",          "DELETE FROM pond_fish WHERE location_id NOT IN (SELECT id FROM world_locations)");
      await run("fish_template_parts orphans",      "DELETE FROM fish_template_parts WHERE fish_item_id NOT IN (SELECT id FROM shop_items)");
      await run("player_fish_inventory orphans",    "DELETE FROM player_fish_inventory WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("player_fish_catch_log orphans",    "DELETE FROM player_fish_catch_log WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("fishing equipment pole miss",      "UPDATE player_fishing_equipment SET pole_inventory_id = NULL WHERE pole_inventory_id IS NOT NULL AND pole_inventory_id NOT IN (SELECT id FROM user_inventory)");
      await run("fishing equipment bait miss",      "UPDATE player_fishing_equipment SET bait_inventory_id = NULL WHERE bait_inventory_id IS NOT NULL AND bait_inventory_id NOT IN (SELECT id FROM user_inventory)");

      // enemies
      await run("enemy_drops enemy miss",           "DELETE FROM enemy_drops WHERE enemy_id NOT IN (SELECT id FROM enemies)");
      await run("enemy_drops item miss",            "DELETE FROM enemy_drops WHERE shop_item_id NOT IN (SELECT id FROM shop_items)");
      await run("enemy_parts orphans",              "DELETE FROM enemy_parts WHERE enemy_id NOT IN (SELECT id FROM enemies)");
      await run("keepers_central_enemies orphans",  "DELETE FROM keepers_central_enemies WHERE enemy_id NOT IN (SELECT id FROM enemies)");

      // badges
      await run("user_badges orphans",              "DELETE FROM user_badges WHERE badge_id NOT IN (SELECT id FROM badges)");
      await run("badge_reward_claims orphans",      "DELETE FROM badge_reward_claims WHERE badge_id NOT IN (SELECT id FROM badges)");

      // home decor
      await run("location_home_decor decor miss",  "DELETE FROM location_home_decor WHERE decor_id NOT IN (SELECT id FROM home_decor_items)");
      await run("location_home_decor loc miss",    "DELETE FROM location_home_decor WHERE location_id NOT IN (SELECT id FROM world_locations)");

      // pet templates
      await run("pet_template_parts orphans",       "DELETE FROM pet_template_parts WHERE template_id NOT IN (SELECT id FROM pet_templates)");

      // world/location fk nullification (don't delete, just detach)
      await run("shop_items missing petTemplateId", "UPDATE shop_items SET pet_template_id = NULL WHERE pet_template_id IS NOT NULL AND pet_template_id NOT IN (SELECT id FROM pet_templates)");
      await run("shop_items missing worldId",       "UPDATE shop_items SET world_id = NULL WHERE world_id IS NOT NULL AND world_id NOT IN (SELECT id FROM worlds)");
      await run("shop_items missing locationId",    "UPDATE shop_items SET location_id = NULL WHERE location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM world_locations)");

      const totalRows = steps.reduce((sum, s) => {
        const m = s.match(/(\d+) row/);
        return sum + (m ? parseInt(m[1]) : 0);
      }, 0);
      const summary = steps.length > 0 ? steps.join("\n") : "No orphans found — database is clean.";
      return res.json({ ok: true, summary, cleaned: steps.length, totalRows, ranAt: new Date().toISOString() });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Client-side crash / error reporting ──────────────────────────────────────
  // Public — no auth required so crashed/logged-out clients can still report.
  app.post("/api/client-error", (req, res) => {
    try {
      const { type, msg, source, url, ua } = req.body as any;
      const userId = (req.user as any)?.id;
      const safeType = (["crash", "unhandled", "error"] as const).includes(type) ? type as ClientErrorEntry["type"] : "error";
      pushClientError({
        type: safeType,
        msg: String(msg ?? "").slice(0, 800),
        source: String(source ?? "").slice(0, 600),
        url: String(url ?? "").slice(0, 300),
        ua: String(ua ?? "").slice(0, 200),
        userId,
      });
      console.error(`[client-error:${safeType}] ${String(url ?? "")} :: ${String(msg ?? "").slice(0, 400)} @ ${String(source ?? "").slice(0, 200)}`);
      return res.json({ ok: true });
    } catch { return res.json({ ok: false }); }
  });

  app.get("/api/admin/client-errors", isAdmin, (_req, res) => {
    return res.json({ entries: _clientErrorLog, total: _clientErrorLog.length });
  });

  app.delete("/api/admin/client-errors", isAdmin, (_req, res) => {
    _clientErrorLog.length = 0;
    _ceSeq = 0;
    return res.json({ ok: true });
  });

  // ── Player Home Decor Inventory & Placement ───────────────────────────────────
  registerHomeDecorRoutes(app, { storage, isAuthenticated, executeDecorPlacement, executeDecorRemoval });

  // ── Admin: grant a home decor item to all players ─────────────────────────────
  app.post("/api/admin/home-decor/:id/grant-everyone", isAdmin, async (req, res) => {
    try {
      const decorItemId = (req.params.id as string);
      const allUsers = await storage.getAllUsers();
      let granted = 0;
      for (const u of allUsers) {
        await storage.grantHomeDecorToUser(u.id, decorItemId);
        granted++;
      }
      return res.json({ ok: true, granted });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

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

  // ── Watcher shoutout preference ───────────────────────────────────────────
  app.get("/api/user/watcher-shoutouts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const fresh = await storage.getUser(user.id);
      return res.json({ enabled: fresh?.watcherShoutoutsEnabled ?? true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get preference" });
    }
  });

  app.post("/api/user/watcher-shoutouts", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") return res.status(400).json({ message: "enabled must be a boolean" });
      await storage.setWatcherShoutoutsEnabled(user.id, enabled);
      return res.json({ enabled });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update preference" });
    }
  });

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

  // ── Founders ───────────────────────────────────────────────────────────────
  // Public list of supporter names shown on the public Founders page (no auth
  // required to read — the page is public). Add / delete are admin-only.
  app.get("/api/founders", async (_req, res) => {
    try {
      const list = await storage.getFounders();
      return res.json(list);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/founders", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Name required" });
      }
      if (name.trim().length > 120) {
        return res.status(400).json({ message: "Name too long (max 120)" });
      }
      const row = await storage.addFounder(name.trim(), user.username);
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/founders/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const id = String(req.params.id);
      const { tier, name } = req.body;

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          return res.status(400).json({ message: "name must be a non-empty string" });
        }
        const row = await storage.updateFounderName(id, name.trim());
        return res.json(row);
      }

      const validTiers = ["bronze", "silver", "gold", null];
      if (!validTiers.includes(tier)) {
        return res.status(400).json({ message: "tier must be bronze, silver, gold, or null" });
      }
      const row = await storage.updateFounderTier(id, tier ?? null);
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/founders/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteFounder(String(req.params.id));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Veridian Watcher Quote Admin Routes ───────────────────────────────────
  app.get("/api/admin/vw-quotes", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.isAdmin && !user?.isModerator) return res.status(403).json({ message: "Forbidden" });
      const quotes = await storage.getVWQuotes();
      return res.json(quotes);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/vw-quotes", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.isAdmin && !user?.isModerator) return res.status(403).json({ message: "Forbidden" });
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "Message is required" });
      const quote = await storage.addVWQuote(message.trim(), user.username);
      return res.json(quote);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/vw-quotes/:id", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.isAdmin && !user?.isModerator) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteVWQuote(req.params.id);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Veridian Watcher Background Jobs ──────────────────────────────────────
  const VW_QUOTE_INTERVAL_MS = 60 * 60 * 1000; // every hour
  // Quotes always fire on schedule — no back-to-back guard so leaderboard
  // shoutouts can't accidentally block the admin-added sayings.
  setInterval(async () => {
    try {
      const quotes = await storage.getVWQuotes();
      if (quotes.length === 0) return;
      const pick = quotes[Math.floor(Math.random() * quotes.length)];
      await postWatcherMessage(`𖢻 ${pick.message}`);
    } catch (err) {
      console.error("[VW] Quote error:", err);
    }
  }, VW_QUOTE_INTERVAL_MS);

  // Leaderboard shoutouts use a guard so rank-change pings don't stack up.
  const VW_BACKTOBACK_GUARD_MS = 20 * 60 * 1000; // 20 min between leaderboard posts

  // ── Leaderboard rank monitors — shout only when a player enters top 3 ───────
  // Checks every 10 min; fires only when someone's rank improves into 1st/2nd/3rd.
  const LEADERBOARD_CHECK_MS = 10 * 60 * 1000;

  let hubLbSnapshot     = new Map<string, number>(); // username → rank
  let fishingLbSnapshot = new Map<string, number>();
  let moltenLbSnapshot  = new Map<string, number>();
  let lavaLbSnapshot    = new Map<string, number>();
  let lbPrimed = false;

  async function shoutoutEligible(userId: string): Promise<boolean> {
    const result: any = await db.execute(sql`
      SELECT watcher_shoutouts_enabled FROM users WHERE id = ${userId}
    `);
    const row = ((result.rows ?? result) as any[])[0];
    return row?.watcher_shoutouts_enabled !== false;
  }

  async function checkLeaderboardRanks() {
    try {
      // ── Hub (Hall of Founders) ──
      const hubRows: any = await db.execute(sql`
        SELECT cp.user_id AS user_id, u.username
        FROM coin_purchases cp
        JOIN users u ON cp.user_id = u.id
        WHERE u.is_admin = false AND u.is_bot = false
        GROUP BY cp.user_id, u.username
        ORDER BY SUM(cp.amount_usd) DESC
        LIMIT 5
      `);
      const hubTop = ((hubRows.rows ?? hubRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string, username: r.username as string, rank: i + 1,
      }));

      // ── Fishing (global aggregate across all worlds) ──
      const fishRows: any = await db.execute(sql`
        SELECT fl.user_id AS user_id, u.username, SUM(fl.points) AS total_pts
        FROM fishing_leaderboard fl
        JOIN users u ON u.id = fl.user_id
        WHERE fl.points > 0 AND u.is_bot = false
        GROUP BY fl.user_id, u.username
        ORDER BY SUM(fl.points) DESC
        LIMIT 5
      `);
      const fishTop = ((fishRows.rows ?? fishRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string, username: r.username as string, rank: i + 1,
      }));

      // ── Molten Blocks ──
      const moltenRows: any = await db.execute(sql`
        SELECT id AS user_id, username
        FROM users
        WHERE molten_blocks_high_score > 0 AND is_bot = false AND is_admin = false
        ORDER BY molten_blocks_high_score DESC
        LIMIT 5
      `);
      const moltenTop = ((moltenRows.rows ?? moltenRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string, username: r.username as string, rank: i + 1,
      }));

      // ── Lava Crawl ──
      const lavaRows: any = await db.execute(sql`
        SELECT s.user_id AS user_id, u.username, MAX(s.score) AS best_score
        FROM lava_crawl_scores s
        JOIN users u ON s.user_id = u.id
        WHERE u.is_bot = false
        GROUP BY s.user_id, u.username
        ORDER BY MAX(s.score) DESC
        LIMIT 5
      `);
      const lavaTop = ((lavaRows.rows ?? lavaRows) as any[]).map((r: any, i: number) => ({
        userId: r.user_id as string, username: r.username as string, rank: i + 1,
      }));

      if (lbPrimed) {
        const boards = [
          { top: hubTop,    prev: hubLbSnapshot,     boardName: "the Hall of Founders" },
          { top: fishTop,   prev: fishingLbSnapshot,  boardName: "the Fishing Leaderboard" },
          { top: moltenTop, prev: moltenLbSnapshot,   boardName: "the Molten Blocks Leaderboard" },
          { top: lavaTop,   prev: lavaLbSnapshot,     boardName: "the Lava Crawl Leaderboard" },
        ];
        for (const { top, prev, boardName } of boards) {
          for (const entry of top) {
            if (entry.rank > 3) continue;
            const prevRank = prev.get(entry.username);
            if (prevRank !== undefined && prevRank <= 3 && prevRank === entry.rank) continue; // unchanged
            if (!(await shoutoutEligible(entry.userId))) continue;
            await postWatcherMessage(
              `☆ ${entry.username} has reached rank #${entry.rank} on ${boardName}! A new champion rises!`
            );
          }
        }
      }

      // Update snapshots
      hubLbSnapshot     = new Map(hubTop.map(e => [e.username, e.rank]));
      fishingLbSnapshot = new Map(fishTop.map(e => [e.username, e.rank]));
      moltenLbSnapshot  = new Map(moltenTop.map(e => [e.username, e.rank]));
      lavaLbSnapshot    = new Map(lavaTop.map(e => [e.username, e.rank]));
      lbPrimed = true;
    } catch (err) {
      console.error("[VW] Leaderboard rank monitor error:", err);
    }
  }

  checkLeaderboardRanks(); // Prime snapshots at startup (no shoutouts on first run)
  setInterval(checkLeaderboardRanks, LEADERBOARD_CHECK_MS);

  // ── Daily Claim (fixed reward, once per 24h) ──────────────────────────────
  const DAILY_REWARD_COINS = 500;
  const DAILY_REWARD_TICKETS = 10;
  const DAILY_RAID_TICKETS = 25;
  const DAILY_PVP_TICKET_ID  = "a1b2c3d4-9001-4000-8000-000000000099";
  const DAILY_RAID_TICKET_ID = "a1b2c3d4-9002-4000-8000-000000000099";
  const DAILY_FISHING_ROD_ID = "7b381092-3b76-4c91-99bc-5a5ba91f52ec";

  // Auth: get player's claim status (canClaim + nextClaimAt)
  app.get("/api/daily-claim/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await db.execute(sql`
        SELECT
          MAX(claimed_at) AS last_claimed,
          (MAX(claimed_at) IS NULL OR NOW() - MAX(claimed_at) >= INTERVAL '24 hours') AS can_claim,
          CASE WHEN MAX(claimed_at) IS NOT NULL
            THEN MAX(claimed_at) + INTERVAL '24 hours'
            ELSE NULL
          END AS next_claim_at
        FROM player_daily_login_claims
        WHERE user_id = ${user.id}
      `);
      return res.json({
        canClaim: !!result.rows[0].can_claim,
        lastClaimedAt: result.rows[0].last_claimed,
        nextClaimAt: result.rows[0].next_claim_at,
      });
    } catch (err) {
      console.error("Daily claim status error:", err);
      return res.status(500).json({ message: "Failed to get daily claim status" });
    }
  });

  // Auth: claim daily reward (100 coins + 10 PvP tickets, once every 24h).
  // Wrapped in a DB transaction with row-level lock on the user so two
  // concurrent claim requests cannot both pass the eligibility check and
  // double-credit the player.
  app.post("/api/daily-claim", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await db.transaction(async (tx) => {
        // 1. Acquire a row-level lock on the user row. All concurrent
        //    claim requests for this user serialize behind this lock.
        await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);

        // 2. Recheck eligibility inside the lock.
        const check = await tx.execute(sql`
          SELECT (MAX(claimed_at) IS NULL OR NOW() - MAX(claimed_at) >= INTERVAL '24 hours') AS can_claim
          FROM player_daily_login_claims
          WHERE user_id = ${user.id}
        `);
        if (!check.rows[0].can_claim) {
          return { ok: false as const };
        }

        // 3. Grant coins.
        await tx.execute(sql`
          UPDATE users
          SET coins = coins + ${DAILY_REWARD_COINS},
              total_coins_earned = total_coins_earned + ${DAILY_REWARD_COINS}
          WHERE id = ${user.id}
        `);

        // 4. Grant PvP tickets — atomic SQL-side increment.
        //    Strategy: try to UPDATE the oldest existing stack with
        //    `quantity + N` and RETURNING id. If 0 rows returned (no
        //    stack exists, or it was concurrently deleted by an
        //    /api/pvp/start consume), INSERT a fresh stack. This closes
        //    both the lost-update race and the SELECT-then-UPDATE
        //    delete-window race.
        const updated = await tx.execute(sql`
          UPDATE user_inventory
          SET quantity = quantity + ${DAILY_REWARD_TICKETS}
          WHERE id = (
            SELECT id FROM user_inventory
            WHERE user_id = ${user.id} AND shop_item_id = ${DAILY_PVP_TICKET_ID}
            ORDER BY id
            LIMIT 1
          )
          RETURNING id
        `);
        if (updated.rows.length === 0) {
          await tx.execute(sql`
            INSERT INTO user_inventory (user_id, shop_item_id, quantity)
            VALUES (${user.id}, ${DAILY_PVP_TICKET_ID}, ${DAILY_REWARD_TICKETS})
          `);
        }

        // 5. Grant Raid Tickets — cap total at 25.
        const RAID_CAP = 25;
        const raidCurrentRows = await tx.execute(sql`
          SELECT COALESCE(SUM(quantity), 0) AS total
          FROM user_inventory
          WHERE user_id = ${user.id} AND shop_item_id = ${DAILY_RAID_TICKET_ID}
        `);
        const raidCurrent = Number((raidCurrentRows.rows[0] as any).total ?? 0);
        const raidToGrant = Math.max(0, RAID_CAP - raidCurrent);

        if (raidToGrant > 0) {
          const raidUpdated = await tx.execute(sql`
            UPDATE user_inventory
            SET quantity = quantity + ${raidToGrant}
            WHERE id = (
              SELECT id FROM user_inventory
              WHERE user_id = ${user.id} AND shop_item_id = ${DAILY_RAID_TICKET_ID}
              ORDER BY id
              LIMIT 1
            )
            RETURNING id
          `);
          if (raidUpdated.rows.length === 0) {
            await tx.execute(sql`
              INSERT INTO user_inventory (user_id, shop_item_id, quantity)
              VALUES (${user.id}, ${DAILY_RAID_TICKET_ID}, ${raidToGrant})
            `);
          }
        }

        // 6. Grant Basic Fishing Rod — same upsert pattern as PvP tickets.
        const rodUpdated = await tx.execute(sql`
          UPDATE user_inventory
          SET quantity = quantity + 1
          WHERE id = (
            SELECT id FROM user_inventory
            WHERE user_id = ${user.id} AND shop_item_id = ${DAILY_FISHING_ROD_ID}
            ORDER BY id
            LIMIT 1
          )
          RETURNING id
        `);
        if (rodUpdated.rows.length === 0) {
          await tx.execute(sql`
            INSERT INTO user_inventory (user_id, shop_item_id, quantity)
            VALUES (${user.id}, ${DAILY_FISHING_ROD_ID}, 1)
          `);
        }

        // 6. Record the claim and return canonical timestamps.
        const inserted = await tx.execute(sql`
          INSERT INTO player_daily_login_claims (user_id, cycle_number, day_number)
          VALUES (${user.id}, 0, 1)
          RETURNING claimed_at, claimed_at + INTERVAL '24 hours' AS next_claim_at
        `);
        return {
          ok: true as const,
          claimedAt: inserted.rows[0].claimed_at,
          nextClaimAt: inserted.rows[0].next_claim_at,
          raidTicketsGranted: raidToGrant,
        };
      });

      if (!result.ok) {
        return res.status(400).json({ message: "Already claimed. Come back in 24 hours!" });
      }
      return res.json({
        coinAmount: DAILY_REWARD_COINS,
        pvpTickets: DAILY_REWARD_TICKETS,
        raidTickets: result.raidTicketsGranted,
        canClaim: false,
        lastClaimedAt: result.claimedAt,
        nextClaimAt: result.nextClaimAt,
      });
    } catch (err) {
      console.error("Daily claim error:", err);
      return res.status(500).json({ message: "Failed to claim daily reward" });
    }
  });

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

  // PvP leaderboard monitor — fires when a player moves UP in PvP rank.
  // Polls every 5 minutes. Tracks rank per username so position improvements are detected.
  let pvpRankSnapshot = new Map<string, number>();
  let pvpLeaderboardPrimed = false;
  let pvpMonitorRunning = false;
  setInterval(async () => {
    if (pvpMonitorRunning) return; // prevent overlapping ticks from duplicating messages
    pvpMonitorRunning = true;
    try {
      const leaderboard = await storage.getPvpLeaderboard(20);
      const currentSnapshot = new Map<string, number>();
      leaderboard.forEach((entry: any, idx: number) => {
        currentSnapshot.set(entry.username, idx + 1);
      });
      // Snapshot the previous state and update eagerly so any concurrent
      // re-entry (shouldn't happen with the lock, but belt-and-suspenders)
      // sees the latest data.
      const prevSnapshot = pvpRankSnapshot;
      pvpRankSnapshot = currentSnapshot;
      if (pvpLeaderboardPrimed) {
        for (const [username, newRank] of currentSnapshot.entries()) {
          const oldRank = prevSnapshot.get(username);
          const movedUp = oldRank !== undefined && newRank < oldRank;
          if (!movedUp) continue;
          if (newRank > 10) continue;
          const entry = leaderboard[newRank - 1] as any;
          if (!entry) continue;
          const fullUser = await storage.getUser(entry.userId).catch(() => null);
          if (fullUser?.watcherShoutoutsEnabled === false) continue;
          const star = newRank <= 3 ? "★ " : "";
          await postWatcherMessage(
            `𖤓 The Watcher observes... ${star}${username} has risen to rank #${newRank} on the PvP leaderboard. A formidable challenger emerges!`
          );
        }
      }
      pvpLeaderboardPrimed = true;
    } catch (err) {
      console.error("[VW] PvP leaderboard monitor error:", err);
    } finally {
      pvpMonitorRunning = false;
    }
  }, 5 * 60 * 1000);

  // ── Tutorial: grant starter egg ──────────────────────────────────────────
  app.post("/api/tutorial/grant-starter-egg", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      const inv = await storage.getUserInventoryWithItems(userId);
      const hasAnyPet = inv.some(
        ({ inventory: _inv, shopItem }) => shopItem?.type === "pet"
      );
      if (hasAnyPet) {
        return res.json({ granted: false, message: "Already has a pet" });
      }
      const allItems = await storage.getAllShopItems();
      const starterEgg = allItems.find(
        (item) =>
          item.type === "pet" &&
          (item.name.toLowerCase().includes("grassland") || item.name.toLowerCase().includes("cow"))
      );
      if (!starterEgg) {
        return res.status(404).json({ message: "Starter egg not found in shop" });
      }
      await storage.addToInventory(userId, starterEgg.id);
      return res.json({ granted: true, itemName: starterEgg.name });
    } catch (err) {
      console.error("[tutorial] grant-starter-egg error:", err);
      return res.status(500).json({ message: "Server error" });
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

  // ── Mixing Tree Recipes ─────────────────────────────────────────────────────
  app.get("/api/recipes", isAuthenticated, async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT r.id, r.result_type, r.recipe_item_id,
          ri.name as recipe_item_name, ri.image_url as recipe_item_image,
          i1.id as ing1_id, i1.name as ing1_name, i1.image_url as ing1_image,
          i2.id as ing2_id, i2.name as ing2_name, i2.image_url as ing2_image,
          i3.id as ing3_id, i3.name as ing3_name, i3.image_url as ing3_image,
          rr.id as result_id, rr.name as result_name, rr.image_url as result_image, rr.type as result_item_type
        FROM mixing_tree_recipes r
        JOIN shop_items i1 ON r.ingredient1_id = i1.id
        JOIN shop_items i2 ON r.ingredient2_id = i2.id
        LEFT JOIN shop_items i3 ON r.ingredient3_id = i3.id
        JOIN shop_items rr ON r.result_id = rr.id
        LEFT JOIN shop_items ri ON r.recipe_item_id = ri.id
        ORDER BY r.created_at
      `);
      return res.json(rows.rows);
    } catch (err) {
      console.error("Get recipes error:", err);
      return res.status(500).json({ message: "Failed to get recipes" });
    }
  });

  app.get("/api/recipes/unlocked", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    try {
      const rows = await db.execute(sql`
        SELECT recipe_id FROM player_unlocked_recipes WHERE user_id = ${userId}
      `);
      return res.json((rows.rows as any[]).map((r) => r.recipe_id));
    } catch (err) {
      console.error("Get unlocked recipes error:", err);
      return res.status(500).json({ message: "Failed to get unlocked recipes" });
    }
  });

  app.post("/api/recipes/unlock", isAuthenticated, async (req: any, res) => {
    const userId = req.user!.id;
    const { inventoryId } = req.body;
    if (!inventoryId) return res.status(400).json({ message: "inventoryId required" });
    try {
      // Find the inventory item and its shop_item_id
      const invRow = await db.execute(sql`
        SELECT ui.id, ui.shop_item_id FROM user_inventory ui
        WHERE ui.id = ${inventoryId} AND ui.user_id = ${userId}
      `);
      if (!invRow.rows.length) return res.status(404).json({ message: "Item not found" });
      const shopItemId = (invRow.rows[0] as any).shop_item_id;
      // Find the recipe this scroll unlocks
      const recipeRow = await db.execute(sql`
        SELECT r.id, r.result_type,
          ri.image_url as recipe_item_image,
          i1.id as ing1_id, i1.name as ing1_name, i1.image_url as ing1_image,
          i2.id as ing2_id, i2.name as ing2_name, i2.image_url as ing2_image,
          rr.id as result_id, rr.name as result_name, rr.image_url as result_image
        FROM mixing_tree_recipes r
        JOIN shop_items i1 ON r.ingredient1_id = i1.id
        JOIN shop_items i2 ON r.ingredient2_id = i2.id
        JOIN shop_items rr ON r.result_id = rr.id
        LEFT JOIN shop_items ri ON r.recipe_item_id = ri.id
        WHERE r.recipe_item_id = ${shopItemId}
        LIMIT 1
      `);
      if (!recipeRow.rows.length) return res.status(404).json({ message: "No recipe found for this scroll" });
      const recipe = recipeRow.rows[0] as any;
      // Check not already unlocked
      const alreadyRow = await db.execute(sql`
        SELECT 1 FROM player_unlocked_recipes WHERE user_id = ${userId} AND recipe_id = ${recipe.id}
      `);
      if (alreadyRow.rows.length) return res.status(409).json({ message: "Already unlocked", errorCode: "ALREADY_UNLOCKED" });
      // Unlock and consume scroll
      await db.execute(sql`
        INSERT INTO player_unlocked_recipes (user_id, recipe_id) VALUES (${userId}, ${recipe.id})
      `);
      await db.execute(sql`
        DELETE FROM user_inventory WHERE id = ${inventoryId} AND user_id = ${userId}
      `);
      return res.json({ ok: true, recipe });
    } catch (err) {
      console.error("Unlock recipe error:", err);
      return res.status(500).json({ message: "Failed to unlock recipe" });
    }
  });

  app.post("/api/admin/recipes", isAdmin, async (req: any, res) => {
    try {
      const { ingredient1Id, ingredient2Id, ingredient3Id, resultId, resultType, name } = req.body;
      if (!ingredient1Id || !ingredient2Id || !resultId || !resultType) {
        return res.status(400).json({ message: "ingredient1Id, ingredient2Id, resultId and resultType are required" });
      }
      if (!["item","fish","pet"].includes(resultType)) {
        return res.status(400).json({ message: "resultType must be item, fish, or pet" });
      }
      const adminId = req.user!.id;
      const ing3: string | null = ingredient3Id || null;

      // 1. Look up the result item name for the scroll label fallback
      const resultRows = await db.execute(sql`SELECT name FROM shop_items WHERE id = ${resultId}`);
      const resultName: string = (resultRows.rows[0] as any)?.name ?? "Unknown";
      const scrollName: string = (name && typeof name === "string" && name.trim()) ? name.trim() : (resultName + " Recipe Scroll");

      // 2. Create a recipe-type shop item (the scroll) linked to this recipe
      const scrollRows = await db.execute(sql`
        INSERT INTO shop_items (name, price, type, world_id, image_url)
        VALUES (${scrollName}, 0, 'recipe', 'mixing_tree', '/recipe-scroll.png')
        RETURNING id
      `);
      const scrollItemId: string = (scrollRows.rows[0] as any).id;

      // 3. Insert the recipe, linking the scroll as its recipe_item_id
      await db.execute(sql`
        INSERT INTO mixing_tree_recipes (ingredient1_id, ingredient2_id, ingredient3_id, result_id, result_type, recipe_item_id)
        VALUES (${ingredient1Id}, ${ingredient2Id}, ${ing3}, ${resultId}, ${resultType}, ${scrollItemId})
      `);

      // 4. Add one copy of the scroll to the admin's inventory
      await db.execute(sql`
        INSERT INTO user_inventory (user_id, shop_item_id, quantity)
        VALUES (${adminId}, ${scrollItemId}, 1)
      `);

      return res.json({ ok: true, scrollItemId });
    } catch (err) {
      console.error("Add recipe error:", err);
      return res.status(500).json({ message: "Failed to add recipe" });
    }
  });

  app.patch("/api/admin/recipes/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params as Record<string,string>;
      const { ingredient1Id, ingredient2Id, ingredient3Id, resultId, resultType, name } = req.body;

      // Get current recipe to find the scroll shop item
      const curr = await db.execute(sql`SELECT recipe_item_id FROM mixing_tree_recipes WHERE id = ${id}`);
      if (!curr.rows.length) return res.status(404).json({ message: "Recipe not found" });
      const scrollItemId: string | null = (curr.rows[0] as any).recipe_item_id ?? null;

      // Update recipe fields (only provided ones)
      const updates: string[] = [];
      if (ingredient1Id) updates.push(`ingredient1_id = '${ingredient1Id}'`);
      if (ingredient2Id) updates.push(`ingredient2_id = '${ingredient2Id}'`);
      // ingredient3Id can be cleared (pass null/empty string to remove) or set
      if (ingredient3Id !== undefined) {
        updates.push(ingredient3Id ? `ingredient3_id = '${ingredient3Id}'` : `ingredient3_id = NULL`);
      }
      if (resultId)      updates.push(`result_id = '${resultId}'`);
      if (resultType && ["item","fish","pet"].includes(resultType)) updates.push(`result_type = '${resultType}'`);
      if (updates.length) {
        await db.execute(sql`UPDATE mixing_tree_recipes SET ${sql.raw(updates.join(", "))} WHERE id = ${id}`);
      }

      // Update scroll name if provided
      if (name && typeof name === "string" && name.trim() && scrollItemId) {
        await db.execute(sql`UPDATE shop_items SET name = ${name.trim()} WHERE id = ${scrollItemId}`);
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("Update recipe error:", err);
      return res.status(500).json({ message: "Failed to update recipe" });
    }
  });

  app.delete("/api/admin/recipes/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params as Record<string,string>;
      await db.execute(sql`DELETE FROM mixing_tree_recipes WHERE id = ${id}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Delete recipe error:", err);
      return res.status(500).json({ message: "Failed to delete recipe" });
    }
  });

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
