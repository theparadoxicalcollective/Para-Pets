import type { Express } from "express";
import { claimActiveEvolutionReward, evolveActivePet, feedActivePetForEvolution, getActiveEvolutionState, PetEvolutionError } from "../petEvolution";

export function registerPetEvolutionRoutes(app: Express, { isAuthenticated }: { isAuthenticated: any }) {
  app.get("/api/pet-evolution/active", isAuthenticated, async (req: any, res) => {
    try {
      res.json(await getActiveEvolutionState(req.user.id));
    } catch (error) {
      if (error instanceof PetEvolutionError) {
        return res.status(error.status).json({ errorCode: error.code, message: error.message });
      }
      console.error("[pet-evolution] state failed", error);
      res.status(500).json({ message: "Evolution energy is unavailable right now. Please try again." });
    }
  });

  app.post("/api/pet-evolution/active/evolve", isAuthenticated, async (req: any, res) => {
    try {
      res.json(await evolveActivePet(req.user.id));
    } catch (error) {
      if (error instanceof PetEvolutionError) {
        return res.status(error.status).json({ errorCode: error.code, message: error.message });
      }
      console.error("[pet-evolution] final evolution failed", error);
      res.status(500).json({ message: "Evolution could not be completed safely. Please try again." });
    }
  });

  app.post("/api/pet-evolution/active/claim", isAuthenticated, async (req: any, res) => {
    try {
      res.json(await claimActiveEvolutionReward(req.user.id, req.body?.slot));
    } catch (error) {
      if (error instanceof PetEvolutionError) {
        return res.status(error.status).json({ errorCode: error.code, message: error.message });
      }
      console.error("[pet-evolution] reward claim failed", error);
      res.status(500).json({ message: "The evolution reward could not be collected safely. Please try again." });
    }
  });

  app.post("/api/pet-evolution/active/feed", isAuthenticated, async (req: any, res) => {
    try {
      res.json(await feedActivePetForEvolution(req.user.id, req.body?.feederPetIds, req.body?.actionId));
    } catch (error) {
      if (error instanceof PetEvolutionError) {
        return res.status(error.status).json({ errorCode: error.code, message: error.message });
      }
      console.error("[pet-evolution] feed failed", error);
      res.status(500).json({ message: "Evolution failed safely. No feeder pets were consumed." });
    }
  });
}
