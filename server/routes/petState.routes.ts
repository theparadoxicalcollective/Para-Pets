import type { Express, RequestHandler } from "express";
import { publicAccount } from "../accounts/publicAccount";

type PetStateStorage = Pick<
  typeof import("../storage").storage,
  | "getInventoryItemById"
  | "updateInventoryItem"
  | "getUser"
  | "getShopItem"
  | "addCoins"
  | "unequipAllPetAccessories"
>;

export interface PetStateRouteDependencies {
  storage: PetStateStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Pet state/lifecycle mutations that sit immediately after Pet Care.
 *
 * This is an organization-only boundary. It preserves the existing ownership
 * checks, values, update order, response shapes, and error behavior.
 */
export function registerPetStateRoutes(
  app: Express,
  { storage, isAuthenticated }: PetStateRouteDependencies,
): void {
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

  // Revert a hatched pet back to an egg (unequips accessories, keeps stats).
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
}
