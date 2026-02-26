import { type User, type InsertUser, users, type ShopItem, type InsertShopItem, shopItems, type UserInventoryItem, userInventory } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUsername(id: string, username: string): Promise<User>;
  updateProfileImage(id: string, profileImage: string): Promise<User>;
  updateActivePet(id: string, activePetId: string | null): Promise<User>;
  getAllUsers(): Promise<User[]>;
  banUser(id: string): Promise<User>;
  unbanUser(id: string): Promise<User>;
  addCoins(id: string, amount: number): Promise<User>;
  getShopItemsByWorld(worldId: string): Promise<ShopItem[]>;
  getAllShopItems(): Promise<ShopItem[]>;
  getShopItem(id: string): Promise<ShopItem | undefined>;
  createShopItem(item: InsertShopItem): Promise<ShopItem>;
  updateShopItem(id: string, item: Partial<InsertShopItem>): Promise<ShopItem>;
  deleteShopItem(id: string): Promise<void>;
  getUserInventory(userId: string): Promise<UserInventoryItem[]>;
  addToInventory(userId: string, shopItemId: string): Promise<UserInventoryItem>;
  getInventoryItem(userId: string, shopItemId: string): Promise<UserInventoryItem | undefined>;
  getInventoryItemById(id: string): Promise<UserInventoryItem | undefined>;
  removeFromInventory(id: string): Promise<void>;
  updateInventoryItem(id: string, updates: Partial<UserInventoryItem>): Promise<UserInventoryItem>;
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

  async updateActivePet(id: string, activePetId: string | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ activePetId })
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

  async getShopItem(id: string): Promise<ShopItem | undefined> {
    const [item] = await db.select().from(shopItems).where(eq(shopItems.id, id));
    return item;
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

  async getUserInventory(userId: string): Promise<UserInventoryItem[]> {
    return db.select().from(userInventory).where(eq(userInventory.userId, userId));
  }

  async addToInventory(userId: string, shopItemId: string): Promise<UserInventoryItem> {
    const [item] = await db.insert(userInventory).values({ userId, shopItemId }).returning();
    return item;
  }

  async getInventoryItem(userId: string, shopItemId: string): Promise<UserInventoryItem | undefined> {
    const [item] = await db
      .select()
      .from(userInventory)
      .where(and(eq(userInventory.userId, userId), eq(userInventory.shopItemId, shopItemId)));
    return item;
  }

  async getInventoryItemById(id: string): Promise<UserInventoryItem | undefined> {
    const [item] = await db.select().from(userInventory).where(eq(userInventory.id, id));
    return item;
  }

  async removeFromInventory(id: string): Promise<void> {
    await db.delete(userInventory).where(eq(userInventory.id, id));
  }

  async updateInventoryItem(id: string, updates: Partial<UserInventoryItem>): Promise<UserInventoryItem> {
    const [updated] = await db
      .update(userInventory)
      .set(updates)
      .where(eq(userInventory.id, id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
