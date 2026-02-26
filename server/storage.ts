import { type User, type InsertUser, users, type ShopItem, type InsertShopItem, shopItems } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUsername(id: string, username: string): Promise<User>;
  updateProfileImage(id: string, profileImage: string): Promise<User>;
  getAllUsers(): Promise<User[]>;
  banUser(id: string): Promise<User>;
  unbanUser(id: string): Promise<User>;
  addCoins(id: string, amount: number): Promise<User>;
  getShopItemsByWorld(worldId: string): Promise<ShopItem[]>;
  getAllShopItems(): Promise<ShopItem[]>;
  createShopItem(item: InsertShopItem): Promise<ShopItem>;
  updateShopItem(id: string, item: Partial<InsertShopItem>): Promise<ShopItem>;
  deleteShopItem(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUsername(id: string, username: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ username, lastUsernameChange: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateProfileImage(id: string, profileImage: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ profileImage, lastProfilePicChange: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async banUser(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isBanned: true })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async unbanUser(id: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isBanned: false })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async addCoins(id: string, amount: number): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("User not found");
    const newCoins = Math.max(0, user.coins + amount);
    const [updated] = await db
      .update(users)
      .set({ coins: newCoins })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async getShopItemsByWorld(worldId: string): Promise<ShopItem[]> {
    return db.select().from(shopItems).where(eq(shopItems.worldId, worldId));
  }

  async getAllShopItems(): Promise<ShopItem[]> {
    return db.select().from(shopItems);
  }

  async createShopItem(item: InsertShopItem): Promise<ShopItem> {
    const [created] = await db.insert(shopItems).values(item).returning();
    return created;
  }

  async updateShopItem(id: string, item: Partial<InsertShopItem>): Promise<ShopItem> {
    const [updated] = await db
      .update(shopItems)
      .set(item)
      .where(eq(shopItems.id, id))
      .returning();
    return updated;
  }

  async deleteShopItem(id: string): Promise<void> {
    await db.delete(shopItems).where(eq(shopItems.id, id));
  }
}

export const storage = new DatabaseStorage();
