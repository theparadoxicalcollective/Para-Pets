import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "./storage";
import { insertUserSchema, updateUsernameSchema, insertShopItemSchema } from "@shared/schema";
import sharp from "sharp";

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
        coins: 100,
      });

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
        if (req.body.rememberMe) {
          req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        } else {
          (req.session.cookie as any).maxAge = undefined;
          req.session.cookie.expires = false as any;
        }
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

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      const user = await storage.getUserByEmail(email);
      if (user) {
        const token = crypto.randomBytes(32).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await storage.setPasswordResetToken(user.id, token, expires);
      }
      return res.json({ message: "If an account exists with that email, a password reset link has been generated", token: user ? undefined : undefined });
    } catch (err) {
      console.error("Forgot password error:", err);
      return res.status(500).json({ message: "Failed to process request" });
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
      const inventory = await storage.getUserInventory(user.id);
      const itemsWithDetails = await Promise.all(
        inventory.map(async (inv) => {
          const shopItem = await storage.getShopItem(inv.shopItemId);
          return {
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
            hatchStartedAt: inv.hatchStartedAt,
            isHatched: inv.isHatched,
            petHealth: inv.petHealth,
            petAtk: inv.petAtk,
            petDef: inv.petDef,
            petLevel: inv.petLevel,
            itemsUsedThisLevel: inv.itemsUsedThisLevel,
          };
        })
      );
      return res.json(itemsWithDetails);
    } catch (err) {
      console.error("Get inventory error:", err);
      return res.status(500).json({ message: "Failed to get inventory" });
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

      const existing = await storage.getInventoryItem(user.id, itemId);
      if (existing) {
        return res.status(400).json({ message: "You already own this item" });
      }

      const currentUser = await storage.getUser(user.id);
      if (!currentUser || currentUser.coins < shopItem.price) {
        return res.status(400).json({ message: "Not enough coins" });
      }

      await storage.addCoins(user.id, -shopItem.price);
      const invItem = await storage.addToInventory(user.id, itemId);

      if (shopItem.type === "pet" && shopItem.hatchTime) {
        await storage.updateInventoryItem(invItem.id, { hatchStartedAt: new Date() });
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
      const boostAmount = itemShopItem.price;

      if (boostType === "health") {
        updates.petHealth = petInv.petHealth + boostAmount;
      } else if (boostType === "atk") {
        updates.petAtk = petInv.petAtk + boostAmount;
      } else if (boostType === "def") {
        updates.petDef = petInv.petDef + boostAmount;
      } else if (boostType === "lvl") {
        const newLevel = Math.min(100, petInv.petLevel + 1);
        updates.petLevel = newLevel;
        if (newLevel > petInv.petLevel) {
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

  function isAdmin(req: Request, res: Response, next: any) {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const user = req.user as any;
    if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    return next();
  }

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

  app.get("/api/shop/:worldId", isAuthenticated, async (req, res) => {
    try {
      const items = await storage.getShopItemsByWorld(req.params.worldId);
      return res.json(items);
    } catch (err) {
      console.error("Get shop items error:", err);
      return res.status(500).json({ message: "Failed to get shop items" });
    }
  });

  async function processShopItemImage(imageData: string): Promise<string> {
    const mimeMatch = imageData.match(/^data:(image\/(png|gif));base64,/);
    if (!mimeMatch) {
      throw new Error("Invalid image format. Only PNG and GIF are supported.");
    }
    const mimeType = mimeMatch[1];
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");

    if (base64Data.length > 10 * 1024 * 1024) {
      throw new Error("Image data too large. Max 10MB.");
    }

    const imageBuffer = Buffer.from(base64Data, "base64");

    const isGif = mimeType === "image/gif";

    if (isGif) {
      const resized = await sharp(imageBuffer, { animated: true })
        .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
        .gif()
        .toBuffer();
      return `data:image/gif;base64,${resized.toString("base64")}`;
    } else {
      const resized = await sharp(imageBuffer)
        .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
        .png({ quality: 90 })
        .toBuffer();
      return `data:image/png;base64,${resized.toString("base64")}`;
    }
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
      const { name, coinAmount, shopItemIds, targetUserIds } = req.body;
      if (!name || (!coinAmount && (!shopItemIds || shopItemIds.length === 0))) {
        return res.status(400).json({ message: "Bundle must have a name and at least coins or items" });
      }

      const bundle = await storage.createRewardBundle(name, coinAmount || 0);

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
        await storage.createShopItem({ name: "Forest Sprite", price: 100, type: "pet", worldId: "haunted_woods", rarity: 3, hatchTime: 1, statBoostType: null, imageUrl: null, eggImageUrl: null, hatchedImageUrl: null });
        await storage.createShopItem({ name: "Enchanted Berry", price: 50, type: "item", worldId: "haunted_woods", rarity: null, hatchTime: null, statBoostType: "health", imageUrl: null, eggImageUrl: null, hatchedImageUrl: null });
        await storage.createShopItem({ name: "Mystic Scroll", price: 75, type: "item", worldId: "haunted_woods", rarity: null, hatchTime: null, statBoostType: "lvl", imageUrl: null, eggImageUrl: null, hatchedImageUrl: null });
        console.log("Seeded test shop items in Haunted Woods");
      }
    } catch (e) {
      console.error("Seed error:", e);
    }
  })();

  return httpServer;
}
