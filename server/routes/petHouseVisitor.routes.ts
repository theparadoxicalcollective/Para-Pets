import type { Express, RequestHandler } from "express";

type PetHouseVisitorStorage = Pick<typeof import("../storage").storage,
  | "getUser"
  | "getUserInventoryWithItems"
  | "getPetHousePositions"
>;

export interface PetHouseVisitorRouteDependencies {
  storage: PetHouseVisitorStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Read-only Pet House visitor data.
 *
 * Keeps the existing authenticated visitor endpoint separate from the legacy
 * route registry without changing its URL, filtering, response shape, saved
 * position behavior, or error handling.
 */
export function registerPetHouseVisitorRoutes(
  app: Express,
  { storage, isAuthenticated }: PetHouseVisitorRouteDependencies,
): void {
  app.get("/api/users/:userId/pets", isAuthenticated, async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.userId as string);
      if (!targetUser || targetUser.isBanned) {
        return res.status(404).json({ message: "User not found" });
      }

      const [inventoryRows, savedPositions] = await Promise.all([
        storage.getUserInventoryWithItems(targetUser.id),
        storage.getPetHousePositions(targetUser.id),
      ]);
      const posMap = new Map(
        savedPositions.map((p) => [
          p.inventoryId,
          { posLeft: p.posLeft, posTop: p.posTop, location: p.location },
        ]),
      );

      const hatchedPets = inventoryRows
        .filter((r) => r.inventory.isHatched && r.shopItem?.type === "pet")
        .map((r) => {
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
}
