import type { Express, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { worldSceneDrafts } from "@shared/schema";
import { defaultWorldSceneDraft, isEditableWorldSceneId, parseWorldSceneDraftSettings } from "@shared/worlds/worldSceneDraft";
import type { db as database } from "../db";

/**
 * Admin-only draft endpoints. No public read route or publishing side effects.
 * The path's stable world ID scopes every query and upsert.
 */
export function registerWorldSceneDraftRoutes(
  app: Express,
  { db, isAdmin }: { db: typeof database; isAdmin: RequestHandler },
): void {
  app.get("/api/admin/world-editor/:worldId/draft", isAdmin, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isEditableWorldSceneId(worldId)) {
      return res.status(404).json({ message: "Unknown world" });
    }
    try {
      const [saved] = await db.select().from(worldSceneDrafts)
        .where(eq(worldSceneDrafts.worldId, worldId)).limit(1);
      return res.json(saved
        ? {
          worldId,
          groundLevel: saved.groundLevel,
          groundTheme: saved.groundTheme,
          updatedAt: saved.updatedAt.toISOString(),
          hasSavedDraft: true,
        }
        : defaultWorldSceneDraft(worldId));
    } catch (error) {
      console.error("[world-editor] draft read failed", error);
      return res.status(500).json({ message: "Unable to load world draft" });
    }
  });

  app.put("/api/admin/world-editor/:worldId/draft", isAdmin, async (req, res) => {
    const worldId = req.params.worldId;
    if (typeof worldId !== "string" || !isEditableWorldSceneId(worldId)) {
      return res.status(404).json({ message: "Unknown world" });
    }
    const settings = parseWorldSceneDraftSettings(req.body);
    if (!settings) {
      return res.status(400).json({ message: "Invalid ground settings" });
    }
    try {
      const [saved] = await db.insert(worldSceneDrafts).values({
        worldId,
        ...settings,
      }).onConflictDoUpdate({
        target: worldSceneDrafts.worldId,
        set: { ...settings, updatedAt: new Date() },
      }).returning();
      return res.json({
        worldId, groundLevel: saved.groundLevel, groundTheme: saved.groundTheme,
        updatedAt: saved.updatedAt.toISOString(), hasSavedDraft: true,
      });
    } catch (error) {
      console.error("[world-editor] draft save failed", error);
      return res.status(500).json({ message: "Unable to save world draft" });
    }
  });
}
