import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { requireAdmin } from "../auth";
import { shopItems } from "@shared/schema";
import { costumePlacementsSchema, petCostumeDefinitions } from "@shared/costumeSchema";
import { applyCostumeWingUpload, CostumeWingUploadError } from "../costumeWingUpload";

export function registerCostumeAdminRoutes(app: Express, processImage: (data: string) => Promise<string>) {
  app.get("/api/admin/costumes", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const items = await db.select({ id: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl })
        .from(shopItems)
        .where(eq(shopItems.type, "costume"));
      res.json(items);
    } catch (error) {
      console.error("[costumes] list failed", error);
      res.status(500).json({ message: "Failed to load costumes" });
    }
  });

  app.get("/api/admin/costume-definitions", requireAdmin, async (req: Request, res: Response) => {
    const templateId = typeof req.query.templateId === "string" ? req.query.templateId : "";
    if (!templateId) return res.status(400).json({ message: "templateId is required" });
    try {
      const rows = await db.select().from(petCostumeDefinitions).where(eq(petCostumeDefinitions.templateId, templateId));
      res.json(rows);
    } catch (error) {
      console.error("[costumes] definitions load failed", error);
      res.status(500).json({ message: "Failed to load costume definitions" });
    }
  });

  app.put("/api/admin/costume-definitions", requireAdmin, async (req: Request, res: Response) => {
    const body = req.body as { shopItemId?: unknown; templateId?: unknown; placements?: unknown; mirroredWingUpload?: unknown };
    if (typeof body.shopItemId !== "string" || typeof body.templateId !== "string") {
      return res.status(400).json({ message: "shopItemId and templateId are required" });
    }
    const parsed = costumePlacementsSchema.safeParse(body.placements);
    if (!parsed.success) return res.status(400).json({ message: "Invalid costume placements", issues: parsed.error.issues });

    let placements;
    try {
      placements = await applyCostumeWingUpload(parsed.data, body.mirroredWingUpload, processImage);
    } catch (error) {
      if (error instanceof CostumeWingUploadError) return res.status(400).json({ message: error.message });
      console.error("[costumes] wing image processing failed", error);
      return res.status(400).json({ message: "Could not process mirrored wing image. Try another PNG file." });
    }

    try {
      const [row] = await db.insert(petCostumeDefinitions).values({
        shopItemId: body.shopItemId,
        templateId: body.templateId,
        placements,
      }).onConflictDoUpdate({
        target: [petCostumeDefinitions.shopItemId, petCostumeDefinitions.templateId],
        set: { placements, updatedAt: new Date() },
      }).returning();
      res.json(row);
    } catch (error) {
      console.error("[costumes] definition save failed", error);
      res.status(500).json({ message: "Failed to save costume definition" });
    }
  });
}
