import type { Express, RequestHandler } from "express";
import { and, eq, sql } from "drizzle-orm";
import type { db as database } from "../db";
import { playerCharacterBases } from "@shared/schema";
import {
  completePlayerCharacterParts,
  resolvePlayerCharacterParts,
  playerCharacterNameSchema,
  playerCharacterPartTypeSchema,
  playerCharacterPartWriteSchema,
  playerCharacterRevisionSchema,
  upsertPlayerCharacterPart,
  type PlayerCharacterPart,
} from "@shared/playerCharacter";

type Db = typeof database;

export interface PlayerCharacterRouteDependencies {
  db: Db;
  isAdmin: RequestHandler;
  isAuthenticated: RequestHandler;
  processImage: (imageData: string, maxSize: number) => Promise<string>;
}

/**
 * Independent from avatar.routes.ts, which serves *profile images*.
 * All writes target private draft parts. A published snapshot cannot change
 * until a complete base is explicitly published again.
 */
export function registerPlayerCharacterRoutes(
  app: Express,
  { db, isAdmin, isAuthenticated, processImage }: PlayerCharacterRouteDependencies,
): void {
  app.get("/api/admin/player-character/bases", isAdmin, async (_req, res) => {
    try {
      const bases = await db.select().from(playerCharacterBases);
      res.set("Cache-Control", "private, no-store");
      return res.json(bases);
    } catch (error) {
      console.error("[player-character] list failed", error);
      return res.status(500).json({ message: "Could not load avatar bases" });
    }
  });

  app.post("/api/admin/player-character/bases", isAdmin, async (req, res) => {
    const parsed = playerCharacterNameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Enter an avatar base name (1–80 characters)" });
    try {
      const [created] = await db.insert(playerCharacterBases)
        .values({ name: parsed.data.name }).returning();
      return res.status(201).json(created);
    } catch (error) {
      console.error("[player-character] create failed", error);
      return res.status(500).json({ message: "Could not create avatar base" });
    }
  });

  app.patch("/api/admin/player-character/bases/:id/name", isAdmin, async (req, res) => {
    const name = playerCharacterNameSchema.safeParse({ name: req.body?.name });
    const revision = playerCharacterRevisionSchema.safeParse({ expectedRevision: req.body?.expectedRevision });
    if (!name.success || !revision.success) return res.status(400).json({ message: "Invalid name or revision" });
    try {
      const [updated] = await db.update(playerCharacterBases).set({
        name: name.data.name, updatedAt: new Date(),
        revision: revision.data.expectedRevision + 1,
      }).where(and(eq(playerCharacterBases.id, String(req.params.id)),
        eq(playerCharacterBases.revision, revision.data.expectedRevision))).returning();
      if (!updated) return res.status(409).json({ message: "Avatar was changed elsewhere or no longer exists. Reload before saving." });
      return res.json(updated);
    } catch (error) {
      console.error("[player-character] rename failed", error);
      return res.status(500).json({ message: "Could not rename avatar base" });
    }
  });

  app.put("/api/admin/player-character/bases/:id/parts/:partType", isAdmin, async (req, res) => {
    const type = playerCharacterPartTypeSchema.safeParse(req.params.partType);
    const payload = playerCharacterPartWriteSchema.safeParse(req.body);
    if (!type.success || !payload.success)
      return res.status(400).json({ message: "Invalid avatar part, artwork or positioning" });

    try {
      const id = String(req.params.id);
      const [current] = await db.select().from(playerCharacterBases).where(eq(playerCharacterBases.id, id)).limit(1);
      if (!current) return res.status(404).json({ message: "Avatar base not found" });
      if (current.revision !== payload.data.expectedRevision)
        return res.status(409).json({ message: "This avatar changed in another editor. Reload before saving." });

      const existing = current.draftParts.find(part => part.partType === type.data);
      if (!payload.data.imageData && !existing)
        return res.status(400).json({ message: "Upload artwork before saving this part" });

      // The game's existing image processor handles transparency-preserving
      // PNG output and bounded image dimensions. No new image pipeline.
      const imageUrl = payload.data.imageData
        ? await processImage(payload.data.imageData, 1000)
        : existing!.imageUrl;
      const next: PlayerCharacterPart = {
        partType: type.data,
        imageUrl,
        ...payload.data.transform,
      };
      const draftParts = upsertPlayerCharacterPart(current.draftParts, next);
      const [updated] = await db.update(playerCharacterBases).set({
        draftParts, revision: current.revision + 1, updatedAt: new Date(),
      }).where(and(eq(playerCharacterBases.id, id), eq(playerCharacterBases.revision, current.revision)))
        .returning();
      if (!updated) return res.status(409).json({ message: "This avatar changed during upload. Reload before saving." });
      return res.json(updated);
    } catch (error) {
      console.error("[player-character] part save failed", error);
      return res.status(500).json({ message: "Could not save avatar part" });
    }
  });

  app.delete("/api/admin/player-character/bases/:id/parts/:partType", isAdmin, async (req, res) => {
    const type = playerCharacterPartTypeSchema.safeParse(req.params.partType);
    const body = playerCharacterRevisionSchema.safeParse(req.body);
    if (!type.success || !body.success) return res.status(400).json({ message: "Invalid avatar part or revision" });
    try {
      const [current] = await db.select().from(playerCharacterBases)
        .where(eq(playerCharacterBases.id, String(req.params.id))).limit(1);
      if (!current) return res.status(404).json({ message: "Avatar base not found" });
      if (current.revision !== body.data.expectedRevision)
        return res.status(409).json({ message: "This avatar changed elsewhere. Reload before removing the part." });
      const draftParts = current.draftParts.filter(part => part.partType !== type.data);
      const [updated] = await db.update(playerCharacterBases).set({
        draftParts, revision: current.revision + 1, updatedAt: new Date(),
      }).where(and(eq(playerCharacterBases.id, current.id), eq(playerCharacterBases.revision, current.revision)))
        .returning();
      if (!updated) return res.status(409).json({ message: "This avatar changed elsewhere. Reload before removing the part." });
      return res.json(updated);
    } catch (error) {
      console.error("[player-character] part removal failed", error);
      return res.status(500).json({ message: "Could not remove avatar part" });
    }
  });

  app.post("/api/admin/player-character/bases/:id/publish", isAdmin, async (req, res) => {
    const revision = playerCharacterRevisionSchema.safeParse(req.body);
    if (!revision.success) return res.status(400).json({ message: "Invalid avatar revision" });
    try {
      const outcome = await db.transaction(async tx => {
        // Publishing any base must serialize across ALL bases, not just this row.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(54072, 6)`);
        const [base] = await tx.select().from(playerCharacterBases)
          .where(eq(playerCharacterBases.id, String(req.params.id))).for("update");
        if (!base) return { status: 404 as const, message: "Avatar base not found" };
        if (base.revision !== revision.data.expectedRevision)
          return { status: 409 as const, message: "This avatar changed. Reload before publishing." };
        if (!completePlayerCharacterParts(base.draftParts))
          return { status: 422 as const, message: "Upload and save all eight avatar base parts before publishing" };

        // A single transaction ensures one default and no partial publish.
        // Draft changes never alter publishedParts until this explicit action.
        await tx.update(playerCharacterBases).set({ isDefault: false })
          .where(eq(playerCharacterBases.isDefault, true));
        const [published] = await tx.update(playerCharacterBases).set({
          publishedParts: resolvePlayerCharacterParts(base.draftParts).map(part => ({ ...part })),
          isDefault: true,
          publishedAt: new Date(),
          updatedAt: new Date(),
          revision: base.revision + 1,
        }).where(eq(playerCharacterBases.id, base.id)).returning();
        return { status: 200 as const, base: published };
      });
      if (outcome.status !== 200) return res.status(outcome.status).json({ message: outcome.message });
      return res.json(outcome.base);
    } catch (error) {
      console.error("[player-character] publish failed", error);
      return res.status(500).json({ message: "Could not publish avatar base" });
    }
  });

  // No game-page integration until Avatar 07/12. This read is available for
  // that stage and returns an explicit empty state before the first publish.
  app.get("/api/player-character/default", isAuthenticated, async (_req, res) => {
    try {
      const [base] = await db.select({
        id: playerCharacterBases.id,
        name: playerCharacterBases.name,
        parts: playerCharacterBases.publishedParts,
        publishedAt: playerCharacterBases.publishedAt,
      }).from(playerCharacterBases).where(eq(playerCharacterBases.isDefault, true)).limit(1);
      res.set("Cache-Control", "private, no-store");
      return res.json({ base: base ?? null });
    } catch (error) {
      console.error("[player-character] default read failed", error);
      return res.status(500).json({ message: "Could not load published avatar" });
    }
  });
}
