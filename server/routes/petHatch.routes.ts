import type { Express, RequestHandler } from "express";

type PetHatchStorage = Pick<
  typeof import("../storage").storage,
  "getInventoryItemById" | "getShopItem" | "updateInventoryItem"
>;

export interface PetHatchRouteDependencies {
  storage: PetHatchStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Authenticated hatch-status transition for owned pet inventory rows.
 *
 * This is an organization-only boundary. It preserves the existing ownership,
 * pet-type, timer, level-floor, response-shape, and error behavior.
 */
export function registerPetHatchRoute(
  app: Express,
  { storage, isAuthenticated }: PetHatchRouteDependencies,
): void {
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
}
