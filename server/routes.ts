import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "./storage";
import { insertUserSchema, updateUsernameSchema, insertShopItemSchema } from "@shared/schema";
import sharp from "sharp";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await ensureAdminAccount();

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password, profileImageData } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ message: "Username, email, and password are required" });
      }

      if (!/^[a-zA-Z0-9]+$/.test(username)) {
        return res.status(400).json({ message: "Username can only contain letters and numbers" });
      }
      if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ message: "Username must be 3-20 characters" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
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
        const welcomeBundle = await storage.createRewardBundle("Welcome to the Realm!", 100);
        await storage.createUserReward(user.id, welcomeBundle.id);
      } catch (rewardErr) {
        console.error("Failed to create welcome reward, giving coins directly:", rewardErr);
        await storage.addCoins(user.id, 100);
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
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        const { password: _, ...safeUser } = user;
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

  app.patch("/api/user/username", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { username } = req.body;

      const parse = updateUsernameSchema.safeParse({ username });
      if (!parse.success) {
        return res.status(400).json({ message: parse.error.errors[0].message });
      }

      if (user.lastUsernameChange) {
        const lastChange = new Date(user.lastUsernameChange);
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        if (lastChange > oneMonthAgo) {
          return res.status(400).json({ message: "You can only change your username once per month" });
        }
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
      const { password: _, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
      console.error("Update active pet error:", err);
      return res.status(500).json({ message: "Failed to update active pet" });
    }
  });

  app.get("/api/inventory", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const rows = await storage.getUserInventoryWithItems(user.id);
      const itemsWithDetails = rows.map(({ inventory: inv, shopItem }) => ({
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
      }));
      return res.json(itemsWithDetails);
    } catch (err) {
      console.error("Get inventory error:", err);
      return res.status(500).json({ message: "Failed to get inventory" });
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

      const shopItem = await storage.getShopItem(itemId);
      if (!shopItem) {
        return res.status(404).json({ message: "Item not found" });
      }

      if (shopItem.worldId !== req.params.worldId) {
        return res.status(400).json({ message: "Item does not belong to this world" });
      }

      if (shopItem.type === "pet") {
        const existing = await storage.getInventoryItem(user.id, itemId);
        if (existing) {
          return res.status(400).json({ message: "You already own this pet" });
        }
      } else {
        const dailyCount = await storage.getDailyItemPurchaseCount(user.id);
        if (dailyCount >= 100) {
          return res.status(400).json({ message: "Daily purchase limit reached (100 items/day)" });
        }
      }

      const currentUser = await storage.getUser(user.id);
      if (!currentUser || currentUser.coins < shopItem.price) {
        return res.status(400).json({ message: "Not enough coins" });
      }

      await storage.addCoins(user.id, -shopItem.price);
      let invItem = await storage.addToInventory(user.id, itemId);

      if (shopItem.type === "pet" && shopItem.hatchTime) {
        const updated = await storage.updateInventoryItem(invItem.id, { hatchStartedAt: new Date() });
        if (updated) invItem = updated;
      }

      const updatedUser = await storage.getUser(user.id);
      const { password: _, ...safeUser } = updatedUser!;

      return res.json({ inventory: invItem, user: safeUser });
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
          await storage.updateInventoryItem(invItem.id, { isHatched: true });
          return res.json({ isHatched: true });
        }
      }
      return res.json({ isHatched: false });
    } catch (err) {
      console.error("Hatch check error:", err);
      return res.status(500).json({ message: "Failed to check hatch status" });
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
      if (!itemShopItem || itemShopItem.type !== "item") {
        return res.status(400).json({ message: "Not a usable item" });
      }

      const boostType = itemShopItem.statBoostType;
      if (!boostType) {
        return res.status(400).json({ message: "This item has no stat boost" });
      }

      const rarity = petShopItem.rarity || 1;
      const maxItemsPerLevel = rarity + 2;
      if (boostType !== "lvl" && petInv.itemsUsedThisLevel >= maxItemsPerLevel) {
        return res.status(400).json({ message: `This pet can only use ${maxItemsPerLevel} items per level. Level up first!` });
      }

      const updates: any = { itemsUsedThisLevel: petInv.itemsUsedThisLevel + 1 };
      const boostAmount = itemShopItem.statBoostAmount || 10;

      if (boostType === "health") {
        updates.petHealth = petInv.petHealth + boostAmount;
      } else if (boostType === "atk") {
        updates.petAtk = petInv.petAtk + boostAmount;
      } else if (boostType === "def") {
        updates.petDef = petInv.petDef + boostAmount;
      } else if (boostType === "lvl") {
        let totalPoints = (petInv.petLevelPoints || 0) + boostAmount;
        let newLevel = petInv.petLevel;
        while (newLevel < 100) {
          const needed = 50 + (newLevel * 10);
          if (totalPoints < needed) break;
          totalPoints -= needed;
          newLevel++;
        }
        if (newLevel >= 100) totalPoints = 0;
        updates.petLevelPoints = totalPoints;
        if (newLevel > petInv.petLevel) {
          updates.petLevel = newLevel;
          updates.itemsUsedThisLevel = 0;
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
        let totalPoints = (petInv.petLevelPoints || 0) + specialAmount;
        let newLevel = petInv.petLevel;
        while (newLevel < 100) {
          const needed = 50 + (newLevel * 10);
          if (totalPoints < needed) break;
          totalPoints -= needed;
          newLevel++;
        }
        if (newLevel >= 100) totalPoints = 0;
        const updates: any = { petLevelPoints: totalPoints };
        if (newLevel !== petInv.petLevel) {
          updates.petLevel = newLevel;
          updates.itemsUsedThisLevel = 0;
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
      const updatedPet = await storage.updateInventoryItem(petInv.id, {
        petHealth: 1000,
        petAtk: 50,
        petDef: 50,
        petLevel: 0,
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
      const clamped = { posX: Math.max(0, Math.min(85, Math.round(posX))), posY: Math.max(0, Math.min(90, Math.round(posY))) };
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

      const { name, glowColor, iconData, bgData } = req.body;
      const updates: Record<string, any> = {};

      if (name && typeof name === "string" && name.trim()) updates.name = name.trim();
      if (glowColor && typeof glowColor === "string") updates.glowColor = glowColor;

      if (iconData) {
        updates.iconUrl = await processWorldImage(iconData, 500);
      }
      if (bgData) {
        updates.bgUrl = await processWorldImage(bgData, 2000);
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
      return res.json(locations);
    } catch (err) {
      console.error("Get world locations error:", err);
      return res.status(500).json({ message: "Failed to get locations" });
    }
  });

  app.post("/api/admin/world/:worldId/location", isAdmin, async (req, res) => {
    try {
      const { name, description, iconData, bgData, ownerImageData, isShop, type, posX, posY } = req.body;
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
        type: type || (isShop ? "shop" : "explore"),
        iconUrl,
        bgUrl,
        ownerImageUrl,
        isShop: !!isShop,
        description: description || null,
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

  app.patch("/api/admin/world/location/:locationId", isAdmin, async (req, res) => {
    try {
      const sanitized: Record<string, any> = {};
      const { name, description, iconData, bgData, ownerImageData, isShop, type, posX, posY } = req.body;

      if (name !== undefined) sanitized.name = name;
      if (description !== undefined) sanitized.description = description;
      if (type !== undefined) {
        sanitized.type = type;
        sanitized.isShop = type === "shop";
      } else if (isShop !== undefined) {
        sanitized.isShop = !!isShop;
        sanitized.type = isShop ? "shop" : "explore";
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
      if (typeof posX === "number") sanitized.posX = Math.max(0, Math.min(85, posX));
      if (typeof posY === "number") sanitized.posY = Math.max(0, Math.min(85, posY));

      const updated = await storage.updateWorldLocation(req.params.locationId, sanitized);
      return res.json(updated);
    } catch (err) {
      console.error("Update world location error:", err);
      return res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.patch("/api/admin/world/location/:locationId/position", isAdmin, async (req, res) => {
    try {
      const { posX, posY } = req.body;
      if (typeof posX !== "number" || typeof posY !== "number") {
        return res.status(400).json({ message: "posX and posY are required numbers" });
      }
      const updated = await storage.updateWorldLocation(req.params.locationId, {
        posX: Math.max(0, Math.min(85, Math.round(posX))),
        posY: Math.max(0, Math.min(85, Math.round(posY))),
      });
      return res.json(updated);
    } catch (err) {
      console.error("Update location position error:", err);
      return res.status(500).json({ message: "Failed to update position" });
    }
  });

  app.delete("/api/admin/world/location/:locationId", isAdmin, async (req, res) => {
    try {
      await storage.deleteWorldLocation(req.params.locationId);
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
      const updated = await storage.assignItemToLocation(req.params.itemId, req.params.locationId);
      return res.json(updated);
    } catch (err) {
      console.error("Assign item to location error:", err);
      return res.status(500).json({ message: "Failed to assign item" });
    }
  });

  app.delete("/api/admin/location/:locationId/unassign-item/:itemId", isAdmin, async (req, res) => {
    try {
      const updated = await storage.unassignItemFromLocation(req.params.itemId);
      return res.json(updated);
    } catch (err) {
      console.error("Unassign item from location error:", err);
      return res.status(500).json({ message: "Failed to unassign item" });
    }
  });

  app.get("/api/pet-template-parts/:templateId", isAuthenticated, async (req, res) => {
    try {
      const parts = await storage.getPetTemplateParts(req.params.templateId);
      return res.json({ parts });
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
      const { name, frontAssembled, backAssembled } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (frontAssembled !== undefined) updates.frontAssembled = frontAssembled;
      if (backAssembled !== undefined) updates.backAssembled = backAssembled;
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
      return res.json(updated);
    } catch (err) {
      console.error("Update pet template part error:", err);
      return res.status(500).json({ message: "Failed to update part" });
    }
  });

  app.delete("/api/admin/pet-template-parts/:partId", isAdmin, async (req, res) => {
    try {
      await storage.deletePetTemplatePart(req.params.partId);
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
      const { imageData, eggImageData, hatchedImageData, ...itemData } = req.body;
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

      const item = await storage.createShopItem({ ...parse.data, imageUrl, eggImageUrl, hatchedImageUrl });
      return res.status(201).json(item);
    } catch (err) {
      console.error("Create shop item error:", err);
      return res.status(500).json({ message: "Failed to create shop item" });
    }
  });

  app.patch("/api/admin/shop/:itemId", isAdmin, async (req, res) => {
    try {
      const { imageData, eggImageData, hatchedImageData, ...updateData } = req.body;

      if (imageData) {
        try { updateData.imageUrl = await processShopItemImage(imageData); } catch (e) { console.error("Image error:", e); }
      }
      if (eggImageData) {
        try { updateData.eggImageUrl = await processShopItemImage(eggImageData); } catch (e) { console.error("Egg image error:", e); }
      }
      if (hatchedImageData) {
        try { updateData.hatchedImageUrl = await processShopItemImage(hatchedImageData); } catch (e) { console.error("Hatched image error:", e); }
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

      const claimed = await storage.claimReward(req.params.rewardId);
      if (!claimed) {
        return res.status(404).json({ message: "Reward not found or already claimed" });
      }

      if (claimed.userId !== user.id) {
        return res.status(403).json({ message: "This reward is not yours" });
      }

      const bundle = await storage.getRewardBundle(claimed.bundleId);
      if (!bundle) {
        return res.status(404).json({ message: "Bundle not found" });
      }

      if (bundle.coinAmount > 0) {
        await storage.addCoins(user.id, bundle.coinAmount);
      }

      const bundleItems = await storage.getRewardBundleItems(bundle.id);
      for (const bi of bundleItems) {
        const shopItem = await storage.getShopItem(bi.shopItemId);
        if (shopItem) {
          const invItem = await storage.addToInventory(user.id, bi.shopItemId);
          if (shopItem.type === "pet" && shopItem.hatchTime) {
            await storage.updateInventoryItem(invItem.id, { hatchStartedAt: new Date() });
          }
        }
      }

      const updatedUser = await storage.getUser(user.id);
      const { password: _, ...safeUser } = updatedUser!;

      return res.json({ user: safeUser });
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
      const inventory = await storage.getUserInventory(user.id);
      const activePet = inventory.find((inv: any) => inv.shopItemId === user.activePetId && inv.isHatched);
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
      const enemy = enemies[Math.floor(Math.random() * enemies.length)];
      const maxLevelOffset = enemy.isBoss ? 5 : 2;
      const enemyLevel = Math.max(1, petLevel + Math.floor(Math.random() * (maxLevelOffset + 1)));

      const levelRatio = enemyLevel / Math.max(1, petLevel || 1);
      const bossMult = enemy.isBoss ? 1.5 : 1.0;
      const enemyHp = Math.max(200, Math.floor(petHp * 0.6 * levelRatio * bossMult));
      const enemyAtk = Math.max(10, Math.floor(petAtk * 0.7 * levelRatio * bossMult));
      const enemyDef = Math.max(5, Math.floor(petDef * 0.4 * levelRatio * bossMult));

      const drops = await storage.getEnemyDrops(enemy.id);
      const dropDetails = await Promise.all(drops.map(async (drop) => {
        const shopItem = await storage.getShopItem(drop.shopItemId);
        return shopItem ? { id: drop.id, dropRate: drop.dropRate, shopItem: { id: shopItem.id, name: shopItem.name, type: shopItem.type, imageUrl: shopItem.imageUrl } } : null;
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
        encounter: {
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
        },
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
      const levelRatio = enemyLevel / Math.max(1, petLevel || 1);
      const bossMult = enemy.isBoss ? 1.5 : 1.0;
      const startingHp = Math.max(200, Math.floor(petHp * 0.6 * levelRatio * bossMult));
      const lvlPointsEarned = Math.max(1, Math.floor(startingHp * 0.05));

      let totalPoints = (activePet.petLevelPoints || 0) + lvlPointsEarned;
      let newLevel = activePet.petLevel;
      while (newLevel < 100) {
        const needed = 50 + (newLevel * 10);
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
        pointsNeeded: 50 + (newLevel * 10),
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

  return httpServer;
}
