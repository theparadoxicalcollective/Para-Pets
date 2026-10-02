import type { Express, RequestHandler } from "express";

type PetHousePositionStorage = Pick<typeof import("../storage").storage,
  | "getPetHousePositions"
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
      const existing = (await storage.getPetHousePositions(user.id))
        .find((position) => position.inventoryId === inventoryId);
      const safeScalePct = typeof scalePct === "number" && Number.isFinite(scalePct)
        ? Math.max(55, Math.min(140, Math.round(scalePct)))
        : (existing?.scalePct ?? 100);
      const safeFlipped = typeof flipped === "boolean" ? flipped : (existing?.flipped ?? false);
      await storage.upsertPetHousePosition(
        user.id,
        inventoryId,
        posLeft,
        posTop,
        location ?? "outside",
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
