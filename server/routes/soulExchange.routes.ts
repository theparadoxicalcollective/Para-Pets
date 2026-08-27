import type { Express } from "express";
import { exchangePets, getSoulExchangeState, SoulExchangeError } from "../soulExchange";
import { registerPetEvolutionRoutes } from "./petEvolution.routes";
import { registerHauntedCasinoRoutes } from "./hauntedCasino.routes";

export function registerSoulExchangeRoutes(app: Express, { isAuthenticated }: { isAuthenticated: any }) {
  // Haunted Woods feature routes share this small registration point so the
  // already-large root routes.ts file does not need more feature-specific code.
  registerPetEvolutionRoutes(app, { isAuthenticated });
  registerHauntedCasinoRoutes(app, { isAuthenticated });

  app.get("/api/soul-exchange/pets", isAuthenticated, async (req: any, res) => {
    try { res.json(await getSoulExchangeState(req.user.id)); }
    catch (error) { console.error("[soul-exchange] quote failed", error); res.status(500).json({ message: "The souls are quiet. Please try again." }); }
  });
  app.post("/api/soul-exchange/exchange", isAuthenticated, async (req: any, res) => {
    try { res.json(await exchangePets(req.user.id, req.body?.petInventoryIds, req.body?.exchangeActionId)); }
    catch (error) {
      if (error instanceof SoulExchangeError) return res.status(error.status).json({ errorCode: error.code, message: error.message });
      console.error("[soul-exchange] exchange failed", error);
      res.status(500).json({ message: "The ritual failed safely. No pets were exchanged." });
    }
  });
}
