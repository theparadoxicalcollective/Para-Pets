import type { Express } from "express";
import { requireAdmin, requireAuthenticated } from "../auth";
import { storage } from "../storage";
import { DEFAULT_PET_PRESENTATION, parsePetPresentation, petPresentationSchema } from "@shared/petPresentation";

export function registerPetPresentationRoutes(app: Express) {
  const route = "/api/pet-presentation/:templateId/:form/:view";
  const keyFor = (params: Record<string, string>) => `pet_presentation:${params.templateId}:${params.form}:${params.view}`;
  const valid = (params: Record<string, string>) => ["base", "evolution"].includes(params.form) && ["front", "back"].includes(params.view);
  app.get(route, requireAuthenticated, async (req, res) => {
    try {
      const params = req.params as Record<string, string>;
      if (!valid(params)) return res.status(400).json({ message: "Invalid artwork form or view" });
      const raw = await storage.getGameSetting(keyFor(params));
      let value: unknown = DEFAULT_PET_PRESENTATION;
      try { if (raw) value = JSON.parse(raw); } catch { /* Legacy/malformed settings use the original layout. */ }
      return res.json(parsePetPresentation(value));
    } catch { return res.status(500).json({ message: "Could not load pet presentation" }); }
  });
  app.put(route, requireAdmin, async (req, res) => {
    try {
      const params = req.params as Record<string, string>;
      const parsed = petPresentationSchema.safeParse(req.body);
      if (!valid(params) || !parsed.success) return res.status(400).json({ message: "Invalid pet presentation" });
      if (!await storage.getPetTemplate(params.templateId)) return res.status(404).json({ message: "Pet template not found" });
      await storage.setGameSetting(keyFor(params), JSON.stringify(parsed.data));
      return res.json(parsed.data);
    } catch { return res.status(500).json({ message: "Could not save pet presentation" }); }
  });
}
