import type { Express, RequestHandler } from "express";
import { eq, sql } from "drizzle-orm";
import { petEquippedAccessories } from "@shared/schema";

type PetAccessoryStorage = Pick<
  typeof import("../storage").storage,
  | "getInventoryItemById"
  | "getPetEquippedAccessories"
  | "getShopItem"
  | "equipAccessory"
  | "updateInventoryItem"
  | "unequipAccessory"
  | "atomicDeductCoins"
>;

export interface PetAccessoryRouteDependencies {
  storage: PetAccessoryStorage;
  db: typeof import("../db").db;
  isAuthenticated: RequestHandler;
}

/**
 * Player pet-accessory HTTP routes.
 *
 * This is an organization-only boundary. URLs, authentication middleware,
 * ownership checks, slot rules/cost, stat mutations, status codes, response
 * shapes, and error messages are intentionally preserved from server/routes.ts.
 */
export function registerPetAccessoryRoutes(
  app: Express,
  {
    storage,
    db,
    isAuthenticated,
  }: PetAccessoryRouteDependencies,
): void {
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
      const atkGain = accShopItem.atkBoost || 0;
      const defGain = accShopItem.defBoost || 0;
      const healthGain = accShopItem.healthBoost || 0;
      if (atkGain !== 0 || defGain !== 0 || healthGain !== 0) {
        await storage.updateInventoryItem(inventoryId, {
          petAtk: petInv.petAtk + atkGain,
          petDef: petInv.petDef + defGain,
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
      const atkLoss = record.atkBoost || 0;
      const defLoss = record.defBoost || 0;
      const healthLoss = record.healthBoost || 0;
      await storage.unequipAccessory(inventoryId, accessoryInventoryId);
      if (atkLoss !== 0 || defLoss !== 0 || healthLoss !== 0) {
        await storage.updateInventoryItem(inventoryId, {
          petAtk: Math.max(0, petInv.petAtk - atkLoss),
          petDef: Math.max(0, petInv.petDef - defLoss),
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
}
