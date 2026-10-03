import type { Express, RequestHandler } from "express";

type EmblemStorage = Pick<
  typeof import("../storage").storage,
  "listEmblems" | "createEmblem" | "updateEmblem" | "deleteEmblem"
>;

export interface EmblemRouteDependencies {
  storage: EmblemStorage;
  isAuthenticated: RequestHandler;
  processEmblemImage: (imageData: string) => Promise<string>;
}

/**
 * Administrator-managed PvP emblem catalog routes.
 *
 * This module intentionally preserves the legacy authentication + in-handler
 * administrator check, request validation, image processing boundary, storage
 * calls, response shapes, and error messages.
 */
export function registerEmblemRoutes(
  app: Express,
  { storage, isAuthenticated, processEmblemImage }: EmblemRouteDependencies,
): void {
  app.get("/api/admin/emblems", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const all = await storage.listEmblems();
      return res.json(all);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to fetch emblems" });
    }
  });

  app.post("/api/admin/emblems", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { name, description, imageData } = req.body;
      if (!name || !imageData) return res.status(400).json({ message: "name and imageData required" });
      const imageUrl = await processEmblemImage(imageData);
      const emblem = await storage.createEmblem({
        name: String(name).trim(),
        description: description ? String(description) : null,
        imageUrl,
      });
      return res.json(emblem);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to create emblem" });
    }
  });

  app.patch("/api/admin/emblems/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      const { name, description, imageData } = req.body;
      const updateData: { name?: string; description?: string | null; imageUrl?: string } = {};
      if (name !== undefined && String(name).trim()) updateData.name = String(name).trim();
      if (description !== undefined) updateData.description = description ? String(description) : null;
      if (imageData) updateData.imageUrl = await processEmblemImage(imageData);
      await storage.updateEmblem(req.params.id as string, updateData);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to update emblem" });
    }
  });

  app.delete("/api/admin/emblems/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user.isAdmin) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteEmblem(req.params.id as string);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to delete emblem" });
    }
  });
}
