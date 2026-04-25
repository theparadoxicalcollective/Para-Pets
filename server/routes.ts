import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { insertUserSchema, updateUsernameSchema, insertShopItemSchema, rewardBundles, rewardBundleItems, userRewards, userInventory, houseBundles as houseBundlesTable, userHouseBundles as userHouseBundlesTable, users as usersTable, coinPurchases, deletedAccounts } from "@shared/schema";
import { db } from "./db";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import sharp from "sharp";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Para Pets <noreply@parapets.net>";

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
const APP_URL = process.env.APP_URL || "https://parapets.net";

// ── Email verification helper ─────────────────────────────────────────────────
async function sendVerificationEmail(userId: string, email: string, username: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await storage.setEmailVerificationToken(userId, token, expires);
  const verifyUrl = `${APP_URL}/api/auth/verify-email/${token}`;
  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "🐾 Para Pets — Verify Your Email",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Para Pets — Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0805;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d0805;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${APP_URL}/logo_parapets.png" alt="Para Pets" width="180" style="display:block;max-width:180px;" />
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:linear-gradient(180deg,#1e1208 0%,#150d06 100%);border-radius:16px;border:1px solid #6a4a20;box-shadow:0 0 40px rgba(0,0,0,0.8),inset 0 1px 0 rgba(212,160,23,0.2);overflow:hidden;">

              <!-- Gold top accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent);"></td>
                </tr>
              </table>

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:28px 32px 20px;background:linear-gradient(180deg,rgba(212,160,23,0.08) 0%,transparent 100%);">
                    <p style="margin:0 0 6px;font-size:11px;letter-spacing:4px;color:#8a6a30;text-transform:uppercase;">Account Setup</p>
                    <h1 style="margin:0;font-size:26px;color:#f0c040;letter-spacing:2px;text-shadow:0 0 20px rgba(240,192,64,0.3);">Verify Your Email</h1>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.4),transparent);"></div>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 32px;">
                    <p style="margin:0 0 8px;font-size:15px;color:#c8a870;">
                      Welcome, <strong style="color:#f0c040;">${username}</strong>!
                    </p>
                    <p style="margin:0 0 24px;font-size:14px;color:#a89878;line-height:1.7;">
                      Thanks for joining Para Pets! Click the button below to verify your email address and unlock all rewards. This link is valid for <strong style="color:#d4b896;">24 hours</strong>.
                    </p>

                    <!-- CTA button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:8px 0 28px;">
                          <a href="${verifyUrl}"
                            style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#4a2d6f 0%,#2d1a4a 100%);color:#d4a8ff;text-decoration:none;border-radius:10px;font-size:16px;font-family:Georgia,serif;letter-spacing:1px;border:1px solid rgba(180,120,255,0.4);box-shadow:0 0 20px rgba(180,120,255,0.15),0 4px 16px rgba(0,0,0,0.5);">
                            ✦ &nbsp;Verify My Email&nbsp; ✦
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.2),transparent);margin-bottom:20px;"></div>

                    <!-- Note -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(106,72,32,0.3);">
                      <tr>
                        <td style="padding:16px 18px;">
                          <p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;color:#6a4820;text-transform:uppercase;">Didn't sign up?</p>
                          <p style="margin:0;font-size:13px;color:#7a6040;line-height:1.6;">
                            You can safely ignore this email — no account will be active without verification.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Bottom divider -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.3),transparent);"></div>
                  </td>
                </tr>
              </table>

              <!-- Footer link -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:20px 32px 28px;" align="center">
                    <p style="margin:0 0 10px;font-size:11px;color:#4a3820;letter-spacing:2px;">BUTTON NOT WORKING?</p>
                    <p style="margin:0;font-size:11px;color:#5a4828;word-break:break-all;line-height:1.6;">
                      <a href="${verifyUrl}" style="color:#6a7a50;">${verifyUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Gold bottom accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent);"></td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer below card -->
          <tr>
            <td align="center" style="padding:24px 16px 8px;">
              <p style="margin:0;font-size:11px;color:#3a2a18;letter-spacing:3px;">PARA PETS &copy; 2026</p>
              <p style="margin:6px 0 0;font-size:11px;color:#2a1e10;">
                <a href="${APP_URL}" style="color:#4a3820;text-decoration:none;">parapets.net</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  });
}

const COIN_PACKS = [
  { id: "pack_v2_100",   coins: 100,   priceUsd: 1,   label: "100 Coins" },
  { id: "pack_v2_1000",  coins: 1000,  priceUsd: 5,   label: "1,000 Coins" },
  { id: "pack_v2_2500",  coins: 2500,  priceUsd: 10,  label: "2,500 Coins" },
  { id: "pack_v2_7500",  coins: 7500,  priceUsd: 25,  label: "7,500 Coins" },
  { id: "pack_v2_20000", coins: 20000, priceUsd: 50,  label: "20,000 Coins" },
  { id: "pack_v2_50000", coins: 50000, priceUsd: 100, label: "50,000 Coins" },
];

// Spirit-of-Veridia community gift: scales with the new bundle progression.
// Roughly 1/10 of the purchaser's coin pack so bigger purchases bless the
// realm more generously without trivializing smaller ones.
function communityRewardCoinsForUsd(amountUsd: number): number {
  const tiered: Record<number, number> = { 1: 10, 5: 50, 10: 100, 25: 500, 50: 1000, 100: 2500 };
  if (tiered[amountUsd]) return tiered[amountUsd];
  // Fallback for any non-standard amount: 10 coins per dollar.
  return Math.max(1, amountUsd * 10);
}

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

async function isAuthenticated(req: Request, res: Response, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as any;
  if (user.isBanned) {
    if (user.banUntil && new Date(user.banUntil) <= new Date()) {
      await storage.unbanUser(user.id);
      return next();
    }
    req.logout(() => {});
    return res.status(403).json({ message: "This account has been banished from the realm" });
  }
  return next();
}

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
  if (shop.type === "edibles") return shop.statBoostAmount ? `+${shop.statBoostAmount} LVL pts` : null;
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
  const config = await getWelcomeBundleConfig();
  const bundle = await storage.createRewardBundle("Welcome to the Realm!", config.coinAmount, config.message);
  await storage.createUserReward(userId, bundle.id);
  const allShopItems = await storage.getAllShopItems();
  const find = (name: string) => allShopItems.find(i => i.name.toLowerCase() === name.toLowerCase());
  console.log(`[WelcomeBundle] Creating bundle for user ${userId}. Shop has ${allShopItems.length} items.`);
  for (const { name, qty } of config.items) {
    const item = find(name);
    if (item) {
      console.log(`[WelcomeBundle] Found item: "${item.name}" (${item.id})`);
      for (let i = 0; i < qty; i++) {
        await storage.addRewardBundleItem(bundle.id, item.id);
      }
    } else {
      console.warn(`[WelcomeBundle] Item NOT found: "${name}"`);
    }
  }
  await storage.setWelcomeV2Sent(userId);
}

