import type { Express, RequestHandler } from "express";
import {
  playerProgressionResponse,
  type PlayerProgression,
} from "@shared/playerProgression";

export interface PlayerProgressionRouteDependencies {
  isAuthenticated: RequestHandler;
  readProgression: (userId: string) => Promise<PlayerProgression | null>;
}

/**
 * Read-only account-level profile endpoint for the future main-page HUD.
 * Player XP is never accepted from client input; mutations are deliberately
 * excluded until approved reward sources and the level curve are in place.
 */
export function registerPlayerProgressionRoutes(
  app: Express,
  { isAuthenticated, readProgression }: PlayerProgressionRouteDependencies,
): void {
  app.get("/api/player/progression", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as { id: string };
      const progression = await readProgression(user.id);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json(playerProgressionResponse(progression));
    } catch (error) {
      console.error("Load player progression error:", error);
      return res.status(500).json({ message: "Could not load player progression" });
    }
  });
}
