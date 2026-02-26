import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { insertUserSchema, updateUsernameSchema, insertShopItemSchema } from "@shared/schema";
import sharp from "sharp";
import fs from "fs";
import path from "path";

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
        console.log("Email conflict found:", existingEmail.id, existingEmail.email, existingEmail.username);
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

          const filename = `profile_${Date.now()}.jpg`;
          const uploadsDir = path.join(process.cwd(), "uploads");
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          fs.writeFileSync(path.join(uploadsDir, filename), resized);
          profileImagePath = `/uploads/${filename}`;
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

      const filename = `profile_${user.id}_${Date.now()}.jpg`;
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      if (user.profileImage && user.profileImage.startsWith("/uploads/")) {
        const oldFile = path.join(process.cwd(), user.profileImage);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }

      fs.writeFileSync(path.join(uploadsDir, filename), resized);
      const profileImage = `/uploads/${filename}`;

      const updated = await storage.updateProfileImage(user.id, profileImage);
      const { password: _, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
      console.error("Update profile image error:", err);
      return res.status(500).json({ message: "Failed to update profile image" });
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

  app.post("/api/admin/shop", isAdmin, async (req, res) => {
    try {
      const parse = insertShopItemSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ message: parse.error.errors[0].message });
      }
      const item = await storage.createShopItem(parse.data);
      return res.status(201).json(item);
    } catch (err) {
      console.error("Create shop item error:", err);
      return res.status(500).json({ message: "Failed to create shop item" });
    }
  });

  app.patch("/api/admin/shop/:itemId", isAdmin, async (req, res) => {
    try {
      const updated = await storage.updateShopItem(req.params.itemId, req.body);
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

  return httpServer;
}