async function ensureAdminAccount() {
  try {
    const adminEmail = "paradox.esctacyartistry@gmail.com";
    const user = await storage.getUserByEmail(adminEmail);
    if (user && !user.isAdmin) {
      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
      console.log("Set admin flag for", user.username);
    }
  } catch (err) {
    console.error("Admin setup error:", err);
  }
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

async function getOrCreateAcquisitionBadge(key: keyof typeof ACQUISITION_BADGES): Promise<string> {
  const meta = ACQUISITION_BADGES[key];
  const existing = await storage.getBadgeByName(meta.name);
  if (existing) return existing.id;
  const badge = await storage.createBadge(meta.name, meta.svgUrl, meta.dailyRewardCoins, meta.points, meta.claimType);
  return badge.id;
}

async function maybeAwardAcquisitionBadges(userId: string, purchaseAmountUsd: number): Promise<void> {
  try {
    if (purchaseAmountUsd >= 10) {
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

async function postWatcherMessage(message: string): Promise<void> {
  try {
    await storage.addWorldChatMessage({
      userId: VERIDIAN_WATCHER_ID,
      username: "Veridian Watcher",
      profileImage: null,
      message,
      isBot: true,
    });
    storage.purgeOldWorldChatMessages().catch(() => {});
  } catch (err) {
    console.error("[VW] Failed to post message:", err);
  }
}

// Community reward — triggered when any player buys a coin bundle
// All OTHER players receive coins via a gift bundle (10 coins per $1 spent)
async function grantCommunityPurchaseReward(purchaserId: string, amountUsd: number): Promise<void> {
  try {
    const rewardCoins = communityRewardCoinsForUsd(amountUsd);
    const allUsers = await storage.getAllUsers();
    // Admins are excluded from the Spirit of Veridia community gift
    const recipients = allUsers.filter(u => !u.isAdmin);
    if (recipients.length === 0) return;

    const bundle = await storage.createRewardBundle(
      "A Blessing from the Spirit of Veridia",
      rewardCoins,
      `A generous soul has contributed to the realm's growth, and the Spirit of Veridia has blessed you with ${rewardCoins} coins. Claim your gift!`
    );
    await Promise.all(recipients.map(u => storage.createUserReward(u.id, bundle.id)));

    await postWatcherMessage(
      `🌟 A generous soul has contributed to the realm's growth, so the Spirit of Veridia has blessed us all! Every adventurer has received a gift — check your gift inbox to claim it.`
    );
    console.log(`[Community Reward] Granted ${rewardCoins} coins to ${recipients.length} players (purchase: $${amountUsd})`);
  } catch (err) {
    console.error("[Community Reward] Failed to grant community reward:", err);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await ensureAdminAccount();
  seedWorldBackgrounds();

  app.use("/api/admin", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password, profileImageData } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }

      if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/.test(username)) {
        return res.status(400).json({ field: "username", message: "Username can only contain letters, numbers, underscores, and periods (periods cannot be at the start or end)" });
      }
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ field: "username", message: "Username must be between 3 and 20 characters" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ field: "email", message: "Please enter a valid email address" });
      }

      if (password.length < 6) {
        return res.status(400).json({ field: "password", message: "Password must be at least 6 characters" });
      }

      const existingUsername = await storage.getUserByUsernameCaseInsensitive(username);
      if (existingUsername) {
        return res.status(400).json({ field: "username", message: "That username is already taken. Please choose another." });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ field: "email", message: "That email is already registered. Try logging in instead." });
      }

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deletedRows = await db
        .select({ deletedAt: deletedAccounts.deletedAt })
        .from(deletedAccounts)
        .where(and(eq(deletedAccounts.email, email.toLowerCase()), gt(deletedAccounts.deletedAt, thirtyDaysAgo)))
        .limit(1);
      if (deletedRows.length > 0) {
        const eligibleAt = new Date(deletedRows[0].deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((eligibleAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return res.status(400).json({ field: "email", message: `This email was used on a recently deleted account. You can register again in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}.` });
      }

      let profileImagePath: string | null = null;

      if (profileImageData) {
        try {
          const base64Data = profileImageData.replace(/^data:image\/\w+;base64,/, "");
          const imageBuffer = Buffer.from(base64Data, "base64");
          const resized = await sharp(imageBuffer)
            .resize(500, 500, { fit: "cover", position: "center" })
            .jpeg({ quality: 85 })
            .toBuffer();
          profileImagePath = `data:image/jpeg;base64,${resized.toString("base64")}`;
        } catch (imgErr) {
          console.error("Image processing error:", imgErr);
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const adminEmail = "paradox.esctacyartistry@gmail.com";
      const shouldBeAdmin = email.toLowerCase() === adminEmail.toLowerCase();
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        profileImage: profileImagePath,
        isAdmin: shouldBeAdmin,
        coins: 0,
      });

      try {
        await grantWelcomeV2Bundle(user.id);
      } catch (rewardErr) {
        console.error("Failed to create welcome reward, giving coins directly:", rewardErr);
        await storage.addCoins(user.id, 500);
        await storage.setWelcomeV2Sent(user.id);
      }

      // Auto-grant all free house bundles and set the first one as active
      try {
        const freeBundles = await db.select().from(houseBundlesTable).where(eq(houseBundlesTable.price, 0));
        let firstBundleId: string | null = null;
        for (const bundle of freeBundles) {
          await storage.grantUserHouseBundle(user.id, bundle.id);
          if (!firstBundleId) firstBundleId = bundle.id;
        }
        if (firstBundleId) await storage.setActiveHouseBundle(user.id, firstBundleId);
      } catch (bundleErr) {
        console.error("Failed to auto-grant free house bundle:", bundleErr);
      }

      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        if (shouldBeAdmin) {
          storage.verifyEmail(user.id).catch(e => console.error("Admin auto-verify failed:", e));
        } else {
          sendVerificationEmail(user.id, user.email, user.username)
            .catch(e => console.error("Verification email failed:", e));
        }
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
    } catch (err: any) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // ── Public: check maintenance mode ───────────────────────────────────────
  app.get("/api/maintenance-status", async (_req, res) => {
    try {
      const val = await storage.getGameSetting("maintenance_mode");
      return res.json({ maintenance: val === "true" });
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
      return res.json({ maintenance: enabled });
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
        // Veridian Watcher login greeting — strictly once per 3-hour window per user (persisted)
        try {
          if (user.watcherShoutoutsEnabled !== false) {
            const now = Date.now();
            const lastGreeted = user.lastWatcherGreetedAt ? new Date(user.lastWatcherGreetedAt).getTime() : 0;
            const cooldownPassed = now - lastGreeted >= LOGIN_GREETING_COOLDOWN_MS;
            if (cooldownPassed) {
              await storage.setLastWatcherGreetedAt(user.id, new Date()).catch(() => {});
              const greetings = [
                `🌿 Welcome back, ${user.username}! The realm stirs at your return.`,
                `🌿 Ah, ${user.username} arrives. The wilds have missed you.`,
                `🌿 ${user.username} steps into the realm once more. Adventure awaits!`,
                `🌿 The Watcher sees you, ${user.username}. May fortune guide your path.`,
                `🌿 ${user.username} has returned! The creatures of the realm rejoice.`,
                `🌿 Greetings, ${user.username}. The enchanted forests are yours to explore.`,
                `🌿 ${user.username} walks among us again. Good to have you back, traveller.`,
              ];
              const msg = greetings[Math.floor(Math.random() * greetings.length)];
              await postWatcherMessage(msg);
            }
          }
        } catch (e) { console.error("[VW] Login greeting failed:", e); }
        const freshUser = await storage.getUser(user.id);
        const { password: _, ...safeUser } = freshUser ?? user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      return res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", isAuthenticated, (req, res) => {
    const user = req.user as any;
    const { password: _, ...safeUser } = user;
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

  app.get("/api/auth/reset-password/:token", async (req, res) => {
    try {
      const user = await storage.getUserByResetToken((req.params.token as string));
      if (!user) {
        return res.status(404).json({ valid: false, message: "Invalid or expired reset link" });
      }
      if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
        await storage.clearPasswordResetToken(user.id);
        return res.status(400).json({ valid: false, message: "Reset link has expired" });
      }
      return res.json({ valid: true });
    } catch (err) {
      console.error("Validate reset token error:", err);
      return res.status(500).json({ valid: false, message: "Failed to validate token" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const user = await storage.getUserByResetToken(token);
      if (!user) {
        return res.status(404).json({ message: "Invalid or expired reset link" });
      }
      if (user.passwordResetExpires && new Date() > new Date(user.passwordResetExpires)) {
        await storage.clearPasswordResetToken(user.id);
        return res.status(400).json({ message: "Reset link has expired" });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updatePassword(user.id, hashedPassword);
      await storage.clearPasswordResetToken(user.id);
      return res.json({ message: "Password has been reset successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { emailOrUsername } = req.body;
      if (!emailOrUsername || typeof emailOrUsername !== "string") {
        return res.status(400).json({ message: "Email or username is required" });
      }
      const input = emailOrUsername.trim().toLowerCase();
      let user = await storage.getUserByEmail(input);
      if (!user) {
        user = await storage.getUserByUsernameCaseInsensitive(input);
      }
      // Always return success to prevent email/username enumeration
      if (!user || !user.email) {
        return res.json({ message: "If that account exists, a reset link has been sent" });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await storage.setPasswordResetToken(user.id, token, expires);
      const resetUrl = `${APP_URL}/reset-password/${token}`;
      const emailResult = await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: "🐾 Para Pets — Password Reset",
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Para Pets — Password Reset</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0805;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d0805;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <img src="${APP_URL}/logo_parapets.png" alt="Para Pets" width="180" style="display:block;max-width:180px;" />
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:linear-gradient(180deg,#1e1208 0%,#150d06 100%);border-radius:16px;border:1px solid #6a4a20;box-shadow:0 0 40px rgba(0,0,0,0.8),inset 0 1px 0 rgba(212,160,23,0.2);overflow:hidden;">

              <!-- Gold top accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent);"></td>
                </tr>
              </table>

              <!-- Header band -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:28px 32px 20px;background:linear-gradient(180deg,rgba(212,160,23,0.08) 0%,transparent 100%);">
                    <p style="margin:0 0 6px;font-size:11px;letter-spacing:4px;color:#8a6a30;text-transform:uppercase;">Account Security</p>
                    <h1 style="margin:0;font-size:26px;color:#f0c040;letter-spacing:2px;text-shadow:0 0 20px rgba(240,192,64,0.3);">Password Reset</h1>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.4),transparent);"></div>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 32px;">
                    <p style="margin:0 0 8px;font-size:15px;color:#c8a870;">
                      Greetings, <strong style="color:#f0c040;">${user.username}</strong>!
                    </p>
                    <p style="margin:0 0 24px;font-size:14px;color:#a89878;line-height:1.7;">
                      A password reset was requested for your Para Pets account. Click the button below to choose a new password. This link is valid for <strong style="color:#d4b896;">1 hour</strong> — after that it will expire and you'll need to request a new one.
                    </p>

                    <!-- CTA button -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:8px 0 28px;">
                          <a href="${resetUrl}"
                            style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#2d6a4f 0%,#1a4a2e 100%);color:#7fffd4;text-decoration:none;border-radius:10px;font-size:16px;font-family:Georgia,serif;letter-spacing:1px;border:1px solid rgba(127,255,212,0.4);box-shadow:0 0 20px rgba(127,255,212,0.15),0 4px 16px rgba(0,0,0,0.5);">
                            ✦ &nbsp;Reset My Password&nbsp; ✦
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.2),transparent);margin-bottom:20px;"></div>

                    <!-- Safety note -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.3);border-radius:8px;border:1px solid rgba(106,72,32,0.3);">
                      <tr>
                        <td style="padding:16px 18px;">
                          <p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;color:#6a4820;text-transform:uppercase;">Didn't request this?</p>
                          <p style="margin:0;font-size:13px;color:#7a6040;line-height:1.6;">
                            You can safely ignore this email — your password will remain unchanged and your account is secure.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Bottom divider -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:0 32px;">
                    <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(212,160,23,0.3),transparent);"></div>
                  </td>
                </tr>
              </table>

              <!-- Footer -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:20px 32px 28px;" align="center">
                    <p style="margin:0 0 10px;font-size:11px;color:#4a3820;letter-spacing:2px;">BUTTON NOT WORKING?</p>
                    <p style="margin:0;font-size:11px;color:#5a4828;word-break:break-all;line-height:1.6;">
                      <a href="${resetUrl}" style="color:#6a7a50;">${resetUrl}</a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Gold bottom accent line -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="height:3px;background:linear-gradient(90deg,transparent,#d4a017,#f0c040,#d4a017,transparent);"></td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer below card -->
          <tr>
            <td align="center" style="padding:24px 16px 8px;">
              <p style="margin:0;font-size:11px;color:#3a2a18;letter-spacing:3px;">PARA PETS &copy; 2026</p>
              <p style="margin:6px 0 0;font-size:11px;color:#2a1e10;">
                <a href="${APP_URL}" style="color:#4a3820;text-decoration:none;">parapets.net</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      });
      if (emailResult.error) {
        console.error("Forgot password email send error:", emailResult.error);
      }
      // Always return success — never reveal whether the account/email exists
      return res.json({ message: "If that account exists, a reset link has been sent" });
    } catch (err) {
      console.error("Forgot password error:", err);
      return res.status(500).json({ message: "Failed to send reset email" });
    }
  });

  // ── Email verification — click link from email ────────────────────────────
  app.get("/api/auth/verify-email/:token", async (req, res) => {
    try {
      const { token } = req.params as { token: string };
      const user = await storage.getUserByEmailVerificationToken(token);
      if (!user) {
        return res.redirect(`${APP_URL}/?verified=invalid`);
      }
      if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
        return res.redirect(`${APP_URL}/?verified=expired`);
      }
      if (user.emailVerified) {
        return res.redirect(`${APP_URL}/?verified=already`);
      }
      await storage.verifyEmail(user.id);
      // Update session user if logged in as this user
      if ((req.user as any)?.id === user.id) {
        (req.user as any).emailVerified = true;
      }
      // Veridian Watcher welcome message (fire-and-forget)
      if (user.watcherShoutoutsEnabled !== false) {
        postWatcherMessage(`🌿 A new soul stirs in the realm — welcome, ${user.username}! May your journey through Para Pets be filled with wonder and discovery. The wilds await you...`).catch(() => {});
      }
      return res.redirect(`${APP_URL}/?verified=1`);
    } catch (err) {
      console.error("Verify email error:", err);
      return res.redirect(`${APP_URL}/?verified=error`);
    }
  });

  // ── Resend verification email (60-second cooldown) ────────────────────────
  app.post("/api/auth/resend-verification", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) return res.status(404).json({ message: "User not found" });
      if (fullUser.emailVerified) {
        return res.status(400).json({ message: "Email is already verified" });
      }
      // Cooldown: if token was issued less than 60 seconds ago, reject
      if (fullUser.emailVerificationExpires) {
        const issuedAt = fullUser.emailVerificationExpires.getTime() - 24 * 60 * 60 * 1000;
        const cooldownUntil = issuedAt + 60 * 1000;
        if (Date.now() < cooldownUntil) {
          const secondsLeft = Math.ceil((cooldownUntil - Date.now()) / 1000);
          return res.status(429).json({ message: `Please wait ${secondsLeft}s before resending`, secondsLeft });
        }
      }
      await sendVerificationEmail(fullUser.id, fullUser.email, fullUser.username);
      return res.json({ message: "Verification email sent" });
    } catch (err) {
      console.error("Resend verification error:", err);
      return res.status(500).json({ message: "Failed to send verification email" });
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
      const { password: _, ...safeUser } = updated;
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

      const existing = await storage.getUserByUsername(username);
      if (existing && existing.id !== user.id) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const updated = await storage.updateUsername(user.id, username);
      const { password: _, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
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
      const { password: _, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
      console.error("Update profile image error:", err);
      return res.status(500).json({ message: "Failed to update profile image" });
    }
  });

  app.patch("/api/user/active-pet", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { activePetId } = req.body;

      if (activePetId !== null) {
        const invItem = await storage.getInventoryItemById(activePetId);
        if (!invItem || invItem.userId !== user.id) {
          return res.status(400).json({ message: "You don't own this pet" });
        }
        const shopItem = await storage.getShopItem(invItem.shopItemId);
        if (!shopItem || shopItem.type !== "pet") {
          return res.status(400).json({ message: "This item is not a pet" });
        }
      }

      const updated = await storage.updateActivePet(user.id, activePetId);
      const { password: _, ...safeUser } = updated;
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

  app.get("/api/users/:userId/badges", isAuthenticated, async (req, res) => {
    try {
      const badges = await storage.getUserBadges((req.params.userId as string));
      return res.json(badges);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

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
  // Hunger drains at HUNGER_DECAY_PER_MIN points per minute while the pet is
  // placed in the pet house (inside or outside). When hunger hits 0, mood
  // starts draining at MOOD_DECAY_PER_MIN. Both are clamped on each tick.
  const HUNGER_DECAY_PER_MIN = 1;     // 1 hunger pt / minute while placed
  // Mood drains while the pet is "hungry" (below 50% of its max hunger). Below
  // that threshold mood drops at MOOD_STARVE_DECAY_PER_MIN. On top of that,
  // pets that have not been fed OR petted in a while suffer a slow neglect
  // drain regardless of hunger. Recent battle defeats also push mood down.
  const MOOD_STARVE_DECAY_PER_MIN = 0.5;
  const MOOD_NEGLECT_DECAY_PER_MIN = 0.25;
  const NEGLECT_GRACE_MINUTES = 30;            // no neglect drain in first 30 min
  const HUNGRY_THRESHOLD_PCT = 0.5;            // <50% hunger = "hungry"
  const BATTLE_DEFEAT_RECENT_MINUTES = 60;     // recent defeat = last 60 min
  const BATTLE_DEFEAT_MOOD_CAP = 60;           // mood can't recover above 60
  async function applyPetTimeDecay(inv: any, isPlaced: boolean): Promise<{ petHunger: number; petMood: number }> {
    const maxHunger = Math.max(1, inv.petHealth ?? 1000);
    // First-touch initialization: -1 means "uninitialized" — start full.
    let hunger = inv.petHunger == null || inv.petHunger < 0 ? maxHunger : inv.petHunger;
    let mood = inv.petMood == null ? 100 : inv.petMood;
    const now = Date.now();
    const last = inv.petStatsUpdatedAt ? new Date(inv.petStatsUpdatedAt).getTime() : now;
    const minutes = Math.max(0, (now - last) / 60000);
    if (isPlaced && minutes > 0) {
      const newHunger = Math.max(0, hunger - HUNGER_DECAY_PER_MIN * minutes);
      // Starvation drain: applies only for the portion of the elapsed
      // interval the pet was actually below the 50% hunger threshold. We
      // figure out when (if ever) hunger crossed the threshold and only
      // charge mood for the time spent below it.
      const startHungerPct = hunger / maxHunger;
      const endHungerPct = newHunger / maxHunger;
      let starveMinutes = 0;
      if (endHungerPct < HUNGRY_THRESHOLD_PCT) {
        if (startHungerPct < HUNGRY_THRESHOLD_PCT) {
          // Already hungry the whole interval.
          starveMinutes = minutes;
        } else if (HUNGER_DECAY_PER_MIN > 0) {
          // Crossed below threshold during this interval — find when.
          const hungerAtThreshold = HUNGRY_THRESHOLD_PCT * maxHunger;
          const minutesToThreshold = (hunger - hungerAtThreshold) / HUNGER_DECAY_PER_MIN;
          starveMinutes = Math.max(0, minutes - minutesToThreshold);
        }
      }
      const starveDrain = MOOD_STARVE_DECAY_PER_MIN * starveMinutes;
      // Neglect drain: time since the pet was last fed OR petted (or
      // acquired). Adds a slow drain even for well-fed pets that aren't
      // interacted with.
      const careRefMs = Math.max(
        inv.lastFedAt ? new Date(inv.lastFedAt).getTime() : 0,
        inv.lastPettedAt ? new Date(inv.lastPettedAt).getTime() : 0,
        inv.acquiredAt ? new Date(inv.acquiredAt).getTime() : 0,
      );
      const careGapMin = careRefMs ? Math.max(0, (now - careRefMs) / 60000) : 0;
      const neglectActiveMin = Math.max(0, Math.min(minutes, careGapMin - NEGLECT_GRACE_MINUTES));
      const neglectDrain = neglectActiveMin * MOOD_NEGLECT_DECAY_PER_MIN;
      let newMood = Math.max(0, mood - starveDrain - neglectDrain);
      // Cap mood while the pet is still smarting from a recent battle defeat.
      if (inv.lastBattleDefeatAt) {
        const sinceDefeatMin = (now - new Date(inv.lastBattleDefeatAt).getTime()) / 60000;
        if (sinceDefeatMin < BATTLE_DEFEAT_RECENT_MINUTES) {
          newMood = Math.min(newMood, BATTLE_DEFEAT_MOOD_CAP);
        }
      }
      hunger = Math.round(newHunger);
      mood = Math.round(newMood);
    } else if (!isPlaced && (inv.petHunger == null || inv.petHunger < 0)) {
      // Not placed and never initialized — just persist a sane starting value
      // so the bar shows full immediately.
      hunger = maxHunger;
    }
    // Only persist when something actually changed. The previous version
    // wrote a row for every placed pet on every /api/inventory fetch (because
    // `minutes > 0` is essentially always true), which caused a write storm
    // that made the app feel like it was stalling/restarting under load.
    // We also only refresh the timestamp when at least 1 full minute has
    // passed AND values changed — small fractional minutes get rolled into
    // the next tick without a DB write.
    const changed = hunger !== inv.petHunger || mood !== inv.petMood;
    if (changed) {
      await storage.updateInventoryItem(inv.id, {
        petHunger: hunger,
        petMood: mood,
        petStatsUpdatedAt: new Date(),
      } as any);
      inv.petHunger = hunger;
      inv.petMood = mood;
      inv.petStatsUpdatedAt = new Date();
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

      // Apply hunger/mood time decay for every hatched pet. Pets that are
      // placed in the pet house lose hunger over time; pets sitting in
      // inventory are static.
      const placedPositions = await storage.getPetHousePositions(user.id);
      const placedSet = new Set(placedPositions.map((p) => p.inventoryId));
      await Promise.all(filteredRows.map(async ({ inventory: inv, shopItem }) => {
        if (shopItem?.type === "pet" && inv.isHatched) {
          await applyPetTimeDecay(inv, placedSet.has(inv.id));
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
        petTemplateId: shopItem?.petTemplateId || null,
        canFly: (shopItem as any)?.canFly ?? false,
        petNickname: inv.petNickname || null,
        hatchStartedAt: inv.hatchStartedAt,
        isHatched: inv.isHatched,
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
      }));
      return res.json(itemsWithDetails);
    } catch (err) {
      console.error("Get inventory error:", err);
      return res.status(500).json({ message: "Failed to get inventory" });
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
      const quantity = Math.min(Math.max(1, parseInt(req.body?.quantity ?? "1") || 1), 20);

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

      const totalCost = shopItem.price * (shopItem.type === "pet" ? 1 : quantity);

      // Atomic check-and-deduct: fails if coins < totalCost, preventing double-spend races
      const afterDeduct = await storage.atomicDeductCoins(user.id, totalCost);
      if (!afterDeduct) {
        return res.status(400).json({ message: "Not enough coins" });
      }

      const purchaseCount = shopItem.type === "pet" ? 1 : quantity;
      let invItem: any = null;

      if (shopItem.fishingType === "bait") {
        // Bait stacks: each purchase gives 5 charges stacked onto one inventory row
        const baitChargesPerPurchase = 5;
        invItem = await storage.addToInventory(user.id, itemId, {}, baitChargesPerPurchase * purchaseCount);
      } else {
        for (let i = 0; i < purchaseCount; i++) {
          const extraFields: any = {};
          if (shopItem.fishingType === "pole" && shopItem.poleMaxUses != null) {
            extraFields.poleUsesLeft = shopItem.poleMaxUses;
          }
          invItem = await storage.addToInventory(user.id, itemId, extraFields);
          if (shopItem.type === "pet" && shopItem.hatchTime) {
            const updated = await storage.updateInventoryItem(invItem.id, { hatchStartedAt: new Date() });
            if (updated) invItem = updated;
          }
        }
      }

      const { password: _, ...safeUser } = afterDeduct;

      // Veridian Watcher congratulation for first 4/5-star pet acquisition
      if (shopItem.type === "pet" && isFirstPetAcquisition && (shopItem.starRarity ?? 0) >= 4) {
        const stars = "⭐".repeat(shopItem.starRarity ?? 4);
        if (user.watcherShoutoutsEnabled !== false) {
          postWatcherMessage(`✨ The stars align! ${user.username} has just acquired the rare ${stars} ${shopItem.name}! A magnificent addition to their collection — well done, adventurer!`).catch(() => {});
        }
      }

      return res.json({ inventory: invItem, user: safeUser, quantity: purchaseCount });
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
      if (invItem.hatchStartedAt && shopItem.hatchTime) {
        const elapsed = Date.now() - new Date(invItem.hatchStartedAt).getTime();
        const required = shopItem.hatchTime * 3600000;
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

  app.get("/api/pet/:inventoryId/accessories", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const petInv = await storage.getInventoryItemById(inventoryId);
      if (!petInv || petInv.userId !== user.id) return res.status(404).json({ message: "Pet not found" });
      const equipped = await storage.getPetEquippedAccessories(inventoryId);
      return res.json(equipped);
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
      if (!accShopItem || accShopItem.type !== "accessory") return res.status(400).json({ message: "Item is not an accessory" });
      const currentEquipped = await storage.getPetEquippedAccessories(inventoryId);
      if (currentEquipped.length >= 3) return res.status(400).json({ message: "All 3 accessory slots are full" });
      if (currentEquipped.find(e => e.accessoryInventoryId === accessoryInventoryId)) return res.status(400).json({ message: "Accessory already equipped" });
      const equipped = await storage.equipAccessory(inventoryId, accessoryInventoryId);
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

      const rarity = petShopItem.rarity || 1;
      // 1-2 star pets: 2 slots/level; 3-5 star pets: 3 slots/level
      const maxItemsPerLevel = rarity <= 2 ? 2 : 3;
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

      const updatedPet = await storage.updateInventoryItem(petInv.id, updates);
      await storage.removeFromInventory(itemInv.id);

      return res.json(updatedPet);
    } catch (err) {
      console.error("Power up error:", err);
      return res.status(500).json({ message: "Failed to power up pet" });
    }
  });

  app.post("/api/pet/:inventoryId/use-special", isAuthenticated, async (req, res) => {
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
        if (!petInv.hatchStartedAt) {
          return res.status(400).json({ message: "Egg has not started hatching" });
        }
        const currentStart = new Date(petInv.hatchStartedAt);
        const minutesInMs = specialAmount * 60 * 1000;
        const newStart = new Date(currentStart.getTime() - minutesInMs);
        await storage.updateInventoryItem(petInv.id, { hatchStartedAt: newStart });
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
        await storage.updateInventoryItem(petInv.id, updates);
      } else {
        return res.status(400).json({ message: "Unknown special type" });
      }

      await storage.removeFromInventory(itemInv.id);
      const updatedPet = await storage.getInventoryItemById(petInv.id);
      return res.json(updatedPet);
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

      // Petting nudges mood up only when the pet isn't too hungry (>= 50%
      // of max hunger). The petting timestamp is always recorded so the
      // neglect-decay clock resets even when the mood gain is gated out.
      const pettedPet = await storage.getInventoryItemById(inventoryId);
      if (pettedPet && pettedPet.userId === user.id) {
        const maxH = Math.max(1, pettedPet.petHealth ?? 1000);
        const curH = pettedPet.petHunger == null || pettedPet.petHunger < 0 ? maxH : pettedPet.petHunger;
        const moodGain = (curH / maxH) >= 0.5 ? 3 : 0;
        let newMood = Math.min(100, (pettedPet.petMood ?? 100) + moodGain);
        // Recent battle defeats cap how high mood can rise.
        if (pettedPet.lastBattleDefeatAt) {
          const sinceDefeatMin = (Date.now() - new Date(pettedPet.lastBattleDefeatAt).getTime()) / 60000;
          if (sinceDefeatMin < BATTLE_DEFEAT_RECENT_MINUTES) {
            newMood = Math.min(newMood, BATTLE_DEFEAT_MOOD_CAP);
          }
        }
        await storage.updateInventoryItem(inventoryId, {
          petMood: newMood,
          lastPettedAt: new Date(),
          petStatsUpdatedAt: new Date(),
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
        return res.json({ rewarded: true, coins: updated.coins, amount: 10 });
      }

      // Pet has already given its daily max → animation only.
      if (countSoFar >= MAX_REWARDS_PER_DAY) {
        const u = await storage.getUser(user.id);
        return res.json({ rewarded: false, coins: u?.coins ?? 0 });
      }

      // Random chance for each extra reward beyond the first.
      if (Math.random() > EXTRA_REWARD_CHANCE) {
        // Persist that we made an attempt? Intentionally no — keep extra
        // attempts cheap so a determined player can still hit the cap of 5.
        const u = await storage.getUser(user.id);
        return res.json({ rewarded: false, coins: u?.coins ?? 0 });
      }

      const amount = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5
      const updated = await storage.addCoins(user.id, amount);
      await storage.setPetPettingState(user.id, inventoryId, now, countSoFar + 1);
      return res.json({ rewarded: true, coins: updated.coins, amount });
    } catch (err) {
      console.error("Petting reward error:", err);
      return res.status(500).json({ message: "Failed to grant petting reward" });
    }
  });

  app.post("/api/pet/:inventoryId/feed-edible", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId } = req.body;

      const petInv = await storage.getInventoryItemById((req.params.inventoryId as string));
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }
      const ediblePetLevel = petInv.petLevel || 1;

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Edible not found in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "edibles") {
        return res.status(400).json({ message: "Not an edible item" });
      }

      // Edibles grant "feed points" (lifetime tally) AND restore the pet's
      // hunger meter by the same amount, capped at the pet's HP. Mood gets a
      // small immediate bump too, since the pet is happy after eating.
      const feedPoints = itemShopItem.statBoostAmount || 5;
      const maxHunger = Math.max(1, petInv.petHealth ?? 1000);
      const currentHunger = petInv.petHunger == null || petInv.petHunger < 0 ? maxHunger : petInv.petHunger;
      const newHunger = Math.min(maxHunger, currentHunger + feedPoints);
      // Mood gain on feed is small overall, and even smaller when the pet was
      // already too hungry to enjoy the meal. This keeps the mood bar harder
      // to fill — feeding alone can't max it out.
      const wasHungry = (currentHunger / maxHunger) < 0.5;
      const moodGain = wasHungry ? 2 : 5;
      let newMood = Math.min(100, (petInv.petMood ?? 100) + moodGain);
      // Recent battle defeats cap how high mood can rise.
      if (petInv.lastBattleDefeatAt) {
        const sinceDefeatMin = (Date.now() - new Date(petInv.lastBattleDefeatAt).getTime()) / 60000;
        if (sinceDefeatMin < BATTLE_DEFEAT_RECENT_MINUTES) {
          newMood = Math.min(newMood, BATTLE_DEFEAT_MOOD_CAP);
        }
      }
      const updates: any = {
        petFeedPoints: (petInv.petFeedPoints || 0) + feedPoints,
        petHunger: newHunger,
        petMood: newMood,
        petStatsUpdatedAt: new Date(),
        lastFedAt: new Date(),
      };

      const updatedPet = await storage.updateInventoryItem(petInv.id, updates);
      await storage.removeFromInventory(itemInv.id);
      return res.json(updatedPet);
    } catch (err) {
      console.error("Feed edible error:", err);
      return res.status(500).json({ message: "Failed to feed edible" });
    }
  });

  // Give a "gift" item to a pet on the Pet Care page. Each gift adds the
  // item's giftPoints to the pet's loyalty meter (cap 1000) and is removed
  // from inventory. Loyalty is the only stat gifts affect.
  app.post("/api/pet/:inventoryId/give-gift", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId } = req.body;

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

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "gift") {
        return res.status(400).json({ message: "Not a gift item" });
      }

      const points = Math.max(0, itemShopItem.giftPoints || 0);
      const newLoyalty = Math.min(1000, (petInv.petLoyalty ?? 0) + points);
      const updated = await storage.updateInventoryItem(petInv.id, {
        petLoyalty: newLoyalty,
      } as any);
      await storage.removeFromInventory(itemInv.id);
      return res.json({ pet: updated, loyaltyAdded: points, petLoyalty: newLoyalty });
    } catch (err) {
      console.error("Give gift error:", err);
      return res.status(500).json({ message: "Failed to give gift" });
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
      const newMood = Math.max(0, (petInv.petMood ?? 100) - 10);
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
      const { password: _, ...safeUser } = updatedUser!;

      return res.json({ pet: updatedPet, user: safeUser });
    } catch (err) {
      console.error("Reset stats error:", err);
      return res.status(500).json({ message: "Failed to reset stats" });
    }
  });

  app.get("/api/coins/packs", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const dailyTotal = await storage.getDailyPurchaseTotal(user.id);
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
    try {
      const user = req.user as any;
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "Session ID required" });
      }

      const existing = await storage.getCoinPurchaseBySessionId(sessionId);
      if (existing) {
        const updatedUser = await storage.getUser(user.id);
        const { password: _, ...safeUser } = updatedUser!;
        return res.json({ alreadyCredited: true, coins: existing.coinsReceived, user: safeUser });
      }

      const stripe = await getUncachableStripeClient();
      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);

      if (stripeSession.payment_status !== 'paid') {
        return res.status(400).json({ message: "Payment not completed" });
      }

      if (stripeSession.metadata?.userId !== user.id) {
        return res.status(403).json({ message: "This purchase does not belong to you" });
      }

      const coins = parseInt(stripeSession.metadata?.coins || "0");
      const amountUsd = parseInt(stripeSession.metadata?.amountUsd || "0");

      if (coins <= 0) {
        return res.status(400).json({ message: "Invalid coin amount" });
      }

      const amountPaidCents = stripeSession.amount_total;
      if (amountPaidCents && amountPaidCents !== amountUsd * 100) {
        return res.status(400).json({ message: "Payment amount mismatch" });
      }

      let updatedUser;
      try {
        await storage.createCoinPurchase(user.id, amountUsd, coins, sessionId);
        // addCoins returns the updated user — avoid an extra round-trip
        updatedUser = await storage.addCoins(user.id, coins);
        // Fire community reward + badge awards in the background so the player's
        // verification overlay closes as fast as possible.
        grantCommunityPurchaseReward(user.id, amountUsd).catch(() => {});
        maybeAwardAcquisitionBadges(user.id, amountUsd).catch(() => {});
      } catch (err: any) {
        if (err.code === '23505') {
          const u = await storage.getUser(user.id);
          const { password: _, ...safeU } = u!;
          return res.json({ alreadyCredited: true, coins, user: safeU });
        }
        throw err;
      }

      const { password: _, ...safeUser } = updatedUser!;
      return res.json({ credited: true, coins, user: safeUser });
    } catch (err) {
      console.error("Verify purchase error:", err);
      return res.status(500).json({ message: "Failed to verify purchase" });
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

  function isAdmin(req: Request, res: Response, next: any) {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    return next();
  }

  app.get("/api/admin/support-messages", isAdmin, async (_req, res) => {
    try {
      const messages = await storage.getAllSupportMessages();
      return res.json(messages);
    } catch (err) {
      console.error("Get support messages error:", err);
      return res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.patch("/api/admin/support-messages/:id/read", isAdmin, async (req, res) => {
    try {
      await storage.markSupportMessageRead((req.params.id as string));
      return res.json({ message: "Marked as read" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update message" });
    }
  });

  app.delete("/api/admin/support-messages/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteSupportMessage((req.params.id as string));
      return res.json({ message: "Message deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete message" });
    }
  });

  app.post("/api/admin/support-messages/:id/respond", isAdmin, async (req, res) => {
    try {
      const { response, username, subject } = req.body;
      if (!response || typeof response !== "string" || !response.trim()) {
        return res.status(400).json({ message: "Response is required" });
      }
      if (!username || typeof username !== "string") {
        return res.status(400).json({ message: "Username is required" });
      }
      const messageSubject = subject ? `Re: ${subject}` : "Message from Admin";
      console.log(`[admin-respond] Writing admin message for username="${username.trim()}" subject="${messageSubject}"`);
      await storage.createAdminMessage(username.trim(), messageSubject, response.trim());
      console.log(`[admin-respond] Success — message stored for "${username.trim()}"`);
      return res.json({ message: "Response sent" });
    } catch (err) {
      console.error("[admin-respond] DB error:", err);
      return res.status(500).json({ message: "Failed to send response" });
    }
  });

  app.get("/api/admin-messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      const user = req.user as any;
      console.log(`[admin-messages] Fetching messages for username="${user.username}"`);
      const msgs = await storage.getAdminMessagesByUsername(user.username);
      console.log(`[admin-messages] Found ${msgs.length} message(s) for "${user.username}"`);
      return res.json(msgs);
    } catch (err) {
      console.error("[admin-messages] DB error:", err);
      return res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.delete("/api/admin-messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    try {
      await storage.deleteAdminMessage(req.params.id as string);
      return res.json({ message: "Deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete message" });
    }
  });

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
      const safeUsers = allUsers.map(({ password: _, ...u }) => u);
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
      const { password: _, ...safe } = updated;
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
      const { password: _, ...safe } = updated;
      return res.json(safe);
    } catch (err) {
      console.error("Ban user error:", err);
      return res.status(500).json({ message: "Failed to banish user" });
    }
  });

  app.post("/api/admin/unban/:userId", isAdmin, async (req, res) => {
    try {
      const updated = await storage.unbanUser((req.params.userId as string));
      const { password: _, ...safe } = updated;
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
      const { password: _, ...safe } = updated;
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

  app.get("/api/settings/map-background", async (_req, res) => {
    try {
      const bgUrl = await storage.getGameSetting("map_background");
      return res.json({ bgUrl });
    } catch (err) {
      console.error("Get map background error:", err);
      return res.status(500).json({ message: "Failed to get map background" });
    }
  });

  app.patch("/api/admin/settings/map-background", isAdmin, async (req, res) => {
    try {
      const { imageData } = req.body;
      if (!imageData) {
        await storage.setGameSetting("map_background", "");
        return res.json({ bgUrl: null });
      }
      const processed = await processWorldImage(imageData, 2000);
      await storage.setGameSetting("map_background", processed);
      return res.json({ bgUrl: processed });
    } catch (err: any) {
      console.error("Set map background error:", err);
      return res.status(500).json({ message: err.message || "Failed to update map background" });
    }
  });

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

      const { name, glowColor, iconData, bgData, skyImageData, groundImageData } = req.body;
      const updates: Record<string, any> = {};

      if (name && typeof name === "string" && name.trim()) updates.name = name.trim();
      if (glowColor && typeof glowColor === "string") updates.glowColor = glowColor;

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
      const slim = locations.map(({ bgUrl, ...rest }) => rest);
      return res.json(slim);
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
      const item = await storage.createWorldDecorItem({ worldId: (req.params.worldId as string), name, imageUrl });
      return res.status(201).json(item);
    } catch (err) {
      return res.status(500).json({ message: "Failed to create decor item" });
    }
  });

  app.patch("/api/admin/world/decor/items/:itemId", isAdmin, async (req, res) => {
    try {
      const { name, imageUrl, message } = req.body;
      await storage.updateWorldDecorItem((req.params.itemId as string), { name, imageUrl, message });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update decor item" });
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

  app.patch("/api/world/pet_world/pet-position", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { ownerUserId, posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number" || !ownerUserId) {
        return res.status(400).json({ message: "ownerUserId, posX, posY required" });
      }
      // Update in-memory position immediately
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
      if (typeof req.body.iconSize === "number") sanitized.iconSize = Math.max(64, Math.min(500, req.body.iconSize));

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

  app.get("/api/pet-template-parts/:templateId", isAuthenticated, async (req, res) => {
    try {
      const { templateId } = req.params as Record<string, string>;
      const cached = getCachedTemplateParts(templateId);
      if (cached) return res.json(cached);

      const [parts, template] = await Promise.all([
        storage.getPetTemplateParts(templateId),
        storage.getPetTemplate(templateId),
      ]);
      const result = { parts, facing: template?.facing ?? "front", canFly: template?.canFly ?? false };
      setCachedTemplateParts(templateId, result);
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
      return res.json(templates);
    } catch (err) {
      console.error("Get pet templates error:", err);
      return res.status(500).json({ message: "Failed to get pet templates" });
    }
  });

  app.get("/api/admin/pet-templates/:id", isAdmin, async (req, res) => {
    try {
      const template = await storage.getPetTemplate((req.params.id as string));
      if (!template) return res.status(404).json({ message: "Template not found" });
      const parts = await storage.getPetTemplateParts((req.params.id as string));
      return res.json({ ...template, parts });
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
      const { name, frontAssembled, backAssembled, facing, canFly, sleepingImageData, clearSleepingImage } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (frontAssembled !== undefined) updates.frontAssembled = frontAssembled;
      if (backAssembled !== undefined) updates.backAssembled = backAssembled;
      if (facing !== undefined) updates.facing = facing;
      if (canFly !== undefined) updates.canFly = canFly;
      if (sleepingImageData) updates.sleepingImageUrl = await processWorldImage(sleepingImageData, 1000);
      if (clearSleepingImage) updates.sleepingImageUrl = null;
      const updated = await storage.updatePetTemplate((req.params.id as string), updates);
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
      const { partType, view, imageData, posX, posY, width, height, zIndex, pivotX, pivotY } = req.body;
      if (!partType || !view || !imageData) {
        return res.status(400).json({ message: "partType, view, and imageData are required" });
      }
      const imageUrl = await processWorldImage(imageData, 1000);
      const part = await storage.createPetTemplatePart({
        templateId: (req.params.id as string),
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
      });
      return res.status(201).json(part);
    } catch (err) {
      console.error("Create pet template part error:", err);
      return res.status(500).json({ message: "Failed to add part" });
    }
  });

  app.patch("/api/admin/pet-template-parts/:partId", isAdmin, async (req, res) => {
    try {
      const { posX, posY, width, height, zIndex, pivotX, pivotY } = req.body;
      const updates: Record<string, any> = {};
      if (typeof posX === "number") updates.posX = posX;
      if (typeof posY === "number") updates.posY = posY;
      if (typeof width === "number") updates.width = width;
      if (typeof height === "number") updates.height = height;
      if (typeof zIndex === "number") updates.zIndex = zIndex;
      if (typeof pivotX === "number") updates.pivotX = Math.max(0, Math.min(100, pivotX));
      if (typeof pivotY === "number") updates.pivotY = Math.max(0, Math.min(100, pivotY));
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
      const viewParts = parts.filter(p => p.view === view).sort((a, b) => a.zIndex - b.zIndex);

      if (viewParts.length === 0) {
        return res.status(400).json({ message: `No ${view} parts to assemble` });
      }

      const cw = Math.min(canvasWidth, 1000);
      const ch = Math.min(canvasHeight, 1000);

      const composites: { input: Buffer; left: number; top: number; width: number; height: number }[] = [];

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
        const resized = await sharp(buf)
          .resize(Math.max(1, Math.round(part.width)), Math.max(1, Math.round(part.height)), { fit: "fill" })
          .png()
          .toBuffer();
        composites.push({
          input: resized,
          left: Math.max(0, Math.round(part.posX)),
          top: Math.max(0, Math.round(part.posY)),
          width: Math.round(part.width),
          height: Math.round(part.height),
        });
      }

      const assembled = await sharp({
        create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      })
        .composite(composites.map(c => ({ input: c.input, left: c.left, top: c.top })))
        .png()
        .toBuffer();

      const assembledDataUrl = `data:image/png;base64,${assembled.toString("base64")}`;

      const updates: Record<string, any> = {};
      if (view === "front") updates.frontAssembled = assembledDataUrl;
      else updates.backAssembled = assembledDataUrl;

      const updated = await storage.updatePetTemplate((req.params.id as string), updates);
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

  function processShopItemImage(imageData: string): Promise<string> {
    return processWorldImage(imageData, 2000);
  }

  app.post("/api/admin/shop", isAdmin, async (req, res) => {
    try {
      const { imageData, eggImageData, hatchedImageData, hooklessImageData, ...itemData } = req.body;
      const parse = insertShopItemSchema.safeParse(itemData);
      if (!parse.success) {
        return res.status(400).json({ message: parse.error.errors[0].message });
      }

      let imageUrl: string | null = null;
      if (imageData) {
        try { imageUrl = await processShopItemImage(imageData); }
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

      const item = await storage.createShopItem({ ...parse.data, imageUrl, eggImageUrl, hatchedImageUrl, hooklessImageUrl });
      return res.status(201).json(item);
    } catch (err) {
      console.error("Create shop item error:", err);
      return res.status(500).json({ message: "Failed to create shop item" });
    }
  });

  app.patch("/api/admin/shop/:itemId", isAdmin, async (req, res) => {
    try {
      const { imageData, eggImageData, hatchedImageData, hooklessImageData, ...updateData } = req.body;

      if (imageData) {
        try { updateData.imageUrl = await processShopItemImage(imageData); }
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
      if (!name || (!coinAmount && (!shopItemIds || shopItemIds.length === 0))) {
        return res.status(400).json({ message: "Bundle must have a name and at least coins or items" });
      }

      const bundle = await storage.createRewardBundle(name, coinAmount || 0, message || null);

      if (shopItemIds && shopItemIds.length > 0) {
        for (const itemId of shopItemIds) {
          await storage.addRewardBundleItem(bundle.id, itemId);
        }
      }

      let recipients: string[] = [];
      if (targetUserIds && targetUserIds.length > 0) {
        recipients = targetUserIds;
      } else {
        const allUsers = await storage.getAllUsers();
        recipients = allUsers.filter(u => !u.isAdmin).map(u => u.id);
      }

      for (const userId of recipients) {
        await storage.createUserReward(userId, bundle.id);
      }

      return res.status(201).json({ bundle, recipientCount: recipients.length });
    } catch (err) {
      console.error("Create reward bundle error:", err);
      return res.status(500).json({ message: "Failed to create reward bundle" });
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
      const rewards = await storage.getUnclaimedRewards(user.id);
      const detailed = await Promise.all(rewards.map(async (reward) => {
        const bundle = await storage.getRewardBundle(reward.bundleId);
        const items = bundle ? await storage.getRewardBundleItems(bundle.id) : [];
        const itemDetails = await Promise.all(items.map(async (bi) => {
          const shopItem = await storage.getShopItem(bi.shopItemId);
          return shopItem ? { id: shopItem.id, name: shopItem.name, type: shopItem.type, imageUrl: shopItem.imageUrl, eggImageUrl: shopItem.eggImageUrl } : null;
        }));
        return {
          rewardId: reward.id,
          bundleName: bundle?.name || "Unknown",
          bundleMessage: bundle?.message || null,
          coinAmount: bundle?.coinAmount || 0,
          items: itemDetails.filter(Boolean),
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

      const existing = await storage.getUserReward((req.params.rewardId as string));
      if (!existing) {
        return res.status(404).json({ message: "Reward not found" });
      }
      if (existing.claimed) {
        return res.status(404).json({ message: "Reward already claimed" });
      }
      if (existing.userId !== user.id) {
        return res.status(403).json({ message: "This reward is not yours" });
      }

      const claimed = await storage.claimReward((req.params.rewardId as string));
      if (!claimed) {
        return res.status(404).json({ message: "Reward not found or already claimed" });
      }

      const bundle = await storage.getRewardBundle(claimed.bundleId);
      if (!bundle) {
        return res.status(404).json({ message: "Bundle not found" });
      }

      if (bundle.coinAmount > 0) {
        await storage.addCoins(user.id, bundle.coinAmount);
      }

      const bundleItems = await storage.getRewardBundleItems(bundle.id);
      const skippedPets: { name: string }[] = [];

      const BAIT_CHARGES_PER_BUNDLE = 5;

      for (const bi of bundleItems) {
        const shopItem = await storage.getShopItem(bi.shopItemId);
        if (shopItem) {
          // Bait items must stack onto the existing inventory row (quantity-based)
          if (shopItem.fishingType === "bait") {
            await storage.addToInventory(user.id, bi.shopItemId, {}, BAIT_CHARGES_PER_BUNDLE);
          } else {
            const invItem = await storage.addToInventory(user.id, bi.shopItemId);
            // Pets always start their hatch timer fresh — duplicates of an
            // already-owned species are allowed (no skip).
            if (shopItem.type === "pet" && shopItem.hatchTime) {
              await storage.updateInventoryItem(invItem.id, { hatchStartedAt: new Date() });
            }
          }
        }
      }

      const updatedUser = await storage.getUser(user.id);
      const { password: _, ...safeUser } = updatedUser!;

      return res.json({ user: safeUser, skippedPets });
    } catch (err) {
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
          if (template.backAssembled) petBackImageUrl = template.backAssembled;
          if (template.frontAssembled) petImageUrl = template.frontAssembled;
        }
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

      const prevLevel = activePet.petLevel || 1;
      const prevLevelPoints = activePet.petLevelPoints || 0;
      let totalPoints = prevLevelPoints + lvlPointsEarned;
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
          let eTotalPoints = ePrevLevelPoints + lvlPointsEarned;
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
        user: updatedUser,
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

      await storage.removeFromInventory(inventoryId);

      return res.json({ healAmount, manaAmount, petsRevived, potionName: shopItem.name });
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

  app.get("/api/badges", isAuthenticated, async (_req, res) => {
    try {
      const all = await storage.getAllBadges();
      return res.json(all);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  app.post("/api/admin/badges", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { name, imageData, dailyRewardCoins, badgePoints, claimType } = req.body;
      if (!name || !imageData) return res.status(400).json({ message: "name and imageData required" });
      const imageUrl = await processWorldImage(imageData, 1000);
      const validClaimType = ["daily", "weekly", "monthly"].includes(claimType) ? claimType : "daily";
      const badge = await storage.createBadge(name, imageUrl, dailyRewardCoins ? Number(dailyRewardCoins) : null, badgePoints ? Number(badgePoints) : 0, validClaimType);
      return res.json(badge);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to create badge" });
    }
  });

  app.delete("/api/admin/badges/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteBadge((req.params.id as string));
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete badge" });
    }
  });

  app.patch("/api/admin/badges/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { dailyRewardCoins, badgePoints, name, imageData, claimType } = req.body;
      const updateData: { dailyRewardCoins?: number | null; badgePoints?: number; name?: string; imageUrl?: string; claimType?: string } = {};
      if (dailyRewardCoins !== undefined) {
        updateData.dailyRewardCoins = dailyRewardCoins != null && dailyRewardCoins !== "" ? Number(dailyRewardCoins) : null;
      }
      if (badgePoints !== undefined) {
        updateData.badgePoints = badgePoints != null && badgePoints !== "" ? Number(badgePoints) : 0;
      }
      if (name !== undefined && name.trim()) {
        updateData.name = name.trim();
      }
      if (imageData) {
        updateData.imageUrl = await processWorldImage(imageData, 1000);
      }
      if (claimType !== undefined) {
        updateData.claimType = ["daily", "weekly", "monthly"].includes(claimType) ? claimType : "daily";
      }
      await storage.updateBadge((req.params.id as string), updateData);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to update badge" });
    }
  });

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

  app.get("/api/badges/leaderboard", async (_req, res) => {
    try {
      const leaderboard = await storage.getBadgeLeaderboard(50);
      // Hint to clients/CDNs that this list can be reused briefly. Saves
      // round trips when multiple Hub components mount in quick succession.
      res.set("Cache-Control", "private, max-age=10");
      return res.json(leaderboard);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to fetch leaderboard" });
    }
  });

  // Batch avatar fetcher. Profile pictures are stored as base64 data URLs and
  // would otherwise be embedded in every leaderboard / chat row, blowing up
  // payloads. This endpoint returns { [userId]: dataUrl|null } for the requested
  // ids only. Frontends should cache the result with a long staleTime since
  // avatars change rarely.
  app.post("/api/users/avatars", async (req, res) => {
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

  // Adventurer's Devotion: lifetime earnings minus coins purchased via bundles.
  app.get("/api/badges/leaderboard/devotion", async (_req, res) => {
    try {
      const leaderboard = await storage.getDevotionLeaderboard(50);
      res.set("Cache-Control", "private, max-age=10");
      return res.json(leaderboard);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to fetch devotion leaderboard" });
    }
  });

  app.get("/api/admin/badges/:id/recipients", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const recipients = await storage.getBadgeRecipients((req.params.id as string));
      return res.json(recipients);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch recipients" });
    }
  });

  app.post("/api/admin/badges/:id/award", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { userIds } = req.body;
      if (!Array.isArray(userIds)) return res.status(400).json({ message: "userIds array required" });
      for (const uid of userIds) {
        await storage.awardBadge(uid, (req.params.id as string));
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to award badge" });
    }
  });

  app.post("/api/admin/badges/:id/revoke", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { userIds } = req.body;
      if (!Array.isArray(userIds)) return res.status(400).json({ message: "userIds array required" });
      for (const uid of userIds) {
        await storage.revokeBadge(uid, (req.params.id as string));
      }
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to revoke badge" });
    }
  });

  app.get("/api/user/badges", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const myBadges = await storage.getUserBadges(user.id);
      return res.json(myBadges);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch user badges" });
    }
  });

  app.post("/api/badges/claim-daily", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.emailVerified) {
        return res.status(403).json({ message: "Please verify your email before claiming rewards", code: "EMAIL_UNVERIFIED" });
      }
      const { badgeId } = req.body;
      if (!badgeId) return res.status(400).json({ message: "badgeId required" });

      // Verify player owns this badge
      const myBadges = await storage.getUserBadges(user.id);
      const badge = myBadges.find(b => b.badgeId === badgeId);
      if (!badge) return res.status(403).json({ message: "You don't have this badge" });

      const reward = badge.dailyRewardCoins;
      if (!reward) return res.status(400).json({ message: "This badge has no coin reward" });

      // Cooldown: 24h for daily, 7 days for weekly, 30 days for monthly
      const claimType = badge.claimType ?? "daily";
      const cooldownMs =
        claimType === "monthly" ? 30 * 24 * 60 * 60 * 1000 :
        claimType === "weekly"  ?  7 * 24 * 60 * 60 * 1000 :
                                       24 * 60 * 60 * 1000;
      const periodLabel =
        claimType === "monthly" ? "this month" :
        claimType === "weekly"  ? "this week"  : "today";

      if (badge.lastClaimedAt) {
        const msSinceClaim = Date.now() - new Date(badge.lastClaimedAt).getTime();
        if (msSinceClaim < cooldownMs) {
          const msLeft = cooldownMs - msSinceClaim;
          return res.status(429).json({ message: `Already claimed ${periodLabel}`, msLeft });
        }
      }

      // Award coins and record claim
      const updated = await storage.addCoins(user.id, reward);
      await storage.upsertBadgeRewardClaim(user.id, badgeId);

      return res.json({ coinsAwarded: reward, newCoins: updated.coins });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to claim reward" });
    }
  });

  app.get("/api/market", isAuthenticated, async (req, res) => {
    try {
      const search = req.query.search as string | undefined;
      const itemType = req.query.itemType as string | undefined;
      const orderAsc = !!(itemType && itemType !== "all");
      const listings = await storage.getMarketListings({ search, itemType, orderAsc });
      return res.json(listings);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch market listings" });
    }
  });

  app.get("/api/market/my-listings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const listings = await storage.getMyMarketListings(user.id);
      return res.json(listings);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch your listings" });
    }
  });

  app.post("/api/market/list", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId, price } = req.body;
      if (!inventoryId || price == null) return res.status(400).json({ message: "inventoryId and price required" });
      if (typeof price !== "number" || price < 1 || price > 1000000) return res.status(400).json({ message: "Price must be between 1 and 1,000,000 coins" });

      const invItem = await storage.getInventoryItemById(inventoryId);
      if (!invItem || invItem.userId !== user.id) return res.status(404).json({ message: "Item not found in your inventory" });
      if (invItem.isListed) return res.status(400).json({ message: "Item is already listed" });

      const shopItem = await storage.getShopItem(invItem.shopItemId);
      if (!shopItem) return res.status(404).json({ message: "Item data not found" });
      if (shopItem.type === "pet") return res.status(400).json({ message: "Pets cannot be sold on the player market" });

      const myListings = await storage.getMyMarketListings(user.id);
      const activeOrPending = myListings.filter(l => l.status === "active" || l.status === "sold");
      const totalSlots = 25 + (user.marketExtraSlots ?? 0);
      if (activeOrPending.length >= totalSlots) return res.status(400).json({ message: `You've reached your listing limit (${totalSlots} slots). Collect sold coins or buy more slots.` });

      const listing = await storage.createMarketListing({
        sellerId: user.id,
        sellerName: user.username,
        inventoryId,
        shopItemId: shopItem.id,
        itemName: shopItem.name,
        itemImageUrl: shopItem.imageUrl,
        // For fishing items, use the more specific fishingType ("fish", "pole", "bait")
        // so market filters can distinguish fish from poles
        itemType: (shopItem.type === "fishing" && shopItem.fishingType) ? shopItem.fishingType : shopItem.type,
        price,
      });
      return res.json(listing);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to create listing" });
    }
  });

  app.post("/api/market/:listingId/buy", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const listing = await storage.getMarketListing((req.params.listingId as string));
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.status !== "active") return res.status(400).json({ message: "This item is no longer available" });
      if (listing.sellerId === user.id) return res.status(400).json({ message: "You cannot buy your own listing" });

      // Atomic deduct first — prevents two buyers both passing a JS coin check
      const afterDeduct = await storage.atomicDeductCoins(user.id, listing.price);
      if (!afterDeduct) return res.status(400).json({ message: "Not enough coins" });

      try {
        // buyMarketListing re-checks status = 'active' atomically; throws if already sold
        const { price } = await storage.buyMarketListing(listing.id, user.id);
        return res.json({ ok: true, price });
      } catch (claimErr: any) {
        // Listing was already sold to someone else — refund the deducted coins
        await storage.addCoins(user.id, listing.price);
        return res.status(400).json({ message: "This item was just purchased by someone else" });
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to buy listing" });
    }
  });

  app.post("/api/market/:listingId/collect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const coinsEarned = await storage.collectMarketCoins((req.params.listingId as string), user.id);
      await storage.addCoins(user.id, coinsEarned);
      const updatedUser = await storage.getUser(user.id);
      return res.json({ ok: true, coinsEarned, newBalance: updatedUser?.coins });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to collect coins" });
    }
  });

  app.delete("/api/market/:listingId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await storage.cancelMarketListing((req.params.listingId as string), user.id);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to cancel listing" });
    }
  });

  app.post("/api/market/buy-slot", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const updatedUser = await storage.buyMarketSlot(user.id);
      return res.json({ ok: true, marketExtraSlots: updatedUser.marketExtraSlots, coins: updatedUser.coins });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to purchase slot" });
    }
  });

  app.get("/api/fish-parts/:fishItemId", isAuthenticated, async (req, res) => {
    try {
      const parts = await storage.getFishTemplateParts((req.params.fishItemId as string));
      return res.json(parts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/fish-parts/:fishItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const parts = await storage.getFishTemplateParts((req.params.fishItemId as string));
      return res.json(parts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  const ALLOWED_FISH_PART_TYPES = new Set(["body", "tail", "top_fin", "bottom_fin", "head_fin"]);
  const ALLOWED_EQUIP_SLOTS = new Set(["pole", "bait"]);

  app.post("/api/admin/fish-parts/:fishItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { partType, imageData, posX, posY, width, height, zIndex } = req.body;
      if (!partType || !imageData) return res.status(400).json({ message: "Missing fields" });
      if (!ALLOWED_FISH_PART_TYPES.has(partType)) {
        return res.status(400).json({ message: `Invalid partType. Allowed: ${Array.from(ALLOWED_FISH_PART_TYPES).join(", ")}` });
      }
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const resized = await sharp(imageBuffer)
        .resize(600, 600, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      const imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      const part = await storage.createFishTemplatePart({
        fishItemId: (req.params.fishItemId as string),
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

  app.patch("/api/admin/fish-parts/:partId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const part = await storage.updateFishTemplatePart((req.params.partId as string), req.body);
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/fish-parts/:partId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteFishTemplatePart((req.params.partId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/location/:locationId/pond-fish", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const fish = await storage.getPondFish((req.params.locationId as string));
      return res.json(fish);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/location/:locationId/pond-fish", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const location = await storage.getWorldLocation((req.params.locationId as string));
      if (!location || location.type !== "fishing") return res.status(400).json({ message: "Location must be a fishing-type location" });
      const fishItem = await storage.getShopItem(shopItemId);
      if (!fishItem || fishItem.type !== "fishing" || fishItem.fishingType !== "fish") {
        return res.status(400).json({ message: "Item must be a fish-type fishing item" });
      }
      const entry = await storage.addFishToPond((req.params.locationId as string), shopItemId);
      return res.json(entry);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/location/:locationId/pond-fish/:shopItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.removeFishFromPond((req.params.locationId as string), (req.params.shopItemId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/all-fish", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getAllShopItems();
      const fish = items.filter((i: any) => i.type === "fishing" && i.fishingType === "fish");
      return res.json(fish);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/caught-fish-ids", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const log = await storage.getPlayerCaughtFishLog(user.id);
      return res.json(log);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/claim-catch-reward", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const claimed = await storage.claimFishCatchReward(user.id, shopItemId);
      if (!claimed) return res.status(400).json({ message: "Reward already claimed or fish not caught" });
      const updated = await storage.addCoins(user.id, 10);
      return res.json({ ok: true, coins: updated.coins });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/location/:locationId/pond-fish", isAuthenticated, async (req, res) => {
    try {
      const fish = await storage.getPondFish((req.params.locationId as string));
      return res.json(fish);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/equipment", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const equipment = await storage.getPlayerFishingEquipment(user.id);
      let poleItem = null;
      let baitItem = null;
      let poleUsesLeft: number | null = null;
      if (equipment?.poleInventoryId) {
        const inv = await storage.getInventoryItemById(equipment.poleInventoryId);
        if (inv) {
          poleItem = await storage.getShopItem(inv.shopItemId);
          poleUsesLeft = inv.poleUsesLeft ?? null;
        }
      }
      if (equipment?.baitInventoryId) {
        const inv = await storage.getInventoryItemById(equipment.baitInventoryId);
        if (inv) baitItem = await storage.getShopItem(inv.shopItemId);
      }
      return res.json({ equipment, poleItem, baitItem, poleUsesLeft });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/equip", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId, slot } = req.body;
      if (!inventoryId || !slot) return res.status(400).json({ message: "inventoryId and slot (pole|bait) required" });
      if (!ALLOWED_EQUIP_SLOTS.has(slot)) return res.status(400).json({ message: `Invalid slot. Allowed: ${Array.from(ALLOWED_EQUIP_SLOTS).join(", ")}` });
      const inv = await storage.getInventoryItemById(inventoryId);
      if (!inv || inv.userId !== user.id) return res.status(404).json({ message: "Inventory item not found" });
      const item = await storage.getShopItem(inv.shopItemId);
      if (!item || item.type !== "fishing") return res.status(400).json({ message: "Not a fishing item" });
      if (slot === "pole" && item.fishingType !== "pole") return res.status(400).json({ message: "Item is not a fishing pole" });
      if (slot === "bait" && item.fishingType !== "bait") return res.status(400).json({ message: "Item is not bait" });
      const data = slot === "pole"
        ? { poleInventoryId: inventoryId }
        : { baitInventoryId: inventoryId };
      const equipment = await storage.upsertPlayerFishingEquipment(user.id, data);
      return res.json({ ok: true, equipment });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/unequip", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { slot } = req.body;
      if (!slot) return res.status(400).json({ message: "slot (pole|bait) required" });
      if (!ALLOWED_EQUIP_SLOTS.has(slot)) return res.status(400).json({ message: `Invalid slot. Allowed: ${Array.from(ALLOWED_EQUIP_SLOTS).join(", ")}` });
      const data = slot === "pole" ? { poleInventoryId: null } : { baitInventoryId: null };
      const equipment = await storage.upsertPlayerFishingEquipment(user.id, data);
      return res.json({ ok: true, equipment });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/fishing/inventory", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const fish = await storage.getPlayerFishInventory(user.id);
      const uniqueShopItemIds = [...new Set(fish.map(f => f.shopItemId))];
      const partsMap = new Map<string, boolean>();
      await Promise.all(uniqueShopItemIds.map(async (id) => {
        const parts = await storage.getFishTemplateParts(id);
        partsMap.set(id, parts.length > 0);
      }));
      const result = fish.map(f => ({
        ...f,
        item: f.item ? { ...f.item, hasParts: partsMap.get(f.shopItemId) ?? false } : null,
      }));
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/inventory/add", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const item = await storage.getShopItem(shopItemId);
      if (!item || item.type !== "fishing" || item.fishingType !== "fish") {
        return res.status(400).json({ message: "Item must be a fish-type fishing item" });
      }
      const entry = await storage.addFishToPlayerInventory(user.id, shopItemId);
      return res.status(201).json(entry);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/fishing/catch", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { locationId, performanceScore, shopItemId: clientShopItemId } = req.body;
      if (!locationId) return res.status(400).json({ message: "locationId required" });
      const score = Math.max(0, Math.min(100, Number(performanceScore) || 0));

      const location = await storage.getWorldLocation(locationId);
      if (!location || location.type !== "fishing") return res.status(400).json({ message: "Location is not a fishing spot" });

      const pondEntries = await storage.getPondFish(locationId);
      if (pondEntries.length === 0) return res.json({ caught: null, reason: "empty_pond" });

      const equipment = await storage.getPlayerFishingEquipment(user.id);
      if (equipment?.poleInventoryId) {
        await storage.decrementPoleUses(equipment.poleInventoryId);
      }

      // If the player completed the reel mini-game (score 100) they always catch.
      if (score < 100) {
        const catchChance = 0.4 + (score / 100) * 0.5;
        if (Math.random() > catchChance) return res.json({ caught: null, reason: "miss" });
      }

      // Use the specific fish the frontend selected for the minigame — this ensures the
      // difficulty (based on that fish's starRarity) matches what the player actually catches.
      // Verify it belongs to this pond before trusting the client value.
      let chosenEntry = clientShopItemId
        ? pondEntries.find(e => e.shopItemId === clientShopItemId) ?? null
        : null;

      // Fallback: if the client didn't send an ID or it wasn't found in this pond, random-select
      if (!chosenEntry) {
        let baitBoost = 0;
        let baitRarityBoostStar = 0;
        if (equipment?.baitInventoryId) {
          const inv = await storage.getInventoryItemById(equipment.baitInventoryId);
          if (inv) {
            const bait = await storage.getShopItem(inv.shopItemId);
            baitBoost = bait?.rarityBoostPercent ?? 0;
            baitRarityBoostStar = bait?.baitRarityBoostStar ?? 0;
          }
        }
        const baseWeights: Record<number, number> = { 1: 60, 2: 24, 3: 10, 4: 4, 5: 2 };
        // Count fish per rarity so weights are normalized per group, preventing many 1★
        // fish from dominating the pool over rarer fish.
        const rarityCounts: Record<number, number> = {};
        for (const entry of pondEntries) {
          const s = parseInt(String(entry.item?.starRarity ?? 1), 10) || 1;
          rarityCounts[s] = (rarityCounts[s] ?? 0) + 1;
        }
        // Bait boost is a direct probability roll: baitBoost=100 on star 5 guarantees a 5★ fish.
        // If the roll succeeds but no fish of that rarity are in the pond, fall back to normal.
        let forcedEntries: typeof pondEntries | null = null;
        if (baitBoost > 0 && baitRarityBoostStar > 0 && Math.random() < baitBoost / 100) {
          const targets = pondEntries.filter(e => (parseInt(String(e.item?.starRarity ?? 1), 10) || 1) === baitRarityBoostStar);
          if (targets.length > 0) forcedEntries = targets;
        }

        if (forcedEntries) {
          chosenEntry = forcedEntries[Math.floor(Math.random() * forcedEntries.length)];
        } else {
          const fishPool = pondEntries.map(entry => {
            const star = parseInt(String(entry.item?.starRarity ?? 1), 10) || 1;
            const weight = (baseWeights[star] ?? 10) / (rarityCounts[star] ?? 1);
            return { entry, weight: Math.max(0.01, weight) };
          });
          const totalWeight = fishPool.reduce((sum, f) => sum + f.weight, 0);
          let rand = Math.random() * totalWeight;
          let chosen = fishPool[fishPool.length - 1];
          for (const f of fishPool) {
            rand -= f.weight;
            if (rand <= 0) { chosen = f; break; }
          }
          chosenEntry = chosen.entry;
        }
      }

      const caught = await storage.addFishToPlayerInventory(user.id, chosenEntry.shopItemId);
      await storage.logFishCatch(user.id, chosenEntry.shopItemId);

      // Consume 1 bait charge on successful catch
      if (equipment?.baitInventoryId) {
        const { depleted } = await storage.decrementBaitQuantity(equipment.baitInventoryId);
        if (depleted) {
          // Bait ran out — unequip it
          await storage.upsertPlayerFishingEquipment(user.id, { baitInventoryId: null });
        }
      }

      // If the pond entry's item join came back null (e.g. shop item was updated/re-keyed
      // after the pond fish was added), fetch it directly so the client always gets a
      // valid item object and shows the "Caught!" screen instead of "It got away!".
      const fishItem = chosenEntry.item ?? await storage.getShopItem(chosenEntry.shopItemId) ?? null;
      return res.json({ caught, item: fishItem });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Fish barrel routes
  app.get("/api/world/:worldId/fish-barrel", isAuthenticated, async (req, res) => {
    try {
      const barrel = await storage.getFishBarrelByWorld((req.params.worldId as string));
      return res.json(barrel || null);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/world/:worldId/fish-barrel", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const existing = await storage.getFishBarrelByWorld((req.params.worldId as string));
      if (existing) return res.status(400).json({ message: "Barrel already exists" });
      const barrel = await storage.createFishBarrel((req.params.worldId as string));
      return res.status(201).json(barrel);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/fish-barrel/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const { posX, posY, size } = req.body;
      const barrel = await storage.updateFishBarrel((req.params.id as string), { posX, posY, size });
      return res.json(barrel);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/fish-barrel/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      await storage.deleteFishBarrel((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Sync aquarium fish — marks exactly `count` fish per shopItemId as inAquarium
  app.post("/api/fishing/aquarium/sync", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { counts } = req.body;
      console.log(`[AQ-SYNC] user=${user.id} counts=${JSON.stringify(counts)}`);
      if (!Array.isArray(counts)) return res.status(400).json({ message: "counts array required" });
      await storage.syncAquariumFish(user.id, counts);
      console.log(`[AQ-SYNC] success for user=${user.id}`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error(`[AQ-SYNC] error:`, err.message);
      return res.status(500).json({ message: err.message });
    }
  });

  // Add one fish to aquarium (atomic, no race conditions)
  app.post("/api/fishing/aquarium/add", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const fishId = await storage.addFishToAquarium(user.id, shopItemId);
      if (!fishId) return res.status(400).json({ message: "No available fish of this type" });
      return res.json({ ok: true, fishId });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Remove one fish from aquarium (atomic, no race conditions)
  app.post("/api/fishing/aquarium/remove", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { shopItemId } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      const removed = await storage.removeFishFromAquarium(user.id, shopItemId);
      if (!removed) return res.status(400).json({ message: "No fish of this type in aquarium" });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Sell fish
  const FISH_SELL_PRICES: Record<number, number> = { 1: 5, 2: 10, 3: 15, 4: 25, 5: 30 };

  app.post("/api/fishing/sell", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { fishIds } = req.body;
      if (!Array.isArray(fishIds) || fishIds.length === 0) {
        return res.status(400).json({ message: "fishIds array required" });
      }
      const fishInventory = await storage.getPlayerFishInventory(user.id);
      const ownedIds = new Set(fishInventory.map(f => f.id));
      const toSell = fishInventory.filter(f => fishIds.includes(f.id) && ownedIds.has(f.id) && !f.inAquarium);
      if (toSell.length === 0) return res.status(400).json({ message: "No valid fish to sell" });

      let totalCoins = 0;
      for (const fish of toSell) {
        const rarity = fish.item?.starRarity ?? 1;
        totalCoins += FISH_SELL_PRICES[rarity] ?? 5;
      }

      await storage.deleteFishInventoryItems(toSell.map(f => f.id));
      const updatedUser = await storage.addCoins(user.id, totalCoins);
      return res.json({ sold: toSell.length, coinsEarned: totalCoins, newBalance: updatedUser.coins });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── PvP Arena Routes ─────────────────────────────────────────────────────
  // Generate an AI opponent based on the player's current pet level
  app.get("/api/pvp/opponent", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const inventory = await storage.getUserInventory(user.id);
      const shopItemsData = await storage.getShopItemsByWorld(user.worldId || "murk_cave");
      const activePet = inventory
        .map((inv: any) => {
          const shopItem = shopItemsData.find((s: any) => s.id === inv.shopItemId);
          return shopItem ? { ...shopItem, ...inv, shopItemId: inv.shopItemId } : null;
        })
        .filter(Boolean)
        .find((inv: any) => inv.id === user.activePetId && inv.isHatched);

      const playerLevel = activePet?.petLevel || 1;
      const playerAtk = activePet?.petAtk || 50;
      const playerDef = activePet?.petDef || 50;
      const playerHp = activePet?.petHealth || 1000;

      // Opponent is slightly above/below player level
      const levelOffset = Math.floor(Math.random() * 5) - 2;
      const opponentLevel = Math.max(1, playerLevel + levelOffset);
      const scaleFactor = 0.85 + Math.random() * 0.35;
      const skills = ["Lazer", "Bubble", "Heal Self", "Poison", null, null];
      const skill = skills[Math.floor(Math.random() * skills.length)];

      // Pick a random enemy image from the database as avatar
      const allEnemies = await storage.getLocationEnemies("a1b2c3d4-0001-4000-8000-000000000001").catch(() => []);
      const randomEnemy = allEnemies[Math.floor(Math.random() * allEnemies.length)];

      const opponentNames = [
        "Shadow Keeper", "Storm Warden", "Void Stalker", "Crystal Hunter",
        "Ember Wolf", "Tide Walker", "Iron Fang", "Moon Shade", "Ash Drake",
        "Venom Wisp", "Frost Rune", "Chaos Sprite",
      ];
      const name = opponentNames[Math.floor(Math.random() * opponentNames.length)];

      return res.json({
        name,
        imageUrl: randomEnemy?.imageUrl || null,
        level: opponentLevel,
        hp: Math.floor(playerHp * scaleFactor),
        atk: Math.floor(playerAtk * scaleFactor),
        def: Math.floor(playerDef * scaleFactor * 0.7),
        specialSkill: skill,
      });
    } catch (err) {
      console.error("PvP opponent error:", err);
      return res.status(500).json({ message: "Failed to generate opponent" });
    }
  });

  // Record PvP battle result and award coins + battle points
  app.post("/api/pvp/result", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { opponentName, opponentImageUrl, opponentLevel, opponentSkill, result, opponentUserId, battleToken } = req.body;
      if (!["win", "loss"].includes(result)) return res.status(400).json({ message: "Invalid result" });

      // Server-side ticket gating: /api/pvp/result is only accepted with a
      // valid one-time battle token issued by /api/pvp/start (which already
      // spent the ticket). This stops a client from calling /result directly
      // to farm BP/coins without paying. The token is consumed on use.
      const tokenOk = await storage.consumePvpBattleToken(user.id, String(battleToken || ""));
      if (!tokenOk) {
        return res.status(403).json({ message: "Missing or invalid battle token" });
      }

      // Coin reward is driven by opponent level. The client used to send
      // this directly which let a modified client inflate payouts —
      // instead we derive it from the opponent's *saved* battle group
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
              const newMood = Math.max(0, (activePet.petMood ?? 100) - 12);
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
    "1":   { tickets: 1,   cost: 50 },
    "5":   { tickets: 5,   cost: 250 },
    "10":  { tickets: 10,  cost: 500 },
    "25":  { tickets: 25,  cost: 1250 },
    "50":  { tickets: 50,  cost: 2500 },
    "100": { tickets: 100, cost: 5000 },
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
      const result = await storage.purchasePvpTicketBundleAtomic(
        user.id,
        ticketItem.id,
        bundle.cost,
        bundle.tickets,
      );
      if (!result) {
        return res.status(400).json({ message: "Not enough coins" });
      }

      const { password: _pw, ...safeUser } = result.user;
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
      // Exclude current user, only keep groups with pets.
      const others = all.filter((g: any) => g.userId !== user.id && g.petInventoryIds?.length > 0);

      // Matchmaking model (revised — bots are always part of the pool):
      //   1. The lobby surfaces a HEALTHY MIX of real players + bots so
      //      the arena never feels empty during low-traffic hours. The
      //      previous "bots only when zero humans" model meant a
      //      lobby with even ONE matched human showed zero bots,
      //      which the user reported as "not enough players in PvP
      //      right now."
      //   2. Real opponents (humans + moderators) are still preferred
      //      and matched on a tighter ATK band — they appear first
      //      in the returned list so the client renders them at the
      //      top of the opponent grid.
      //   3. Bots are then appended on a wider ±100 % ATK band so the
      //      bot at least roughly matches the player's strength. If
      //      that band is empty (very lopsided pool), all bots fall
      //      through. This gives every player a guaranteed slate of
      //      sparring partners without making bots feel mandatory.
      const myGroup = await storage.getBattleGroup(user.id);
      const myPower: number = myGroup?.attackPower ?? 0;

      const humans = others.filter((g: any) => !g.isBot);
      const bots   = others.filter((g: any) =>  g.isBot);

      const inBand = (pool: any[], band: number) => {
        if (myPower <= 0) return pool.slice(); // unranked players can match anyone
        const lo = myPower * (1 - band);
        const hi = myPower * (1 + band);
        return pool.filter((g: any) => {
          const p = g.attackPower ?? 0;
          return p >= lo && p <= hi;
        });
      };

      // ── Human / moderator pass (strict-then-loose) ──
      // ±35 % first; if that's empty widen to ±60 %; finally take every
      // human if the band still finds nothing. Even one human is great,
      // but unlike the old model we DON'T stop here — we always
      // continue to the bot pass below so the lobby stays full.
      let humansMatched: any[] = inBand(humans, 0.35);
      if (humansMatched.length === 0) humansMatched = inBand(humans, 0.60);
      if (humansMatched.length === 0) humansMatched = humans.slice();

      // ── Bot pass (always included) ──
      // ±100 % ATK band, falling through to all bots if that's empty.
      // De-duplication isn't needed because bots and humans are
      // disjoint (different `isBot` flag), but we cap the bot count at
      // 6 so the lobby grid doesn't get visually dominated by bots
      // when the human pool is small.
      let botsMatched: any[] = inBand(bots, 1.0);
      if (botsMatched.length === 0) botsMatched = bots.slice();
      if (botsMatched.length > 6) botsMatched = botsMatched.slice(0, 6);

      // Humans first so they render at the top of the grid; bots
      // immediately after so the lobby always feels full.
      const matched = [...humansMatched, ...botsMatched];
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
      const result = await storage.acceptFriendRequest(requestId, userId);
      if (!result) return res.status(404).json({ message: "Request not found" });
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

  // ── Player Home Decor Inventory & Placement ───────────────────────────────────
  app.get("/api/pet-house/decor/inventory", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const items = await storage.getUserHomeDecorInventory(userId);
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/pet-house/decor/placed", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const location = req.query.location as string | undefined;
      const items = await storage.getPlacedHomeDecor(userId, location);
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Public endpoint — lets visitors see another player's placed decor
  app.get("/api/users/:userId/pet-house/decor/placed", async (req, res) => {
    try {
      const { userId } = req.params as { userId: string };
      const location = req.query.location as string | undefined;
      const items = await storage.getPlacedHomeDecor(userId, location);
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/pet-house/decor/place", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { decorItemId, xPct, yPct, size, flipped, location } = req.body;
      if (!decorItemId) return res.status(400).json({ message: "decorItemId required" });
      const row = await storage.placeHomeDecorItem(userId, decorItemId, {
        xPct: xPct ?? 0.5,
        yPct: yPct ?? 0.5,
        size: size ?? 250,
        flipped: flipped ?? false,
        location: location ?? "outside",
      });
      return res.status(201).json(row);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/pet-house/decor/placed/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const { xPct, yPct, size, flipped } = req.body;
      const row = await storage.updatePlacedHomeDecor((req.params.id as string), userId, { xPct, yPct, size, flipped });
      return res.json(row);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/pet-house/decor/placed/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const result = await storage.removePlacedHomeDecor((req.params.id as string), userId);
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

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
  app.post("/api/gifts/send", isAuthenticated, async (req, res) => {
    try {
      const senderId = (req.user as any).id;
      const { receiverId, message, coinAmount, itemType, shopItemInventoryId, decorItemId, itemQuantity, itemName, itemImageUrl, shopItemId } = req.body;
      if (!receiverId) return res.status(400).json({ message: "receiverId required" });
      if (coinAmount == null || coinAmount < 0) return res.status(400).json({ message: "coinAmount must be >= 0" });
      if (senderId === receiverId) return res.status(400).json({ message: "Cannot send gift to yourself" });
      const gift = await storage.sendGift({ senderId, receiverId, message, coinAmount, itemType, shopItemInventoryId, decorItemId, itemQuantity, itemName, itemImageUrl, shopItemId });
      return res.json(gift);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/gifts/pending", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const pending = await storage.getPendingGifts(userId);
      return res.json(pending);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/gifts/:id/accept", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).id;
      const gift = await storage.acceptGift((req.params.id as string), userId);
      return res.json(gift);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

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

  app.post("/api/world-chat", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { message } = req.body;
      if (!message || typeof message !== "string") return res.status(400).json({ message: "Message required" });
      const trimmed = message.trim();
      if (!trimmed || trimmed.length > CHAT_MAX_LENGTH) {
        return res.status(400).json({ message: `Message must be 1–${CHAT_MAX_LENGTH} characters` });
      }
      if (await containsBadWord(trimmed)) {
        return res.status(400).json({ message: "Your message contains restricted content and could not be sent.", restricted: true });
      }
      const last = await storage.getLastWorldChatByUser(user.id);
      if (last) {
        const elapsed = Date.now() - new Date(last.createdAt).getTime();
        if (elapsed < CHAT_COOLDOWN_MS) {
          const wait = Math.ceil((CHAT_COOLDOWN_MS - elapsed) / 1000);
          return res.status(429).json({ message: `Please wait ${wait}s before sending another message`, retryAfter: wait });
        }
      }
      const fullUser = await storage.getUser(user.id);
      const msg = await storage.addWorldChatMessage({
        userId: user.id,
        username: fullUser?.username ?? user.username,
        profileImage: fullUser?.profileImage ?? null,
        message: trimmed,
      });
      // Count-based purge: wipe ALL messages once 50 have accumulated
      storage.purgeOldWorldChatMessages().catch(() => {});
      return res.json(msg);
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
  // 30-minute quote poster
  setInterval(async () => {
    try {
      const quotes = await storage.getVWQuotes();
      if (quotes.length === 0) return;
      const pick = quotes[Math.floor(Math.random() * quotes.length)];
      await postWatcherMessage(`🌿 ${pick.message}`);
    } catch (err) {
      console.error("[VW] Quote error:", err);
    }
  }, 30 * 60 * 1000);

  // ── Daily Login Rewards ───────────────────────────────────────────────────
  // Public: get all 7 days config with items
  app.get("/api/daily-login/config", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT dlr.day_number, dlr.coin_amount,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id', si.id,
                     'name', si.name,
                     'imageUrl', si.image_url,
                     'type', si.type,
                     'quantity', dlri.quantity
                   )
                 ) FILTER (WHERE si.id IS NOT NULL),
                 '[]'::json
               ) AS items
        FROM daily_login_rewards dlr
        LEFT JOIN daily_login_reward_items dlri ON dlri.day_number = dlr.day_number
        LEFT JOIN shop_items si ON si.id = dlri.shop_item_id
        GROUP BY dlr.day_number
        ORDER BY dlr.day_number
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error("Daily login config error:", err);
      return res.status(500).json({ message: "Failed to get daily login config" });
    }
  });

  // Auth: get current player's daily login status
  app.get("/api/daily-login/status", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      // Do timing check fully in SQL to avoid JS timezone discrepancies with PG timestamps
      const totalResult = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          MAX(claimed_at) AS last_claimed,
          (MAX(claimed_at) IS NULL OR NOW() - MAX(claimed_at) >= INTERVAL '24 hours') AS can_claim,
          CASE WHEN MAX(claimed_at) IS NOT NULL
            THEN MAX(claimed_at) + INTERVAL '24 hours'
            ELSE NULL
          END AS next_claim_at
        FROM player_daily_login_claims
        WHERE user_id = ${user.id}
      `);
      const total: number = totalResult.rows[0].total as number;
      const lastClaimed = totalResult.rows[0].last_claimed;
      const canClaim: boolean = totalResult.rows[0].can_claim as boolean;
      const nextClaimAt = totalResult.rows[0].next_claim_at;
      const currentCycle = Math.floor(total / 7);
      const nextDay = (total % 7) + 1;
      const claimedRows = await db.execute(sql`
        SELECT day_number FROM player_daily_login_claims
        WHERE user_id = ${user.id} AND cycle_number = ${currentCycle}
        ORDER BY day_number
      `);
      return res.json({
        totalClaims: total,
        currentCycle,
        nextDay,
        canClaim,
        lastClaimedAt: lastClaimed,
        nextClaimAt,
        claimedDaysInCycle: claimedRows.rows.map((r: any) => r.day_number),
      });
    } catch (err) {
      console.error("Daily login status error:", err);
      return res.status(500).json({ message: "Failed to get daily login status" });
    }
  });

  // Auth: claim today's daily login reward
  app.post("/api/daily-login/claim", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      // Use SQL for timing to avoid JS timezone issues with PG timestamps
      const totalResult = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total,
          (MAX(claimed_at) IS NULL OR NOW() - MAX(claimed_at) >= INTERVAL '24 hours') AS can_claim
        FROM player_daily_login_claims
        WHERE user_id = ${user.id}
      `);
      const total: number = totalResult.rows[0].total as number;
      const canClaim: boolean = totalResult.rows[0].can_claim as boolean;
      const currentCycle = Math.floor(total / 7);
      const nextDay = (total % 7) + 1;
      if (!canClaim) {
        return res.status(400).json({ message: "Already claimed today. Come back in 24 hours!" });
      }
      const rewardResult = await db.execute(sql`
        SELECT dlr.coin_amount,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'shopItemId', dlri.shop_item_id,
                     'quantity', dlri.quantity,
                     'name', si.name,
                     'imageUrl', si.image_url
                   )
                 ) FILTER (WHERE dlri.id IS NOT NULL),
                 '[]'::json
               ) AS items
        FROM daily_login_rewards dlr
        LEFT JOIN daily_login_reward_items dlri ON dlri.day_number = dlr.day_number
        LEFT JOIN shop_items si ON si.id = dlri.shop_item_id
        WHERE dlr.day_number = ${nextDay}
        GROUP BY dlr.coin_amount
      `);
      if (!rewardResult.rows[0]) {
        return res.status(404).json({ message: "Reward not configured for this day" });
      }
      const coinAmount: number = (rewardResult.rows[0].coin_amount as number) || 0;
      const items: any[] = (rewardResult.rows[0].items as any[]) || [];
      if (coinAmount > 0) {
        await db.execute(sql`
          UPDATE users
          SET coins = coins + ${coinAmount},
              total_coins_earned = total_coins_earned + ${coinAmount}
          WHERE id = ${user.id}
        `);
      }
      for (const item of items) {
        await storage.addToInventory(user.id, item.shopItemId, undefined, item.quantity);
      }
      await db.execute(sql`
        INSERT INTO player_daily_login_claims (user_id, cycle_number, day_number)
        VALUES (${user.id}, ${currentCycle}, ${nextDay})
      `);
      return res.json({ day: nextDay, coinAmount, items });
    } catch (err) {
      console.error("Daily login claim error:", err);
      return res.status(500).json({ message: "Failed to claim daily reward" });
    }
  });

  // Admin: update a day's coin amount
  app.put("/api/admin/daily-login/:day", isAdmin, async (req, res) => {
    try {
      const day = parseInt(String(req.params.day));
      if (day < 1 || day > 7) return res.status(400).json({ message: "Day must be 1-7" });
      const { coinAmount } = req.body;
      await db.execute(sql`
        UPDATE daily_login_rewards
        SET coin_amount = ${coinAmount ?? 0}, updated_at = now()
        WHERE day_number = ${day}
      `);
      return res.json({ success: true });
    } catch (err) {
      console.error("Admin daily login update error:", err);
      return res.status(500).json({ message: "Failed to update daily reward" });
    }
  });

  // Admin: add (or update quantity of) an item on a day
  app.post("/api/admin/daily-login/:day/items", isAdmin, async (req, res) => {
    try {
      const day = parseInt(String(req.params.day));
      if (day < 1 || day > 7) return res.status(400).json({ message: "Day must be 1-7" });
      const { shopItemId, quantity } = req.body;
      if (!shopItemId) return res.status(400).json({ message: "shopItemId required" });
      await db.execute(sql`
        INSERT INTO daily_login_reward_items (day_number, shop_item_id, quantity)
        VALUES (${day}, ${shopItemId}, ${quantity ?? 1})
        ON CONFLICT (day_number, shop_item_id)
        DO UPDATE SET quantity = EXCLUDED.quantity
      `);
      return res.json({ success: true });
    } catch (err) {
      console.error("Admin daily login add item error:", err);
      return res.status(500).json({ message: "Failed to add item to daily reward" });
    }
  });

  // Admin: remove an item from a day
  app.delete("/api/admin/daily-login/:day/items/:shopItemId", isAdmin, async (req, res) => {
    try {
      const day = parseInt(String(req.params.day));
      const { shopItemId } = req.params;
      await db.execute(sql`
        DELETE FROM daily_login_reward_items
        WHERE day_number = ${day} AND shop_item_id = ${shopItemId}
      `);
      return res.json({ success: true });
    } catch (err) {
      console.error("Admin daily login remove item error:", err);
      return res.status(500).json({ message: "Failed to remove item from daily reward" });
    }
  });

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

  // Leaderboard monitor — fires only when a NEW player enters the top 3 (not on reorders).
  // Polls every 5 minutes so newcomers are surfaced quickly.
  let lastLeaderboardTop3Names = new Set<string>();
  let leaderboardMonitorPrimed = false;
  setInterval(async () => {
    try {
      const leaderboard = await storage.getBadgeLeaderboard(3);
      const top3 = leaderboard.slice(0, 3) as any[];
      const currentNames = new Set<string>(top3.map((u: any) => u.username));
      const newcomers = [...currentNames].filter(n => !lastLeaderboardTop3Names.has(n));
      if (leaderboardMonitorPrimed && newcomers.length > 0) {
        for (const newName of newcomers) {
          const entry = top3.find((u: any) => u.username === newName);
          if (!entry) continue;
          const rankIdx = top3.indexOf(entry);
          const medals = ["🥇", "🥈", "🥉"];
          const fullUser = await storage.getUser(entry.userId).catch(() => null);
          if (fullUser?.watcherShoutoutsEnabled === false) continue;
          await postWatcherMessage(
            `👁️ The Watcher observes... a new champion rises! ${medals[rankIdx]} ${newName} has claimed a place among the top three. Will you rise to challenge them?`
          );
        }
      }
      lastLeaderboardTop3Names = currentNames;
      leaderboardMonitorPrimed = true;
    } catch (err) {
      console.error("[VW] Leaderboard monitor error:", err);
    }
  }, 5 * 60 * 1000);

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
