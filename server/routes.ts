import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { insertUserSchema, updateUsernameSchema, insertShopItemSchema, rewardBundles, rewardBundleItems, userRewards } from "@shared/schema";
import { db } from "./db";
import { and, eq, inArray, lt } from "drizzle-orm";
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

const COIN_PACKS = [
  { id: "pack_100", coins: 100, priceUsd: 1, label: "100 Coins" },
  { id: "pack_500", coins: 500, priceUsd: 5, label: "500 Coins" },
  { id: "pack_1000", coins: 1000, priceUsd: 10, label: "1,000 Coins" },
  { id: "pack_2500", coins: 2500, priceUsd: 25, label: "2,500 Coins" },
  { id: "pack_5000", coins: 5000, priceUsd: 50, label: "5,000 Coins" },
  { id: "pack_10000", coins: 10000, priceUsd: 100, label: "10,000 Coins" },
];

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

function isAuthenticated(req: Request, res: Response, next: any) {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
  const user = req.user as any;
  if (user.isBanned) {
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
  sky_realm: "bg_sky_realm_td.png",
  snowy_mountain: "bg_snowy_mountain_td.png",
  volcanic: "bg_volcanic_td.png",
  haunted_woods: "bg_haunted_woods_td.png",
  enchanted_grove: "bg_enchanted_grove_td.png",
  island: "bg_island_td.png",
  desert: "bg_desert_td.png",
  swamp: "bg_swamp_v5.png",
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

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ field: "username", message: "Username can only contain letters, numbers, and underscores" });
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
      }

      req.login(user, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        const { password: _, ...safeUser } = user;
        return res.status(201).json(safeUser);
      });
    } catch (err: any) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        if (!user.welcomeV2Sent) {
          try { await grantWelcomeV2Bundle(user.id); } catch (e) { console.error("Welcome v2 grant failed:", e); }
        }
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
      return res.json({ message: "Your message has been sent! An admin will reach out to help you.", id: msg.id });
    } catch (err) {
      console.error("Support message error:", err);
      return res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/auth/reset-password/:token", async (req, res) => {
    try {
      const user = await storage.getUserByResetToken(req.params.token);
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
        const invItem = await storage.getInventoryItem(user.id, activePetId);
        if (!invItem) {
          return res.status(400).json({ message: "You don't own this pet" });
        }
        const shopItem = await storage.getShopItem(activePetId);
        if (!shopItem || shopItem.type !== "pet") {
          return res.status(400).json({ message: "This item is not a pet" });
        }
      }

      const updated = await storage.updateActivePet(user.id, activePetId);
      _activePetsCache = null; // new active pet must appear in Keeper's Central immediately
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
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser || targetUser.isBanned) {
        return res.status(404).json({ message: "User not found" });
      }

      const inventoryRows = await storage.getUserInventoryWithItems(targetUser.id);

      let activePet = null;
      if (targetUser.activePetId) {
        const activePetRow = inventoryRows.find(
          r => r.inventory.shopItemId === targetUser.activePetId && r.inventory.isHatched
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
      const badges = await storage.getUserBadges(req.params.userId);
      return res.json(badges);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  // Public pet list for visiting another player's pet house
  app.get("/api/users/:userId/pets", isAuthenticated, async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser || targetUser.isBanned) {
        return res.status(404).json({ message: "User not found" });
      }

      const [inventoryRows, savedPositions] = await Promise.all([
        storage.getUserInventoryWithItems(targetUser.id),
        storage.getPetHousePositions(targetUser.id),
      ]);
      const posMap = new Map(savedPositions.map(p => [p.inventoryId, { posLeft: p.posLeft, posTop: p.posTop }]));

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
      const { inventoryId } = req.params;
      const { posLeft, posTop } = req.body;
      if (typeof posLeft !== "string" || typeof posTop !== "string") {
        return res.status(400).json({ message: "posLeft and posTop are required strings" });
      }
      await storage.upsertPetHousePosition(user.id, inventoryId, posLeft, posTop);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to save position" });
    }
  });

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

      const itemsWithDetails = filteredRows.map(({ inventory: inv, shopItem }) => ({
        inventoryId: inv.id,
        shopItemId: inv.shopItemId,
        acquiredAt: inv.acquiredAt,
        name: shopItem?.name || "Unknown",
        type: shopItem?.type || "item",
        imageUrl: shopItem?.imageUrl || null,
        worldId: shopItem?.worldId || "",
        rarity: shopItem?.rarity || null,
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
        petNickname: inv.petNickname || null,
        hatchStartedAt: inv.hatchStartedAt,
        isHatched: inv.isHatched,
        petHealth: inv.petHealth,
        petAtk: inv.petAtk,
        petDef: inv.petDef,
        petLevel: inv.petLevel,
        petLevelPoints: inv.petLevelPoints,
        itemsUsedThisLevel: inv.itemsUsedThisLevel,
        atkBoost: shopItem?.atkBoost ?? null,
        defBoost: shopItem?.defBoost ?? null,
        healthBoost: shopItem?.healthBoost ?? null,
        specialSkill: shopItem?.specialSkill ?? null,
        skillDamagePercent: shopItem?.skillDamagePercent ?? null,
        fishingType: shopItem?.fishingType ?? null,
        rareCatchBoostPercent: shopItem?.rareCatchBoostPercent ?? null,
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
      const { inventoryId } = req.params;
      const allInv = await storage.getUserInventory(user.id);
      const item = allInv.find((inv) => inv.id === inventoryId);
      if (!item) {
        return res.status(404).json({ message: "Item not found in your inventory" });
      }
      if (item.shopItemId === user.activePetId) {
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
      const { inventoryId } = req.params;
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
      const { itemId } = req.params;
      const quantity = Math.min(Math.max(1, parseInt(req.body?.quantity ?? "1") || 1), 20);

      const shopItem = await storage.getShopItem(itemId);
      if (!shopItem) {
        return res.status(404).json({ message: "Item not found" });
      }

      if (shopItem.type === "pet") {
        const existing = await storage.getInventoryItem(user.id, itemId);
        if (existing) {
          return res.status(400).json({ message: "You already own this pet" });
        }
      } else {
        const dailyCount = await storage.getDailyItemPurchaseCount(user.id);
        if (dailyCount + quantity > 100) {
          return res.status(400).json({ message: "Daily purchase limit reached (100 items/day)" });
        }
      }

      const totalCost = shopItem.price * (shopItem.type === "pet" ? 1 : quantity);
      const currentUser = await storage.getUser(user.id);
      if (!currentUser || currentUser.coins < totalCost) {
        return res.status(400).json({ message: "Not enough coins" });
      }

      await storage.addCoins(user.id, -totalCost);

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

      const updatedUser = await storage.getUser(user.id);
      const { password: _, ...safeUser } = updatedUser!;

      return res.json({ inventory: invItem, user: safeUser, quantity: purchaseCount });
    } catch (err) {
      console.error("Buy item error:", err);
      return res.status(500).json({ message: "Failed to purchase item" });
    }
  });

  app.post("/api/pet/:inventoryId/hatch-check", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const invItem = await storage.getInventoryItemById(req.params.inventoryId);
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
      const { inventoryId } = req.params;
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
      const { inventoryId } = req.params;
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
      const { inventoryId } = req.params;
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

      const petInv = await storage.getInventoryItemById(req.params.inventoryId);
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
      const maxItemsPerLevel = rarity + 2;
      const totalUsed = Math.max(0, petInv.itemsUsedThisLevel);
      const totalAllowances = petInv.petLevel * maxItemsPerLevel;
      if (boostType !== "lvl" && totalUsed >= totalAllowances) {
        return res.status(400).json({ message: `No power-up slots available. Level up your pet to earn more!` });
      }

      const updates: any = { itemsUsedThisLevel: totalUsed + 1 };
      const boostAmount = itemShopItem.statBoostAmount || 10;

      if (boostType === "health") {
        updates.petHealth = petInv.petHealth + boostAmount;
      } else if (boostType === "atk") {
        updates.petAtk = petInv.petAtk + boostAmount;
      } else if (boostType === "def") {
        updates.petDef = petInv.petDef + boostAmount;
      } else if (boostType === "lvl") {
        const { newLevel, newPoints } = applyPetXp(petInv.petLevel, petInv.petLevelPoints || 0, boostAmount);
        updates.petLevelPoints = newPoints;
        if (newLevel > petInv.petLevel) {
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

      const petInv = await storage.getInventoryItemById(req.params.inventoryId);
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
        if (petInv.petLevel >= 100) {
          return res.status(400).json({ message: "Pet is at max level" });
        }
        const { newLevel, newPoints } = applyPetXp(petInv.petLevel, petInv.petLevelPoints || 0, specialAmount);
        const updates: any = { petLevelPoints: newPoints };
        if (newLevel !== petInv.petLevel) {
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

  app.post("/api/pet/:inventoryId/feed-edible", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { itemInventoryId } = req.body;

      const petInv = await storage.getInventoryItemById(req.params.inventoryId);
      if (!petInv || petInv.userId !== user.id) {
        return res.status(404).json({ message: "Pet not found" });
      }
      if (!petInv.isHatched) {
        return res.status(400).json({ message: "Pet has not hatched yet" });
      }
      if (petInv.petLevel >= 100) {
        return res.status(400).json({ message: "Pet is already at max level" });
      }

      const itemInv = await storage.getInventoryItemById(itemInventoryId);
      if (!itemInv || itemInv.userId !== user.id) {
        return res.status(404).json({ message: "Edible not found in inventory" });
      }

      const itemShopItem = await storage.getShopItem(itemInv.shopItemId);
      if (!itemShopItem || itemShopItem.type !== "edibles") {
        return res.status(400).json({ message: "Not an edible item" });
      }

      const lvlPoints = itemShopItem.statBoostAmount || 5;
      const { newLevel, newPoints } = applyPetXp(petInv.petLevel, petInv.petLevelPoints || 0, lvlPoints);
      const updates: any = { petLevelPoints: newPoints };
      if (newLevel > petInv.petLevel) {
        updates.petLevel = newLevel;
      }

      const updatedPet = await storage.updateInventoryItem(petInv.id, updates);
      await storage.removeFromInventory(itemInv.id);
      return res.json(updatedPet);
    } catch (err) {
      console.error("Feed edible error:", err);
      return res.status(500).json({ message: "Failed to feed edible" });
    }
  });

  app.post("/api/pet/:inventoryId/reset-stats", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const currentUser = await storage.getUser(user.id);
      if (!currentUser || currentUser.coins < 300) {
        return res.status(400).json({ message: "Not enough coins. Stat reset costs 300 coins." });
      }

      const petInv = await storage.getInventoryItemById(req.params.inventoryId);
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
      const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

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

      try {
        await storage.createCoinPurchase(user.id, amountUsd, coins, sessionId);
        await storage.addCoins(user.id, coins);
      } catch (err: any) {
        if (err.code === '23505') {
          const updatedUser = await storage.getUser(user.id);
          const { password: _, ...safeUser } = updatedUser!;
          return res.json({ alreadyCredited: true, coins, user: safeUser });
        }
        throw err;
      }

      const updatedUser = await storage.getUser(user.id);
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
      await storage.markSupportMessageRead(req.params.id);
      return res.json({ message: "Marked as read" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update message" });
    }
  });

  app.delete("/api/admin/support-messages/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteSupportMessage(req.params.id);
      return res.json({ message: "Message deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete message" });
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

  app.post("/api/admin/reset-password/:userId", isAdmin, async (req, res) => {
    try {
      const target = await storage.getUser(req.params.userId);
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
      const target = await storage.getUser(req.params.userId);
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.isAdmin) return res.status(400).json({ message: "Cannot banish an admin" });
      const updated = await storage.banUser(req.params.userId);
      const { password: _, ...safe } = updated;
      return res.json(safe);
    } catch (err) {
      console.error("Ban user error:", err);
      return res.status(500).json({ message: "Failed to banish user" });
    }
  });

  app.post("/api/admin/unban/:userId", isAdmin, async (req, res) => {
    try {
      const updated = await storage.unbanUser(req.params.userId);
      const { password: _, ...safe } = updated;
      return res.json(safe);
    } catch (err) {
      console.error("Unban user error:", err);
      return res.status(500).json({ message: "Failed to unbanish user" });
    }
  });

  app.post("/api/admin/coins/:userId", isAdmin, async (req, res) => {
    try {
      const { amount } = req.body;
      if (typeof amount !== "number" || amount === 0) {
        return res.status(400).json({ message: "Provide a valid coin amount" });
      }
      const updated = await storage.addCoins(req.params.userId, amount);
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
      const world = await storage.getWorld(req.params.worldId);
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
      const updated = await storage.updateWorldPosition(req.params.worldId, clamped.posX, clamped.posY);
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
      const world = await storage.getWorld(req.params.worldId);
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

      const updated = await storage.updateWorld(req.params.worldId, updates);
      return res.json(updated);
    } catch (err) {
      console.error("Update world error:", err);
      return res.status(500).json({ message: "Failed to update world" });
    }
  });

  app.delete("/api/admin/worlds/:worldId", isAdmin, async (req, res) => {
    try {
      const world = await storage.getWorld(req.params.worldId);
      if (!world) return res.status(404).json({ message: "World not found" });
      if (world.isDefault) return res.status(400).json({ message: "Cannot delete default worlds" });
      await storage.deleteWorld(req.params.worldId);
      return res.json({ message: "World deleted" });
    } catch (err) {
      console.error("Delete world error:", err);
      return res.status(500).json({ message: "Failed to delete world" });
    }
  });

  app.get("/api/world/:worldId/locations", isAuthenticated, async (req, res) => {
    try {
      const locations = await storage.getWorldLocations(req.params.worldId);
      const slim = locations.map(({ bgUrl, ...rest }) => rest);
      return res.json(slim);
    } catch (err) {
      console.error("Get world locations error:", err);
      return res.status(500).json({ message: "Failed to get locations" });
    }
  });

  app.get("/api/location/:locationId", isAuthenticated, async (req, res) => {
    try {
      const loc = await storage.getWorldLocation(req.params.locationId);
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
        iconUrl = await processWorldImage(iconData, 500);
      }
      if (bgData) {
        bgUrl = await processWorldImage(bgData, 2000);
      }
      if (ownerImageData) {
        ownerImageUrl = await processWorldImage(ownerImageData, 500);
      }

      const loc = await storage.createWorldLocation({
        worldId: req.params.worldId,
        name,
        type: type || (isShop ? "shop" : "battle"),
        iconUrl,
        bgUrl,
        ownerImageUrl,
        isShop: !!isShop,
        description: description || null,
        glowColor: glowColor || null,
        posX: typeof posX === "number" ? Math.max(0, Math.min(85, posX)) : 40,
        posY: typeof posY === "number" ? Math.max(0, Math.min(85, posY)) : 40,
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
      const items = await storage.getWorldDecorItems(req.params.worldId);
      return res.json(items);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get decor items" });
    }
  });

  app.post("/api/admin/world/:worldId/decor/items", isAdmin, async (req, res) => {
    try {
      const { name, imageUrl } = req.body;
      if (!name || !imageUrl) return res.status(400).json({ message: "name and imageUrl required" });
      const item = await storage.createWorldDecorItem({ worldId: req.params.worldId, name, imageUrl });
      return res.status(201).json(item);
    } catch (err) {
      return res.status(500).json({ message: "Failed to create decor item" });
    }
  });

  app.patch("/api/admin/world/decor/items/:itemId", isAdmin, async (req, res) => {
    try {
      const { name, imageUrl, message } = req.body;
      await storage.updateWorldDecorItem(req.params.itemId, { name, imageUrl, message });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update decor item" });
    }
  });

  app.delete("/api/admin/world/decor/items/:itemId", isAdmin, async (req, res) => {
    try {
      await storage.deleteWorldDecorItem(req.params.itemId);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete decor item" });
    }
  });

  // Active pets for the Pet World — returns every user's active hatched pet
  // 30-second server-side cache so repeated requests don't re-run the join query
  let _activePetsCache: { ts: number; data: any[] } | null = null;
  const ACTIVE_PETS_TTL = 30_000;

  app.get("/api/world/pet_world/active-pets", isAuthenticated, async (req, res) => {
    try {
      const now = Date.now();
      if (_activePetsCache && now - _activePetsCache.ts < ACTIVE_PETS_TTL) {
        return res.json(_activePetsCache.data);
      }
      const rows = await storage.getWorldActivePets("pet_world");
      _activePetsCache = { ts: now, data: rows };
      return res.json(rows);
    } catch (err) {
      console.error("World active pets error:", err);
      return res.status(500).json({ message: "Failed to get world pets" });
    }
  });

  app.patch("/api/world/pet_world/pet-position", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { ownerUserId, posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number" || !ownerUserId) {
        return res.status(400).json({ message: "ownerUserId, posX, posY required" });
      }
      await storage.upsertPetPosition("pet_world", ownerUserId, posX, posY);
      _activePetsCache = null; // bust so next fetch reflects the move
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update pet position" });
    }
  });

  app.get("/api/world/:worldId/decor/placements", async (req, res) => {
    try {
      const placements = await storage.getWorldDecorPlacements(req.params.worldId);
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
        worldId: req.params.worldId,
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
      const placement = await storage.updateWorldDecorPlacement(req.params.placementId, update);
      return res.json(placement);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update decor placement" });
    }
  });

  app.delete("/api/admin/world/decor/placements/:placementId", isAdmin, async (req, res) => {
    try {
      await storage.deleteWorldDecorPlacement(req.params.placementId);
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
        worldId: req.params.worldId,
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
      const orig = await storage.getWorldLocation(req.params.locationId);
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
        sanitized.iconUrl = await processWorldImage(iconData, 500);
      }
      if (bgData) {
        sanitized.bgUrl = await processWorldImage(bgData, 2000);
      }
      if (ownerImageData) {
        sanitized.ownerImageUrl = await processWorldImage(ownerImageData, 500);
      }
      if (glowColor !== undefined) sanitized.glowColor = glowColor || null;
      if (typeof posX === "number") sanitized.posX = Math.max(0, Math.min(85, posX));
      if (typeof posY === "number") sanitized.posY = Math.max(0, Math.min(85, posY));
      if (typeof req.body.iconSize === "number") sanitized.iconSize = Math.max(64, Math.min(500, req.body.iconSize));

      const updated = await storage.updateWorldLocation(req.params.locationId, sanitized);
      return res.json(updated);
    } catch (err) {
      console.error("Update world location error:", err);
      return res.status(500).json({ message: "Failed to update location" });
    }
  });

  const LOCATION_DEFAULT_BG: Record<string, string> = {
    "a1b2c3d4-0001-4000-8000-000000000001": "bg_murk_cave.png",
    "a1b2c3d4-0002-4000-8000-000000000002": "bg_willowmere_cottage.png",
    "a1b2c3d4-0003-4000-8000-000000000003": "bg_mosswood_lodge.png",
    "a1b2c3d4-0004-4000-8000-000000000004": "bg_tome_toad.png",
    "a1b2c3d4-0005-4000-8000-000000000005": "bg_swamp_critters.png",
    "a1b2c3d4-0006-4000-8000-000000000006": "bg_mossy_cauldron.png",
    "a1b2c3d4-0007-4000-8000-000000000007": "bg_myst_pond.png",
    "3e20ad30-faff-4643-9e80-5e5f30010738": "bg_thicket.png",
    "8e211716-0448-496e-8582-6ce1025ac4e4": "bg_bayous_heart.png",
  };

  app.post("/api/admin/world/location/:locationId/reset-bg", isAdmin, async (req, res) => {
    try {
      const { locationId } = req.params;
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
      const loc = await storage.getWorldLocation(req.params.locationId);
      let nextSortOrder = 0;
      if (loc) {
        const siblings = await storage.getWorldLocations(loc.worldId);
        const maxOrder = siblings.reduce((m, l) => Math.max(m, l.sortOrder ?? 0), 0);
        nextSortOrder = maxOrder + 1;
      }
      const updated = await storage.updateWorldLocation(req.params.locationId, {
        posX: Math.max(-10, Math.min(110, posX)),
        posY: Math.max(-10, Math.min(110, posY)),
        sortOrder: nextSortOrder,
      });
      return res.json(updated);
    } catch (err) {
      console.error("Update location position error:", err);
      return res.status(500).json({ message: "Failed to update position" });
    }
  });

  app.patch("/api/admin/world/location/:locationId/flip", isAdmin, async (req, res) => {
    try {
      const updated = await storage.flipWorldLocation(req.params.locationId);
      return res.json(updated);
    } catch (err) {
      console.error("Flip location error:", err);
      return res.status(500).json({ message: "Failed to flip location" });
    }
  });

  app.delete("/api/admin/world/location/:locationId", isAdmin, async (req, res) => {
    try {
      const locationId = req.params.locationId;
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
      const items = await storage.getShopItemsByWorld(req.params.worldId);
      return res.json(items);
    } catch (err) {
      console.error("Get shop items error:", err);
      return res.status(500).json({ message: "Failed to get shop items" });
    }
  });

  app.get("/api/location/:locationId/items", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getLocationItems(req.params.locationId);
      return res.json(items);
    } catch (err) {
      console.error("Get location items error:", err);
      return res.status(500).json({ message: "Failed to get location items" });
    }
  });

  app.post("/api/admin/location/:locationId/assign-item/:itemId", isAdmin, async (req, res) => {
    try {
      const item = await storage.getShopItem(req.params.itemId);
      if (!item) return res.status(404).json({ message: "Item not found" });
      // Bait items are catalog templates — copy them so the original stays available for other shops
      if (item.fishingType === "bait") {
        const { id: _id, createdAt: _ca, ...rest } = item as any;
        const copy = await storage.createShopItem({ ...rest, locationId: req.params.locationId });
        return res.json(copy);
      }
      const updated = await storage.assignItemToLocation(req.params.itemId, req.params.locationId);
      return res.json(updated);
    } catch (err) {
      console.error("Assign item to location error:", err);
      return res.status(500).json({ message: "Failed to assign item" });
    }
  });

  app.delete("/api/admin/location/:locationId/unassign-item/:itemId", isAdmin, async (req, res) => {
    try {
      const item = await storage.getShopItem(req.params.itemId);
      // Bait copies were created just for this shop — delete them instead of returning to catalog
      if (item?.fishingType === "bait" && item.locationId === req.params.locationId) {
        await storage.deleteShopItem(req.params.itemId);
        return res.json({ ok: true });
      }
      const updated = await storage.unassignItemFromLocation(req.params.itemId);
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
      const updated = await storage.updateShopItemPosition(req.params.itemId, posX, posY, width ?? 72);
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
      const item = await storage.getShopItem(req.params.itemId);
      if (!item) return res.status(404).json({ message: "Item not found" });
      const updated = await storage.updateShopItemPosition(req.params.itemId, item.shopPosX, item.shopPosY, clamped);
      return res.json(updated);
    } catch (err) {
      console.error("Update shop item size error:", err);
      return res.status(500).json({ message: "Failed to update size" });
    }
  });

  app.get("/api/pet-template-parts/:templateId", isAuthenticated, async (req, res) => {
    try {
      const { templateId } = req.params;
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
      const objects = await storage.getLocationObjects(req.params.locationId);
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
        locationId: req.params.locationId,
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
      const updated = await storage.updateLocationObject(req.params.objectId, {
        posX: Math.max(0, Math.min(100, Math.round(posX))),
        posY: Math.max(0, Math.min(100, Math.round(posY))),
      });
      return res.json(updated);
    } catch (err) {
      console.error("Update object position error:", err);
      return res.status(500).json({ message: "Failed to update object position" });
    }
  });

  app.delete("/api/admin/location/object/:objectId", isAdmin, async (req, res) => {
    try {
      await storage.deleteLocationObject(req.params.objectId);
      return res.json({ message: "Object deleted" });
    } catch (err) {
      console.error("Delete location object error:", err);
      return res.status(500).json({ message: "Failed to delete object" });
    }
  });

  app.get("/api/admin/pet-templates", isAdmin, async (_req, res) => {
    try {
      const templates = await storage.getAllPetTemplates();
      return res.json(templates);
    } catch (err) {
      console.error("Get pet templates error:", err);
      return res.status(500).json({ message: "Failed to get pet templates" });
    }
  });

  app.get("/api/admin/pet-templates/:id", isAdmin, async (req, res) => {
    try {
      const template = await storage.getPetTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: "Template not found" });
      const parts = await storage.getPetTemplateParts(req.params.id);
      return res.json({ ...template, parts });
    } catch (err) {
      console.error("Get pet template error:", err);
      return res.status(500).json({ message: "Failed to get pet template" });
    }
  });

  app.post("/api/admin/pet-templates", isAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Name is required" });
      }
      const template = await storage.createPetTemplate(name.trim());
      return res.status(201).json(template);
    } catch (err) {
      console.error("Create pet template error:", err);
      return res.status(500).json({ message: "Failed to create pet template" });
    }
  });

  app.patch("/api/admin/pet-templates/:id", isAdmin, async (req, res) => {
    try {
      const { name, frontAssembled, backAssembled, facing, canFly } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (frontAssembled !== undefined) updates.frontAssembled = frontAssembled;
      if (backAssembled !== undefined) updates.backAssembled = backAssembled;
      if (facing !== undefined) updates.facing = facing;
      if (canFly !== undefined) updates.canFly = canFly;
      const updated = await storage.updatePetTemplate(req.params.id, updates);
      return res.json(updated);
    } catch (err) {
      console.error("Update pet template error:", err);
      return res.status(500).json({ message: "Failed to update pet template" });
    }
  });

  app.delete("/api/admin/pet-templates/:id", isAdmin, async (req, res) => {
    try {
      await storage.deletePetTemplate(req.params.id);
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
        templateId: req.params.id,
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
      const updated = await storage.updatePetTemplatePart(req.params.partId, updates);
      templatePartsCache.clear();
      return res.json(updated);
    } catch (err) {
      console.error("Update pet template part error:", err);
      return res.status(500).json({ message: "Failed to update part" });
    }
  });

  app.delete("/api/admin/pet-template-parts/:partId", isAdmin, async (req, res) => {
    try {
      await storage.deletePetTemplatePart(req.params.partId);
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
      const template = await storage.getPetTemplate(req.params.id);
      if (!template) return res.status(404).json({ message: "Template not found" });

      const parts = await storage.getPetTemplateParts(req.params.id);
      const viewParts = parts.filter(p => p.view === view).sort((a, b) => a.zIndex - b.zIndex);

      if (viewParts.length === 0) {
        return res.status(400).json({ message: `No ${view} parts to assemble` });
      }

      const cw = Math.min(canvasWidth, 1000);
      const ch = Math.min(canvasHeight, 1000);

      const composites: { input: Buffer; left: number; top: number; width: number; height: number }[] = [];

      for (const part of viewParts) {
        const base64Data = part.imageUrl.replace(/^data:image\/\w+;base64,/, "");
        const buf = Buffer.from(base64Data, "base64");
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

      const updated = await storage.updatePetTemplate(req.params.id, updates);
      return res.json(updated);
    } catch (err) {
      console.error("Assemble pet template error:", err);
      return res.status(500).json({ message: "Failed to assemble pet" });
    }
  });

  async function processWorldImage(imageData: string, maxSize: number): Promise<string> {
    const mimeMatch = imageData.match(/^data:(image\/(png|gif|jpeg|jpg));base64,/);
    if (!mimeMatch) {
      throw new Error("Invalid image format. Only PNG, GIF, and JPEG are supported.");
    }
    const mimeType = mimeMatch[1];
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    if (base64Data.length > 15 * 1024 * 1024) {
      throw new Error("Image data too large. Max 15MB.");
    }
    const imageBuffer = Buffer.from(base64Data, "base64");
    const isGif = mimeType === "image/gif";
    if (isGif) {
      const resized = await sharp(imageBuffer, { animated: true })
        .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
        .gif()
        .toBuffer();
      return `data:image/gif;base64,${resized.toString("base64")}`;
    } else {
      const resized = await sharp(imageBuffer)
        .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
        .png({ quality: 90 })
        .toBuffer();
      return `data:image/png;base64,${resized.toString("base64")}`;
    }
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
        try { imageUrl = await processShopItemImage(imageData); } catch (e) { console.error("Image error:", e); }
      }

      let eggImageUrl: string | null = null;
      if (eggImageData) {
        try { eggImageUrl = await processShopItemImage(eggImageData); } catch (e) { console.error("Egg image error:", e); }
      }

      let hatchedImageUrl: string | null = null;
      if (hatchedImageData) {
        try { hatchedImageUrl = await processShopItemImage(hatchedImageData); } catch (e) { console.error("Hatched image error:", e); }
      }

      let hooklessImageUrl: string | null = null;
      if (hooklessImageData) {
        try { hooklessImageUrl = await processShopItemImage(hooklessImageData); } catch (e) { console.error("Hookless image error:", e); }
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
        try { updateData.imageUrl = await processShopItemImage(imageData); } catch (e) { console.error("Image error:", e); }
      }
      if (eggImageData) {
        try { updateData.eggImageUrl = await processShopItemImage(eggImageData); } catch (e) { console.error("Egg image error:", e); }
      }
      if (hatchedImageData) {
        try { updateData.hatchedImageUrl = await processShopItemImage(hatchedImageData); } catch (e) { console.error("Hatched image error:", e); }
      }
      if (hooklessImageData) {
        try { updateData.hooklessImageUrl = await processShopItemImage(hooklessImageData); } catch (e) { console.error("Hookless image error:", e); }
      }

      const updated = await storage.updateShopItem(req.params.itemId, updateData);
      return res.json(updated);
    } catch (err) {
      console.error("Update shop item error:", err);
      return res.status(500).json({ message: "Failed to update shop item" });
    }
  });

  app.delete("/api/admin/shop/:itemId", isAdmin, async (req, res) => {
    try {
      await storage.deleteShopItem(req.params.itemId);
      return res.json({ message: "Item deleted" });
    } catch (err) {
      console.error("Delete shop item error:", err);
      return res.status(500).json({ message: "Failed to delete shop item" });
    }
  });

  app.get("/api/admin/shop-items-all", isAdmin, async (req, res) => {
    try {
      const items = await storage.getAllShopItems();
      return res.json(items);
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
        return { name, qty, found: !!shop, imageUrl: shop?.imageUrl ?? null, type: shop?.type ?? null };
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

  app.post("/api/admin/delete-unclaimed-welcome-bundles", isAdmin, async (req, res) => {
    try {
      const unclaimedRewards = await db.select().from(userRewards).where(eq(userRewards.claimed, false));
      let deleted = 0;
      for (const reward of unclaimedRewards) {
        const bundle = await storage.getRewardBundle(reward.bundleId);
        if (!bundle || bundle.name !== "Welcome to the Realm!") continue;
        await db.delete(userRewards).where(eq(userRewards.id, reward.id));
        await db.delete(rewardBundleItems).where(eq(rewardBundleItems.bundleId, bundle.id));
        await db.delete(rewardBundles).where(eq(rewardBundles.id, bundle.id));
        deleted++;
      }
      console.log(`[DeleteWelcomeBundles] Deleted ${deleted} unclaimed welcome bundles`);
      return res.json({ message: `Deleted ${deleted} unclaimed welcome bundle${deleted !== 1 ? "s" : ""}`, deleted });
    } catch (err) {
      console.error("Delete unclaimed welcome bundles error:", err);
      return res.status(500).json({ message: "Failed to delete unclaimed welcome bundles" });
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

      const existing = await storage.getUserReward(req.params.rewardId);
      if (!existing) {
        return res.status(404).json({ message: "Reward not found" });
      }
      if (existing.claimed) {
        return res.status(404).json({ message: "Reward already claimed" });
      }
      if (existing.userId !== user.id) {
        return res.status(403).json({ message: "This reward is not yours" });
      }

      const claimed = await storage.claimReward(req.params.rewardId);
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

      const DUP_PET_COINS: Record<number, number> = { 1: 100, 2: 150, 3: 250, 4: 1000, 5: 2000 };

      const bundleItems = await storage.getRewardBundleItems(bundle.id);
      const duplicatePets: { name: string; coinsAwarded: number }[] = [];

      for (const bi of bundleItems) {
        const shopItem = await storage.getShopItem(bi.shopItemId);
        if (shopItem) {
          if (shopItem.type === "pet") {
            const existing = await storage.getInventoryItem(user.id, bi.shopItemId);
            if (existing) {
              const rarity = shopItem.starRarity ?? 1;
              const coins = DUP_PET_COINS[rarity] ?? 100;
              await storage.addCoins(user.id, coins);
              duplicatePets.push({ name: shopItem.name, coinsAwarded: coins });
              continue;
            }
          }
          const invItem = await storage.addToInventory(user.id, bi.shopItemId);
          if (shopItem.type === "pet" && shopItem.hatchTime) {
            await storage.updateInventoryItem(invItem.id, { hatchStartedAt: new Date() });
          }
        }
      }

      const updatedUser = await storage.getUser(user.id);
      const { password: _, ...safeUser } = updatedUser!;

      return res.json({ user: safeUser, duplicatePets });
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
      const { locationId } = req.params;
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
      const { locationId } = req.params;
      const { name, imageData, coinReward, isBoss } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ message: "Enemy name is required" });
      }
      let imageUrl: string | null = null;
      if (imageData) {
        try { imageUrl = await processWorldImage(imageData, 1000); } catch (e) { console.error("Enemy image error:", e); }
      }
      const enemy = await storage.createLocationEnemy({ locationId, name: name.trim(), imageUrl, isBoss: !!isBoss, coinReward: coinReward || 0 });
      return res.status(201).json(enemy);
    } catch (err) {
      console.error("Create enemy error:", err);
      return res.status(500).json({ message: "Failed to create enemy" });
    }
  });

  app.patch("/api/admin/enemy/:enemyId", isAdmin, async (req, res) => {
    try {
      const { enemyId } = req.params;
      const { name, imageData, coinReward, isBoss } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim();
      if (coinReward !== undefined) updates.coinReward = coinReward;
      if (isBoss !== undefined) updates.isBoss = !!isBoss;
      if (imageData) {
        try { updates.imageUrl = await processWorldImage(imageData, 1000); } catch (e) { console.error("Enemy image error:", e); }
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
      await storage.deleteLocationEnemy(req.params.enemyId);
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete enemy error:", err);
      return res.status(500).json({ message: "Failed to delete enemy" });
    }
  });

  app.post("/api/admin/enemy/:enemyId/drop", isAdmin, async (req, res) => {
    try {
      const { enemyId } = req.params;
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
      await storage.deleteEnemyDrop(req.params.dropId);
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
        rarity: shopItem?.rarity ?? null,
      }));
      const activePet = inventoryJoined.find((inv: any) => inv.shopItemId === user.activePetId && inv.isHatched);
      if (!activePet) {
        return res.status(400).json({ message: "Keepers must have a hatched pet to explore safely" });
      }

      const { locationId } = req.params;
      const enemies = await storage.getLocationEnemies(locationId);
      if (enemies.length === 0) {
        return res.json({ encounter: null });
      }

      const petLevel = activePet.petLevel || 0;
      const petHp = activePet.petHealth || 1000;
      const petAtk = activePet.petAtk || 50;
      const petDef = activePet.petDef || 50;

      const normals = enemies.filter(e => !e.isBoss).sort(() => Math.random() - 0.5);
      const bosses = enemies.filter(e => e.isBoss).sort(() => Math.random() - 0.5);
      const ordered = [...normals, ...bosses];
      const encounters = await Promise.all(ordered.map(async (enemy, waveIndex) => {
        const waveScaling = 1 + (waveIndex * 0.15);
        const maxLevelOffset = enemy.isBoss ? 5 : 2;
        const enemyLevel = Math.max(1, petLevel + Math.floor(Math.random() * (maxLevelOffset + 1)));
        const bossHpMult = enemy.isBoss ? 4.0 : 1.0;
        const bossStatMult = enemy.isBoss ? 2.5 : 1.0;
        const enemyHp = Math.max(200, Math.floor(petHp * 2 * bossHpMult * waveScaling));
        const enemyAtk = Math.max(10, Math.floor(petAtk * (2 / 3) * bossStatMult * waveScaling));
        const enemyDef = Math.max(5, Math.floor(petDef * (2 / 3) * bossStatMult * waveScaling));

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
          level: enemyLevel,
          hp: enemyHp,
          atk: enemyAtk,
          def: enemyDef,
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
      const activePet = inventory.find((inv: any) => inv.shopItemId === user.activePetId && inv.isHatched);
      if (!activePet) {
        return res.status(400).json({ message: "No active hatched pet" });
      }

      const { enemyId } = req.params;
      const { enemyLevel: clientEnemyLevel } = req.body;
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

      let totalPoints = (activePet.petLevelPoints || 0) + lvlPointsEarned;
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

      let coinsAwarded = enemy.coinReward || 0;
      if (coinsAwarded > 0) {
        await storage.addCoins(user.id, coinsAwarded);
      }

      const drops = await storage.getEnemyDrops(enemy.id);
      const droppedItems: any[] = [];
      for (const drop of drops) {
        const roll = Math.random() * 100;
        if (roll < drop.dropRate) {
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
        newLevel,
        newLevelPoints: totalPoints,
        pointsNeeded: Math.floor(100 + newLevel * 30 + newLevel * newLevel * 5),
        levelsGained: newLevel - activePet.petLevel,
        coinsAwarded,
        droppedItems,
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

      await storage.removeFromInventory(inventoryId);

      return res.json({ healAmount, manaAmount, potionName: shopItem.name });
    } catch (err) {
      console.error("Use potion error:", err);
      return res.status(500).json({ message: "Failed to use potion" });
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
      const { name, imageData, dailyRewardCoins } = req.body;
      if (!name || !imageData) return res.status(400).json({ message: "name and imageData required" });
      const imageUrl = await processWorldImage(imageData, 1000);
      const badge = await storage.createBadge(name, imageUrl, dailyRewardCoins ? Number(dailyRewardCoins) : null);
      return res.json(badge);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to create badge" });
    }
  });

  app.delete("/api/admin/badges/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteBadge(req.params.id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete badge" });
    }
  });

  app.patch("/api/admin/badges/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { dailyRewardCoins } = req.body;
      const coins = dailyRewardCoins != null && dailyRewardCoins !== "" ? Number(dailyRewardCoins) : null;
      await storage.updateBadgeDailyReward(req.params.id, coins);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to update badge" });
    }
  });

  app.get("/api/admin/badges/:id/recipients", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const recipients = await storage.getBadgeRecipients(req.params.id);
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
        await storage.awardBadge(uid, req.params.id);
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
        await storage.revokeBadge(uid, req.params.id);
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
      const { badgeId } = req.body;
      if (!badgeId) return res.status(400).json({ message: "badgeId required" });

      // Verify player owns this badge
      const myBadges = await storage.getUserBadges(user.id);
      const badge = myBadges.find(b => b.badgeId === badgeId);
      if (!badge) return res.status(403).json({ message: "You don't have this badge" });

      const reward = badge.dailyRewardCoins;
      if (!reward) return res.status(400).json({ message: "This badge has no daily reward" });

      // Check 24h cooldown
      if (badge.lastClaimedAt) {
        const msSinceClaim = Date.now() - new Date(badge.lastClaimedAt).getTime();
        if (msSinceClaim < 24 * 60 * 60 * 1000) {
          const msLeft = 24 * 60 * 60 * 1000 - msSinceClaim;
          return res.status(429).json({ message: "Already claimed today", msLeft });
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
      const listing = await storage.getMarketListing(req.params.listingId);
      if (!listing) return res.status(404).json({ message: "Listing not found" });
      if (listing.status !== "active") return res.status(400).json({ message: "This item is no longer available" });
      if (listing.sellerId === user.id) return res.status(400).json({ message: "You cannot buy your own listing" });

      const fullUser = await storage.getUser(user.id);
      if (!fullUser || fullUser.coins < listing.price) return res.status(400).json({ message: "Not enough coins" });

      await storage.addCoins(user.id, -listing.price);
      const { price } = await storage.buyMarketListing(listing.id, user.id);
      return res.json({ ok: true, price });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to buy listing" });
    }
  });

  app.post("/api/market/:listingId/collect", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const coinsEarned = await storage.collectMarketCoins(req.params.listingId, user.id);
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
      await storage.cancelMarketListing(req.params.listingId, user.id);
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

  app.get("/api/admin/fish-parts/:fishItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const parts = await storage.getFishTemplateParts(req.params.fishItemId);
      return res.json(parts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  const ALLOWED_FISH_PART_TYPES = new Set(["body", "eyes", "tail"]);
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
        fishItemId: req.params.fishItemId,
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
      const part = await storage.updateFishTemplatePart(req.params.partId, req.body);
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/fish-parts/:partId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteFishTemplatePart(req.params.partId);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/location/:locationId/pond-fish", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const fish = await storage.getPondFish(req.params.locationId);
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
      const location = await storage.getWorldLocation(req.params.locationId);
      if (!location || location.type !== "fishing") return res.status(400).json({ message: "Location must be a fishing-type location" });
      const fishItem = await storage.getShopItem(shopItemId);
      if (!fishItem || fishItem.type !== "fishing" || fishItem.fishingType !== "fish") {
        return res.status(400).json({ message: "Item must be a fish-type fishing item" });
      }
      const entry = await storage.addFishToPond(req.params.locationId, shopItemId);
      return res.json(entry);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/location/:locationId/pond-fish/:shopItemId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.removeFishFromPond(req.params.locationId, req.params.shopItemId);
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
      const fish = await storage.getPondFish(req.params.locationId);
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
      return res.json(fish);
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
        let poleBoost = 0;
        let baitBoost = 0;
        if (equipment?.poleInventoryId) {
          const inv = await storage.getInventoryItemById(equipment.poleInventoryId);
          if (inv) {
            const pole = await storage.getShopItem(inv.shopItemId);
            poleBoost = pole?.rareCatchBoostPercent ?? 0;
          }
        }
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
        const fishPool = pondEntries.map(entry => {
          const star = parseInt(String(entry.item?.starRarity ?? 1), 10) || 1;
          let weight = (baseWeights[star] ?? 10) / (rarityCounts[star] ?? 1);
          // Apply bait boost only to the specific target star rarity
          if (baitBoost > 0 && baitRarityBoostStar > 0 && star === baitRarityBoostStar) {
            weight += (baitBoost / 100) * weight;
          }
          if (star >= 4) weight += (poleBoost / 100) * weight;
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

      return res.json({ caught, item: chosenEntry.item });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // Fish barrel routes
  app.get("/api/world/:worldId/fish-barrel", isAuthenticated, async (req, res) => {
    try {
      const barrel = await storage.getFishBarrelByWorld(req.params.worldId);
      return res.json(barrel || null);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/world/:worldId/fish-barrel", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      const existing = await storage.getFishBarrelByWorld(req.params.worldId);
      if (existing) return res.status(400).json({ message: "Barrel already exists" });
      const barrel = await storage.createFishBarrel(req.params.worldId);
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
      const barrel = await storage.updateFishBarrel(req.params.id, { posX, posY, size });
      return res.json(barrel);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/fish-barrel/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Admin only" });
      await storage.deleteFishBarrel(req.params.id);
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
      if (!Array.isArray(counts)) return res.status(400).json({ message: "counts array required" });
      await storage.syncAquariumFish(user.id, counts);
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
          return shopItem ? { ...inv, ...shopItem } : null;
        })
        .filter(Boolean)
        .find((inv: any) => inv.shopItemId === user.activePetId && inv.isHatched);

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
      const { opponentName, opponentImageUrl, opponentLevel, opponentSkill, result, opponentUserId } = req.body;
      if (!["win", "loss"].includes(result)) return res.status(400).json({ message: "Invalid result" });

      const lvl = Math.max(1, opponentLevel || 1);
      const WIN_COINS = 15 + Math.floor(lvl * 2);
      const WIN_BP = 100 + Math.floor(lvl * 5);
      const LOSS_BP = -25;

      const coinsEarned = result === "win" ? WIN_COINS : 0;
      const battlePointsDelta = result === "win" ? WIN_BP : LOSS_BP;

      if (coinsEarned > 0) await storage.addCoins(user.id, coinsEarned);

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

  // Global leaderboard
  app.get("/api/pvp/leaderboard", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const board = await storage.getPvpLeaderboard(30);
      return res.json(board);
    } catch (err) {
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
      // Exclude current user, only show those with at least 1 pet
      const opponents = all.filter((g: any) => g.userId !== user.id && g.petInventoryIds?.length > 0);
      return res.json(opponents);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch opponents" });
    }
  });

  // Get a specific user's full inventory with pet details (for building opponent battle group)
  app.get("/api/pvp/opponent-pets/:userId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
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
      const { targetUserId } = req.params;
      if (requesterId === targetUserId) return res.status(400).json({ message: "Cannot friend yourself" });
      const outgoingCount = await storage.getOutgoingPendingRequestCount(requesterId);
      if (outgoingCount >= 25) return res.status(400).json({ message: "You have reached the limit of 25 unanswered friend requests. Wait for some to be accepted before sending more." });
      const result = await storage.sendFriendRequest(requesterId, targetUserId);
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
      const { requestId } = req.params;
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
      const { otherId } = req.params;
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
      const { otherId } = req.params;
      const friendship = await storage.getFriendshipStatus(userId, otherId);
      return res.json({ friendship });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get friendship status" });
    }
  });

  return httpServer;
}
