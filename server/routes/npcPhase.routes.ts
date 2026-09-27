import type { Express, RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { npcPhases, shopItems } from "@shared/schema";
import { isNpcPhase } from "@shared/npcPhases";
import type { db as database } from "../db";

interface Dependencies {
  db: typeof database;
  isAdmin: RequestHandler;
  processImage: (data: string) => Promise<string>;
}

export function registerNpcPhaseRoutes(app: Express, { db, isAdmin, processImage }: Dependencies) {
  const npcExists = async (id: string) => {
    const [npc] = await db.select({ id: shopItems.id }).from(shopItems).where(and(
      eq(shopItems.id, id), eq(shopItems.type, "npc"), eq(shopItems.worldId, "__npc_catalog__"),
    ));
    return Boolean(npc);
  };

  app.get("/api/admin/npcs/:npcId/phases", isAdmin, async (req, res) => {
    const npcId = String(req.params.npcId);
    try {
      if (!await npcExists(npcId)) return res.status(404).json({ message: "NPC not found" });
      const phases = await db.select({ phase: npcPhases.phase, imageUrl: npcPhases.imageUrl })
        .from(npcPhases).where(eq(npcPhases.npcId, npcId));
      return res.json(phases);
    } catch (error) {
      console.error("List NPC phases error:", error);
      return res.status(500).json({ message: "Could not load NPC phases" });
    }
  });

  app.put("/api/admin/npcs/:npcId/phases/:phase", isAdmin, async (req, res) => {
    const npcId = String(req.params.npcId);
    const phase = req.params.phase;
    const imageData = req.body?.imageData;
    if (!isNpcPhase(phase)) return res.status(400).json({ message: "Choose a valid NPC phase" });
    if (typeof imageData !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(imageData) || imageData.length > 12 * 1024 * 1024) {
      return res.status(400).json({ message: "Upload a PNG, JPEG, or WebP image under 9 MB" });
    }
    try {
      if (!await npcExists(npcId)) return res.status(404).json({ message: "NPC not found" });
      let imageUrl: string;
      try { imageUrl = await processImage(imageData); }
      catch { return res.status(400).json({ message: "Could not process the phase image" }); }
      const [saved] = await db.insert(npcPhases).values({ npcId, phase, imageUrl })
        .onConflictDoUpdate({ target: [npcPhases.npcId, npcPhases.phase], set: { imageUrl } })
        .returning({ phase: npcPhases.phase, imageUrl: npcPhases.imageUrl });
      return res.json(saved);
    } catch (error) {
      console.error("Save NPC phase error:", error);
      return res.status(500).json({ message: "Could not save NPC phase" });
    }
  });

  app.delete("/api/admin/npcs/:npcId/phases/:phase", isAdmin, async (req, res) => {
    const npcId = String(req.params.npcId);
    const phase = req.params.phase;
    if (!isNpcPhase(phase)) return res.status(400).json({ message: "Choose a valid NPC phase" });
    try {
      if (!await npcExists(npcId)) return res.status(404).json({ message: "NPC not found" });
      await db.delete(npcPhases).where(and(eq(npcPhases.npcId, npcId), eq(npcPhases.phase, phase)));
      return res.json({ success: true });
    } catch (error) {
      console.error("Delete NPC phase error:", error);
      return res.status(500).json({ message: "Could not delete NPC phase" });
    }
  });
}
