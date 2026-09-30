import type { Express, RequestHandler } from "express";
import sharp from "sharp";

export interface EnemyAdminRouteDependencies {
  storage: typeof import("../storage").storage;
  isAdmin: RequestHandler;
}

/**
 * Enemy Database and Enemy Parts admin routes extracted from the legacy route
 * registry without changing endpoint URLs, admin permissions, defaults, image
 * processing, response shapes, or storage behavior.
 */
export function registerEnemyAdminRoutes(
  app: Express,
  { storage, isAdmin }: EnemyAdminRouteDependencies,
): void {
  // ── Enemy Database Routes ─────────────────────────────────────────────────
  app.get("/api/admin/enemies", isAdmin, async (_req, res) => {
    try {
      const all = await storage.getAllEnemies();
      return res.json(all);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/enemies", isAdmin, async (req, res) => {
    try {
      const { name, atk, health, isBoss, special1, special2, special3, imageData } = req.body;
      if (!name) return res.status(400).json({ message: "Name is required" });
      let imageUrl: string | undefined = undefined;
      if (imageData) {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const resized = await sharp(imageBuffer)
          .resize(400, 400, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      }
      const enemy = await storage.createEnemy({
        name,
        imageUrl: imageUrl ?? null,
        atk: atk ?? 10,
        health: health ?? 100,
        isBoss: isBoss ?? false,
        special1: special1 ?? null,
        special2: special2 ?? null,
        special3: special3 ?? null,
      });
      return res.json(enemy);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/enemies/:id", isAdmin, async (req, res) => {
    try {
      const { name, atk, health, isBoss, special1, special2, special3, imageData } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (atk !== undefined) updates.atk = atk;
      if (health !== undefined) updates.health = health;
      if (isBoss !== undefined) updates.isBoss = isBoss;
      if (special1 !== undefined) updates.special1 = special1;
      if (special2 !== undefined) updates.special2 = special2;
      if (special3 !== undefined) updates.special3 = special3;
      if (imageData) {
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        const resized = await sharp(imageBuffer)
          .resize(400, 400, { fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        updates.imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      }
      const enemy = await storage.updateEnemy((req.params.id as string), updates);
      return res.json(enemy);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/enemies/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteEnemy((req.params.id as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/enemy-parts/:enemyId", isAdmin, async (req, res) => {
    try {
      const parts = await storage.getEnemyParts((req.params.enemyId as string));
      return res.json(parts);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/enemy-parts/:enemyId", isAdmin, async (req, res) => {
    try {
      const { partType, imageData, posX, posY, width, height, zIndex } = req.body;
      if (!partType || !imageData) return res.status(400).json({ message: "Missing fields" });
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");
      const resized = await sharp(imageBuffer)
        .resize(600, 600, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      const imageUrl = `data:image/png;base64,${resized.toString("base64")}`;
      const part = await storage.createEnemyPart({
        enemyId: (req.params.enemyId as string),
        partType,
        imageUrl,
        posX: posX ?? 100,
        posY: posY ?? 100,
        width: width ?? 200,
        height: height ?? 200,
        zIndex: zIndex ?? 1,
      });
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/admin/enemy-parts/:partId", isAdmin, async (req, res) => {
    try {
      const part = await storage.updateEnemyPart((req.params.partId as string), req.body);
      return res.json(part);
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/admin/enemy-parts/:partId", isAdmin, async (req, res) => {
    try {
      await storage.deleteEnemyPart((req.params.partId as string));
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });


}
