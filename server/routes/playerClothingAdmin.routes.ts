import type { Express, RequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import type { db as database } from "../db";
import { playerCharacterBases, playerClothingDrafts, shopItems } from "@shared/schema";
import {
  availablePlayerCharacterBody,
} from "@shared/playerCharacter";
import {
  PLAYER_CLOTHING_DEFAULT_ATTACHMENTS,
  PLAYER_CLOTHING_UPLOAD_SLOTS,
  clothingSlotPartType,
  canvasClothingFit,
  clothingSegmentKey,
  playerClothingCategorySchema,
  playerClothingSegmentSchema,
  type PlayerClothingSegment,
} from "@shared/playerCharacterClothing";
import {
  AVATAR_CLOTHING_UNRELEASED_WORLD,
  clothingRevisionSchema,
  clothingSegmentWriteSchema,
  clothingCanvasWriteSchema,
  createClothingDraftSchema,
  updateClothingDraftSchema,
  upsertClothingSegment,
  validClothingPublication,
} from "@shared/playerClothingAdmin";
import { playerCharacterPartTypeSchema } from "@shared/playerCharacter";

type Db = typeof database;

export interface PlayerClothingAdminDependencies {
  db: Db;
  isAdmin: RequestHandler;
  processImage: (imageData: string, maxSize: number) => Promise<string>;
}

const notFound = { message: "Avatar clothing design not found" };
const conflict = { message: "This clothing design changed in another editor. Reload before saving." };
const baseChanged = { message: "This avatar body has changed. Create clothing for its updated fit." };

function matchingPublication(current: Date, expected: Date | null): boolean {
  return expected instanceof Date && current.getTime() === expected.getTime();
}

/**
 * Private admin-only clothing editor. Drafts may be incomplete and never
 * become shop inventory. Save Clothing is the ONLY path that creates or
 * updates a clothing catalog SKU; 08B will enable ownership/equipment.
 */
export function registerPlayerClothingAdminRoutes(
  app: Express,
  { db, isAdmin, processImage }: PlayerClothingAdminDependencies,
): void {
  app.get("/api/admin/player-character/clothing", isAdmin, async (_req, res) => {
    try {
      const rows = await db.select().from(playerClothingDrafts);
      res.set("Cache-Control", "private, no-store");
      return res.json(rows);
    } catch (error) {
      console.error("[player-clothing] list failed", error);
      return res.status(500).json({ message: "Could not load clothing drafts" });
    }
  });

  app.post("/api/admin/player-character/clothing", isAdmin, async (req, res) => {
    const body = createClothingDraftSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Choose a saved, complete avatar body, clothing name and category." });
    try {
      const [base] = await db.select().from(playerCharacterBases)
        .where(eq(playerCharacterBases.id, body.data.baseId)).limit(1);
      const available = base ? availablePlayerCharacterBody(base) : null;
      if (!base || !available)
        return res.status(422).json({ message: "Save all eight parts of the Masc or Fem body before fitting clothing." });
      const [draft] = await db.insert(playerClothingDrafts).values({
        baseId: base.id,
        basePublishedAt: available.publishedAt,
        name: body.data.name,
        category: body.data.category,
      }).returning();
      return res.status(201).json(draft);
    } catch (error) {
      console.error("[player-clothing] create failed", error);
      return res.status(500).json({ message: "Could not create clothing draft" });
    }
  });

  app.patch("/api/admin/player-character/clothing/:id", isAdmin, async (req, res) => {
    const parsed = updateClothingDraftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid name, category or draft revision" });
    try {
      const [updated] = await db.update(playerClothingDrafts).set({
        name: parsed.data.name, category: parsed.data.category,
        revision: parsed.data.expectedRevision + 1, updatedAt: new Date(),
      }).where(and(eq(playerClothingDrafts.id, String(req.params.id)),
        eq(playerClothingDrafts.revision, parsed.data.expectedRevision))).returning();
      if (!updated) return res.status(409).json(conflict);
      return res.json(updated);
    } catch (error) {
      console.error("[player-clothing] metadata save failed", error);
      return res.status(500).json({ message: "Could not save clothing details" });
    }
  });

  // Full-canvas artwork is already aligned on transparent 1000×1000 images.
  // A top may upload torso and both sleeves; hair and face may upload multiple
  // images attached to the SAME head. One optimistic update saves all images.
  // Existing published snapshots and player wardrobe are never auto-changed.
  app.put("/api/admin/player-character/clothing/:id/artwork", isAdmin, async (req, res) => {
    const parsed = clothingCanvasWriteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose valid PNG/WebP clothing artwork" });
    try {
      const [draft] = await db.select().from(playerClothingDrafts)
        .where(eq(playerClothingDrafts.id, String(req.params.id))).limit(1);
      if (!draft) return res.status(404).json(notFound);
      if (draft.revision !== parsed.data.expectedRevision) return res.status(409).json(conflict);
      const [base] = await db.select().from(playerCharacterBases)
        .where(eq(playerCharacterBases.id, draft.baseId)).limit(1);
      if (!matchingPublication(draft.basePublishedAt, base ? availablePlayerCharacterBody(base)?.publishedAt ?? null : null))
        return res.status(409).json(baseChanged);

      if (parsed.data.shoesLayer && draft.category !== "shoes") {
        return res.status(400).json({ message: "Pants layering is only available for Shoes" });
      }
      // Without saved or uploaded shoe images there is no place to persist the
      // per-item setting. Avoid claiming a setting-only save succeeded.
      if (parsed.data.shoesLayer && draft.draftSegments.length === 0 &&
          parsed.data.images.length === 0) {
        return res.status(400).json({ message: "Upload shoe artwork before saving its layering" });
      }
      const shoesLayer = draft.category === "shoes"
        ? parsed.data.shoesLayer ?? draft.draftSegments.find(part => part.shoesLayer)?.shoesLayer ?? "under"
        : undefined;
      const validSlots = PLAYER_CLOTHING_UPLOAD_SLOTS[draft.category];
      if ([...parsed.data.images.map(x => x.slot), ...(parsed.data.removeSlots ?? [])]
        .some(slot => !(validSlots as readonly string[]).includes(slot))) {
        return res.status(400).json({ message: "This artwork slot is unavailable for the selected category" });
      }

      // Normalize previous private drafts as well. No image reupload is
      // necessary to correct old offsets/pivots in saved 1000px artwork.
      const existing: PlayerClothingSegment[] = draft.draftSegments.map(segment => {
        const slot = segment.slot ??
          (draft.category === "hair" && segment.partType === "head" ? "hair_front"
          : draft.category === "face" && segment.partType === "head" ? "face_open_eyes"
          : segment.partType);
        return {
          ...segment, slot, canvasAligned: true,
          ...(draft.category === "shoes" ? { shoesLayer } : {}),
          fit: canvasClothingFit(), renderPlane: "with_part" as const,
        };
      });
      const bySlot = new Map<string, PlayerClothingSegment>(
        existing.map(segment => [clothingSegmentKey(segment), segment]),
      );
      for (const slot of parsed.data.removeSlots ?? []) bySlot.delete(slot);
      for (const image of parsed.data.images) {
        const imageUrl = await processImage(image.imageData, 1000);
        bySlot.set(image.slot, playerClothingSegmentSchema.parse({
          slot: image.slot,
          partType: clothingSlotPartType(image.slot),
          imageUrl,
          canvasAligned: true,
          ...(draft.category === "shoes" ? { shoesLayer } : {}),
          fit: canvasClothingFit(),
          renderPlane: "with_part",
        }));
      }
      const draftSegments = [...bySlot.values()];
      // The same schema protects the player-facing catalog against malformed
      // slots and invalid multi-image garment combinations.
      if (draftSegments.length && !validClothingPublication(draft.name, draft.category, draftSegments))
        return res.status(422).json({ message: "The clothing layers do not match this category" });
      const [updated] = await db.update(playerClothingDrafts).set({
        draftSegments,
        revision: draft.revision + 1,
        updatedAt: new Date(),
      }).where(and(eq(playerClothingDrafts.id, draft.id),
        eq(playerClothingDrafts.revision, draft.revision))).returning();
      if (!updated) return res.status(409).json(conflict);
      return res.json(updated);
    } catch (error) {
      console.error("[player-clothing] full-canvas save failed", error);
      return res.status(500).json({ message: "Could not save clothing artwork" });
    }
  });

  app.put("/api/admin/player-character/clothing/:id/segments/:partType", isAdmin, async (req, res) => {
    const partType = playerCharacterPartTypeSchema.safeParse(req.params.partType);
    const body = clothingSegmentWriteSchema.safeParse(req.body);
    if (!partType.success || !body.success)
      return res.status(400).json({ message: "Invalid clothing part, fitted position, or PNG/WebP upload" });
    try {
      const [draft] = await db.select().from(playerClothingDrafts)
        .where(eq(playerClothingDrafts.id, String(req.params.id))).limit(1);
      if (!draft) return res.status(404).json(notFound);
      if (draft.revision !== body.data.expectedRevision) return res.status(409).json(conflict);
      // Compatibility endpoint for OLD editor sessions only. Once an item
      // uses named full-canvas slots, reject legacy per-part edits that could
      // resize a new garment or delete several same-head images at once.
      if (draft.draftSegments.some(segment => segment.canvasAligned || segment.slot)) {
        return res.status(410).json({
          message: "Refresh the clothing editor and use Save Artwork for this design",
        });
      }
      const [base] = await db.select().from(playerCharacterBases)
        .where(eq(playerCharacterBases.id, draft.baseId)).limit(1);
      if (!matchingPublication(draft.basePublishedAt, base ? availablePlayerCharacterBody(base)?.publishedAt ?? null : null))
        return res.status(409).json(baseChanged);

      const existing = draft.draftSegments.find(segment => segment.partType === partType.data);
      if (!body.data.imageData && !existing)
        return res.status(400).json({ message: "Upload this clothing piece before saving its position" });

      // Process one image per request so a phone never sends eight large
      // base64 files together. The existing processor saves a bounded PNG.
      let imageUrl: string;
      try {
        imageUrl = body.data.imageData
          ? await processImage(body.data.imageData, 1000)
          : existing!.imageUrl;
      } catch {
        return res.status(400).json({ message: "Could not process this PNG/WebP. Please choose another image." });
      }
      const segment = playerClothingSegmentSchema.parse({
        partType: partType.data, imageUrl,
        fit: body.data.fit, renderPlane: body.data.renderPlane,
      });
      const draftSegments = upsertClothingSegment(draft.draftSegments, segment);
      const [updated] = await db.update(playerClothingDrafts).set({
        draftSegments, revision: draft.revision + 1, updatedAt: new Date(),
      }).where(and(eq(playerClothingDrafts.id, draft.id), eq(playerClothingDrafts.revision, draft.revision)))
        .returning();
      if (!updated) return res.status(409).json(conflict);
      return res.json(updated);
    } catch (error) {
      console.error("[player-clothing] segment save failed", error);
      return res.status(500).json({ message: "Could not save clothing piece" });
    }
  });

  app.delete("/api/admin/player-character/clothing/:id/segments/:partType", isAdmin, async (req, res) => {
    const type = playerCharacterPartTypeSchema.safeParse(req.params.partType);
    const body = clothingRevisionSchema.safeParse(req.body);
    if (!type.success || !body.success) return res.status(400).json({ message: "Invalid clothing part or revision" });
    try {
      const [draft] = await db.select().from(playerClothingDrafts)
        .where(eq(playerClothingDrafts.id, String(req.params.id))).limit(1);
      if (!draft) return res.status(404).json(notFound);
      if (draft.revision !== body.data.expectedRevision) return res.status(409).json(conflict);
      // Compatibility endpoint for OLD editor sessions only. Once an item
      // uses named full-canvas slots, reject legacy per-part edits that could
      // resize a new garment or delete several same-head images at once.
      if (draft.draftSegments.some(segment => segment.canvasAligned || segment.slot)) {
        return res.status(410).json({
          message: "Refresh the clothing editor and use Save Artwork for this design",
        });
      }
      const [updated] = await db.update(playerClothingDrafts).set({
        draftSegments: draft.draftSegments.filter(item => item.partType !== type.data),
        revision: draft.revision + 1, updatedAt: new Date(),
      }).where(and(eq(playerClothingDrafts.id, draft.id), eq(playerClothingDrafts.revision, draft.revision)))
        .returning();
      if (!updated) return res.status(409).json(conflict);
      return res.json(updated);
    } catch (error) {
      console.error("[player-clothing] remove segment failed", error);
      return res.status(500).json({ message: "Could not remove clothing piece" });
    }
  });

  app.post("/api/admin/player-character/clothing/:id/save", isAdmin, async (req, res) => {
    const body = clothingRevisionSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid clothing revision" });
    try {
      const outcome = await db.transaction(async tx => {
        const [draft] = await tx.select().from(playerClothingDrafts)
          .where(eq(playerClothingDrafts.id, String(req.params.id))).for("update");
        if (!draft) return { status: 404 as const, message: notFound.message };
        if (draft.revision !== body.data.expectedRevision)
          return { status: 409 as const, message: conflict.message };
        if (!validClothingPublication(draft.name, draft.category, draft.draftSegments))
          return { status: 422 as const, message: "Save at least one valid fitted clothing image before saving the item" };

        // Lock base against a concurrent republish and stop new garments from
        // silently fitting the wrong version of a character.
        const [base] = await tx.select().from(playerCharacterBases)
          .where(eq(playerCharacterBases.id, draft.baseId)).for("share");
        if (!matchingPublication(draft.basePublishedAt, base ? availablePlayerCharacterBody(base)?.publishedAt ?? null : null))
          return { status: 409 as const, message: baseChanged.message };

        const preferredPart = PLAYER_CLOTHING_DEFAULT_ATTACHMENTS[draft.category][0];
        const thumbnail = draft.draftSegments.find(s => s.partType === preferredPart)?.imageUrl
          ?? draft.draftSegments[0].imageUrl;
        const itemData = {
          name: draft.name,
          type: "clothing",
          worldId: AVATAR_CLOTHING_UNRELEASED_WORLD,
          price: 0,
          description: `Avatar clothing · ${draft.category}`,
          imageUrl: thumbnail,
        };
        let shopItemId = draft.shopItemId;
        if (shopItemId) {
          const [updated] = await tx.update(shopItems).set(itemData).where(and(
            eq(shopItems.id, shopItemId),
            eq(shopItems.type, "clothing"),
            eq(shopItems.worldId, AVATAR_CLOTHING_UNRELEASED_WORLD),
          )).returning({ id: shopItems.id });
          if (!updated) throw new Error("The clothing catalog item was changed or deleted");
        } else {
          const [created] = await tx.insert(shopItems).values(itemData).returning({ id: shopItems.id });
          shopItemId = created.id;
        }

        const [saved] = await tx.update(playerClothingDrafts).set({
          shopItemId,
          publishedSegments: draft.draftSegments.map(part => ({ ...part, fit: { ...part.fit } })),
          publishedCategory: draft.category,
          revision: draft.revision + 1,
          publishedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(playerClothingDrafts.id, draft.id)).returning();
        return { status: 200 as const, saved };
      });

      if (outcome.status !== 200) return res.status(outcome.status).json({ message: outcome.message });
      return res.json(outcome.saved);
    } catch (error) {
      console.error("[player-clothing] save failed", error);
      return res.status(500).json({ message: "Could not save clothing item" });
    }
  });
}
