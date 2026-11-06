import type { Express, RequestHandler } from "express";
import { PetTeamSelectionError } from "../petTeam";

type PlayerPetTeamStorage = Pick<
  typeof import("../storage").storage,
  "getBattleGroup" | "upsertBattleGroup"
>;

export interface PlayerPetTeamRouteDependencies {
  storage: PlayerPetTeamStorage;
  isAuthenticated: RequestHandler;
}

/** Player-facing aliases over the existing, server-persisted PvP battle group.
 * No second roster, cache, or migration of live team data is introduced.
 */
export function registerPlayerPetTeamRoutes(
  app: Express,
  { storage, isAuthenticated }: PlayerPetTeamRouteDependencies,
): void {
  app.get("/api/player/pet-team", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as { id: string };
      const team = await storage.getBattleGroup(user.id);
      return res.json(team ?? { petInventoryIds: [], attackPower: 0 });
    } catch (error) {
      console.error("Read player pet team error:", error);
      return res.status(500).json({ message: "Failed to load your pet team" });
    }
  });

  app.put("/api/player/pet-team", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as { id: string };
      const team = await storage.upsertBattleGroup(user.id, req.body?.petInventoryIds);
      return res.json(team);
    } catch (error) {
      if (error instanceof PetTeamSelectionError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("Save player pet team error:", error);
      return res.status(500).json({ message: "Failed to save your pet team" });
    }
  });
}
