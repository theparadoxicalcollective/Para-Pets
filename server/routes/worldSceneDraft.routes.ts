import type { Express, RequestHandler } from "express";
import { eq, sql } from "drizzle-orm";
import { worldSceneDrafts } from "@shared/schema";
import { parkGroundSize } from "@shared/petParkGround";
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
      // Keep authored world-space positions fixed when expanding the scene.
      // This transaction never touches Pet Park or the original world.
      const saved = await db.transaction(async (tx) => {
        await tx.insert(worldSceneDrafts)
          .values({ worldId, ...defaultWorldSceneDraft(worldId) })
          .onConflictDoNothing();
        const [previous] = await tx.select().from(worldSceneDrafts)
          .where(eq(worldSceneDrafts.worldId, worldId)).for("update");
        if (previous.groundLevel !== settings.groundLevel) {
          const oldSize = parkGroundSize(previous.groundLevel);
          const newSize = parkGroundSize(settings.groundLevel);
          const xRatio = oldSize.width / newSize.width;
          const yRatio = oldSize.height / newSize.height;
          // Refuse a shrink that would move authored scenery beyond the new
          // ground rather than clipping or silently changing its geometry.
          const outside = await tx.execute(sql`
            SELECT id FROM world_scene_placements
            WHERE world_id = ${worldId}
            AND (0.5 + (x_pct - 0.5) * ${xRatio} NOT BETWEEN 0 AND 1
              OR 0.5 + (y_pct - 0.5) * ${yRatio} NOT BETWEEN 0 AND 1)
            LIMIT 1
          `);
          if (outside.rows.length) throw new RangeError("Ground cannot shrink around placed objects");
          await tx.execute(sql`
            UPDATE world_scene_placements SET
              x_pct = 0.5 + (x_pct - 0.5) * ${xRatio},
              y_pct = 0.5 + (y_pct - 0.5) * ${yRatio}
            WHERE world_id = ${worldId}
          `);
        }
        const [updated] = await tx.update(worldSceneDrafts)
          .set({ ...settings, updatedAt: new Date() })
          .where(eq(worldSceneDrafts.worldId, worldId)).returning();
        return updated;
      });
      return res.json({
        worldId, groundLevel: saved.groundLevel, groundTheme: saved.groundTheme,
        updatedAt: saved.updatedAt.toISOString(), hasSavedDraft: true,
      });
    } catch (error) {
      if (error instanceof RangeError) return res.status(409).json({ message: error.message });
      console.error("[world-editor] draft save failed", error);
      return res.status(500).json({ message: "Unable to save world draft" });
    }
  });
}
