import type { Express } from "express";
import { requireAdmin, requireAuthenticated } from "../auth";
import { storage } from "../storage";
import { petPagePlacementsSchema, resolvePetPagePlacement, PET_PAGE_KEYS } from "@shared/petPagePlacement";
import { DEFAULT_ACTIVE_PET_ANCHOR, DEFAULT_PET_PRESENTATION, activePetAnchorSchema, parseActivePetAnchor, parsePetPresentation, petPresentationSchema } from "@shared/petPresentation";

export function registerPetPresentationRoutes(app: Express) {
  // Page-specific placement settings are stored separately from existing
  // per-template artwork placement and the legacy Active Pet anchor.
  const pagePlacementRoute = "/api/pet-page-placement/:page";
  const pagePlacementKey = "pet_page_placements:v1";
  const validPage = (page: string) => (PET_PAGE_KEYS as readonly string[]).includes(page);
  app.get(pagePlacementRoute, requireAuthenticated, async (req, res) => {
    const page = String(req.params.page);
    if (!validPage(page)) return res.status(400).json({ message: "Invalid pet page" });
    try {
      const raw = await storage.getGameSetting(pagePlacementKey);
      let value: unknown = {};
      try { if (raw) value = JSON.parse(raw); } catch { /* Keep legacy layouts on corrupt data. */ }
      return res.json(resolvePetPagePlacement(value, page as (typeof PET_PAGE_KEYS)[number]));
    } catch { return res.status(500).json({ message: "Could not load pet page placement" }); }
  });
  app.put(pagePlacementRoute, requireAdmin, async (req, res) => {
    const page = String(req.params.page);
    if (!validPage(page)) return res.status(400).json({ message: "Invalid pet page" });
    try {
      const parsedPage = petPagePlacementsSchema.shape.active.safeParse(req.body);
      if (!parsedPage.success) return res.status(400).json({ message: "Invalid pet page placement" });
      const raw = await storage.getGameSetting(pagePlacementKey);
      let existing: unknown = {};
      try { if (raw) existing = JSON.parse(raw); } catch { /* Recover invalid settings safely. */ }
      const parsed = petPagePlacementsSchema.safeParse(existing);
      const next = { ...(parsed.success ? parsed.data : {}), [page]: parsedPage.data };
      await storage.setGameSetting(pagePlacementKey, JSON.stringify(next));
      return res.json(parsedPage.data);
    } catch { return res.status(500).json({ message: "Could not save pet page placement" }); }
  });

  const anchorRoute = "/api/active-pet-anchor";
  const anchorSettingKey = "active_pet_anchor:v1";
  app.get(anchorRoute, requireAuthenticated, async (_req, res) => {
    try {
      const raw = await storage.getGameSetting(anchorSettingKey);
      let value: unknown = DEFAULT_ACTIVE_PET_ANCHOR;
      try { if (raw) value = JSON.parse(raw); } catch { /* Malformed settings fall back to the authored default spot. */ }
      return res.json(parseActivePetAnchor(value));
    } catch { return res.status(500).json({ message: "Could not load active pet anchor" }); }
  });
  app.put(anchorRoute, requireAdmin, async (req, res) => {
    try {
      const parsed = activePetAnchorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid active pet anchor" });
      await storage.setGameSetting(anchorSettingKey, JSON.stringify(parsed.data));
      return res.json(parsed.data);
    } catch { return res.status(500).json({ message: "Could not save active pet anchor" }); }
  });

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
