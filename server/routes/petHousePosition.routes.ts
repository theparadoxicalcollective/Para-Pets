import type { Express, RequestHandler } from "express";
import { clampPetHousePlayerScale, getHouseBuildingPetLimit, getHouseOutdoorPetLimit } from "@shared/housing";

type PetHousePositionStorage = Pick<typeof import("../storage").storage,
  | "getPetHousePositions"
  | "getActiveBundleWithBuildings"
  | "upsertPetHousePosition"
  | "deleteAllPetHousePositions"
  | "deletePetHousePosition"
>;

export interface PetHousePositionRouteDependencies {
  storage: PetHousePositionStorage;
  isAuthenticated: RequestHandler;
}

/**
 * Pet House position routes.
 *
 * Keeps pet-scene position persistence separate from the legacy route registry
 * while preserving the existing URLs, auth boundary, validation, defaults,
 * response shapes, and error messages.
 */
export function registerPetHousePositionRoutes(
  app: Express,
  { storage, isAuthenticated }: PetHousePositionRouteDependencies,
): void {
  app.get("/api/pet-house-positions", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const positions = await storage.getPetHousePositions(user.id);
      return res.json(positions);
    } catch (_err) {
      return res.status(500).json({ message: "Failed to get positions" });
    }
  });

  app.patch("/api/pet-house-positions/:inventoryId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      const { posLeft, posTop, location, scalePct, flipped } = req.body;
      if (typeof posLeft !== "string" || typeof posTop !== "string") {
        return res.status(400).json({ message: "posLeft and posTop are required strings" });
      }
      const positions = await storage.getPetHousePositions(user.id);
      const existing = positions.find((position) => position.inventoryId === inventoryId);
      const requestedScalePct = typeof scalePct === "number" && Number.isFinite(scalePct)
        ? scalePct
        : (existing?.scalePct ?? 100);
      const safeScalePct = clampPetHousePlayerScale(requestedScalePct);
      const safeFlipped = typeof flipped === "boolean" ? flipped : (existing?.flipped ?? false);
      const destination = typeof location === "string" && location ? location : "outside";
      const activeBundle = await storage.getActiveBundleWithBuildings(user.id);
      const otherPositions = positions.filter((position) => position.inventoryId !== inventoryId);

      let petLimit: number;
      let currentCount: number;
      if (destination === "outside") {
        petLimit = getHouseOutdoorPetLimit(activeBundle);
        currentCount = otherPositions.filter((position) =>
          !position.location || position.location === "outside"
        ).length;
      } else {
        const building = activeBundle?.buildings.find((candidate) => candidate.id === destination);
        if (!building || building.buildingType === "mailbox") {
          return res.status(400).json({ message: "Home building not found" });
        }
        petLimit = getHouseBuildingPetLimit(building);
        currentCount = otherPositions.filter((position) => position.location === destination).length;
      }

      if (currentCount >= petLimit) {
        return res.status(409).json({
          code: "pet_limit",
          message: `This home can only hold ${petLimit} pets`,
          limit: petLimit,
        });
      }

      await storage.upsertPetHousePosition(
        user.id,
        inventoryId,
        posLeft,
        posTop,
        destination,
        safeScalePct,
        safeFlipped,
      );
      return res.json({ ok: true });
    } catch (_err) {
      return res.status(500).json({ message: "Failed to save position" });
    }
  });

  // Keep /all before /:inventoryId so "all" is never interpreted as an inventory id.
  app.delete("/api/pet-house-positions/all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      await storage.deleteAllPetHousePositions(user.id);
      return res.json({ ok: true });
    } catch (_err) {
      return res.status(500).json({ message: "Failed to store all pets" });
    }
  });

  app.delete("/api/pet-house-positions/:inventoryId", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { inventoryId } = req.params as Record<string, string>;
      await storage.deletePetHousePosition(user.id, inventoryId);
      return res.json({ ok: true });
    } catch (_err) {
      return res.status(500).json({ message: "Failed to remove pet position" });
    }
  });
}
