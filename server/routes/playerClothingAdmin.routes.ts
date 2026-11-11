import type { Express, RequestHandler } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db as database } from "../db";
import {
  petParkBuildings, playerAvatarEquipment, playerAvatarProfiles,
  playerCharacterBases, playerClothingDrafts, shopItems, userInventory,
  worldScenePlacements,
} from "@shared/schema";
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
  type PlayerClothingBodyVariants,
  PLAYER_CLOTHING_BODY_TYPES, isUniversalClothingCategory,
} from "@shared/playerCharacterClothing";
import {
  AVATAR_CLOTHING_UNRELEASED_WORLD,
  clothingRevisionSchema,
  saveUniversalClothingItemSchema,
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
  /**
   * Organized clothing creator: all parts are saved with one user action.
   * The reference base is only a legacy FK; new items are universal on the
   * shared 1000x1000 canvas and can follow either completed body rig.
   * Existing artwork is reused by slot ID; no client-supplied media URLs.
   */
  app.post("/api/admin/player-character/clothing/item", isAdmin, async (req, res) => {
    const input = saveUniversalClothingItemSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({
      message: input.error.issues[0]?.message ?? "Complete the clothing name and artwork",
    });
    try {
      // Process uploads before opening a transaction; it holds only SQL locks.
      // Image processor is already responsible for bounding transparent media.
      const uploads = await Promise.all(input.data.images.map(async image => ({
        ...image, imageUrl: await processImage(image.imageData, 1000),
      })));
      const uploadedVariants = input.data.bodyVariants ? {
        fem: await Promise.all(input.data.bodyVariants.fem.images.map(async image => ({
          ...image, imageUrl: await processImage(image.imageData, 1000),
        }))),
        masc: await Promise.all(input.data.bodyVariants.masc.images.map(async image => ({
          ...image, imageUrl: await processImage(image.imageData, 1000),
        }))),
      } : null;
      // Keep a standalone catalog image even when an item is free.
      const uploadedShopImage = input.data.shopImageData
        ? await processImage(input.data.shopImageData, 1000) : null;
      const outcome = await db.transaction(async tx => {
        const existing = input.data.id
          ? (await tx.select().from(playerClothingDrafts)
              .where(and(eq(playerClothingDrafts.id, input.data.id),
                isNull(playerClothingDrafts.deletedAt))).for("update"))[0]
          : null;
        if (input.data.id && !existing) return { status: 404 as const, message: notFound.message };
        if (existing && existing.revision !== input.data.expectedRevision)
          return { status: 409 as const, message: conflict.message };

        // The stored base is not a compatibility restriction for new items.
        // One saved body is enough to anchor the legacy non-null FK.
        const rows = await tx.select().from(playerCharacterBases).for("share");
        const ready = rows.map(base => ({ base, available: availablePlayerCharacterBody(base) }))
          .filter((entry): entry is { base: typeof rows[number]; available: NonNullable<typeof entry.available> } =>
            !!entry.available && ["fem", "masc"].includes(entry.base.name.trim().toLowerCase()))
          .sort((a, b) => Number(a.base.name.trim().toLowerCase() !== "fem") -
            Number(b.base.name.trim().toLowerCase() !== "fem"));
        if (!ready.length) return { status: 422 as const,
          message: "Save a complete Fem or Masc body before adding clothing." };
        const reference = ready[0];
        if (input.data.bodyVariants &&
            !PLAYER_CLOTHING_BODY_TYPES.every(kind => ready.some(entry =>
              entry.base.name.trim().toLowerCase() === kind)))
          return { status: 422 as const,
            message: "Save both Fem and Masc body bases before adding two clothing versions." };
        if (existing?.draftBodyVariants && !input.data.bodyVariants &&
            !isUniversalClothingCategory(input.data.category))
          return { status: 409 as const,
            message: "This item has Fem/Masc versions. Reload the updated clothing editor." };

        // Keep the two variants fully independent and validate old-media reuse
        // against the matching version. Older shared clothing may seed both
        // when the admin first converts it to separate artwork.
        const buildSegments = (
          existingSegments: readonly PlayerClothingSegment[],
          keep: typeof input.data.keep,
          processed: typeof uploads,
        ): PlayerClothingSegment[] | null => {
          const old = new Map(existingSegments.map(segment =>
            [clothingSegmentKey(segment), segment] as const));
          const segments: PlayerClothingSegment[] = [];
          for (const item of keep) {
            const previous = old.get(item.previousSlot);
            if (!previous) return null;
            segments.push(playerClothingSegmentSchema.parse({
              ...previous, slot: item.slot, partType: item.partType,
              canvasAligned: true, fit: canvasClothingFit(),
              renderPlane: input.data.category === "hair" ? item.renderPlane ?? "with_part" : "with_part",
              ...(input.data.category === "shoes"
                ? { shoesLayer: input.data.shoesLayer ?? "under" } : { shoesLayer: undefined }),
            }));
          }
          for (const image of processed) segments.push(playerClothingSegmentSchema.parse({
            slot: image.slot, partType: image.partType, imageUrl: image.imageUrl,
            canvasAligned: true, fit: canvasClothingFit(),
            renderPlane: input.data.category === "hair" ? image.renderPlane ?? "with_part" : "with_part",
            ...(input.data.category === "shoes" ? { shoesLayer: input.data.shoesLayer ?? "under" } : {}),
          }));
          return segments;
        };
        let bodyVariants: PlayerClothingBodyVariants | null = null;
        let segments: PlayerClothingSegment[];
        if (input.data.bodyVariants && uploadedVariants) {
          const output = {} as PlayerClothingBodyVariants;
          for (const kind of PLAYER_CLOTHING_BODY_TYPES) {
            const source = existing?.draftBodyVariants?.[kind] ?? existing?.draftSegments ?? [];
            const resolved = buildSegments(source,
              input.data.bodyVariants[kind].keep, uploadedVariants[kind]);
            if (!resolved) return { status: 409 as const,
              message: "A saved clothing piece changed. Reload this item before editing." };
            if (!validClothingPublication(input.data.name, input.data.category, resolved))
              return { status: 422 as const,
                message: `Complete the ${kind === "fem" ? "Fem" : "Masc"} clothing artwork before saving.` };
            output[kind] = resolved;
          }
          bodyVariants = output;
          segments = output.fem;
        } else {
          const resolved = buildSegments(
            isUniversalClothingCategory(input.data.category)
              ? (existing?.draftBodyVariants?.fem ?? existing?.draftSegments ?? [])
              : (existing?.draftSegments ?? []),
            input.data.keep, uploads);
          if (!resolved) return { status: 409 as const,
            message: "A saved clothing piece changed. Reload this item before editing." };
          segments = resolved;
          if (!validClothingPublication(input.data.name, input.data.category, segments))
            return { status: 422 as const, message: "Clothing pieces or Face expressions are incomplete." };
        }
        const thumbnail = segments[0].imageUrl;
        const shopImageUrl = uploadedShopImage ?? existing?.shopImageUrl ?? null;
        if (input.data.price > 0 && !shopImageUrl)
          return { status: 422 as const,
            message: "Upload a shop/reward image for clothing that costs coins." };
        const catalogData = {
          name: input.data.name, type: "clothing" as const,
          worldId: AVATAR_CLOTHING_UNRELEASED_WORLD, price: input.data.price,
          description: `Avatar clothing · ${input.data.category}`,
          // Inventory, market, shops and rewards share shop_items.image_url.
          imageUrl: shopImageUrl ?? thumbnail,
        };
        let itemId = existing?.shopItemId ?? null;
        if (itemId) {
          const [updated] = await tx.update(shopItems).set(catalogData).where(and(
            eq(shopItems.id, itemId), eq(shopItems.type, "clothing"),
            eq(shopItems.worldId, AVATAR_CLOTHING_UNRELEASED_WORLD),
          )).returning({ id: shopItems.id });
          if (!updated) return { status: 409 as const,
            message: "This clothing catalog entry was changed. Refresh and retry." };
        } else {
          const [created] = await tx.insert(shopItems).values(catalogData).returning({ id: shopItems.id });
          itemId = created.id;
        }
        const now = new Date();
        const fields = {
          name: input.data.name, category: input.data.category,
          draftSegments: segments, publishedSegments: segments,
          draftBodyVariants: bodyVariants, publishedBodyVariants: bodyVariants,
          publishedCategory: input.data.category, universal: true,
          // Legacy checkbox data is accepted for compatibility but no longer
          // determines player recoloring. Only hair uses a color picker.
          colorPickerEnabled: input.data.category === "hair",
          shopImageUrl,
          shopItemId: itemId, publishedAt: now, updatedAt: now,
        };
        const [saved] = existing
          ? await tx.update(playerClothingDrafts).set({
              ...fields, revision: existing.revision + 1,
            }).where(eq(playerClothingDrafts.id, existing.id)).returning()
          : await tx.insert(playerClothingDrafts).values({
              ...fields, baseId: reference.base.id,
              basePublishedAt: reference.available.publishedAt,
            }).returning();
        return { status: 200 as const, saved };
      });
      if (outcome.status !== 200) return res.status(outcome.status).json({ message: outcome.message });
      // Match the joined GET shape for an immediate edit after Save.
      return res.json({ ...outcome.saved, price: input.data.price });
    } catch (error) {
      console.error("[player-clothing] universal item save failed", error);
      return res.status(500).json({ message: "Could not save clothing item" });
    }
  });

  /** Retire a saved item without destroying a player's historical SKU.
   * Deleted clothing disappears from free entitlements, purchases, equipment
   * and editor listings. Removing an item requires a matching revision, so a
   * second admin cannot silently erase newly edited work.
   */
  app.delete("/api/admin/player-character/clothing/item/:id", isAdmin, async (req, res) => {
    const id = String(req.params.id ?? "");
    const revision = Number(req.body?.expectedRevision);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id) ||
        !Number.isInteger(revision) || revision < 0)
      return res.status(400).json({ message: "Invalid clothing item or revision" });
    try {
      const result = await db.transaction(async tx => {
        const [draft] = await tx.select().from(playerClothingDrafts)
          .where(and(eq(playerClothingDrafts.id, id),
            isNull(playerClothingDrafts.deletedAt))).for("update");
        if (!draft) return { status: 404 as const, message: notFound.message };
        if (draft.revision !== revision)
          return { status: 409 as const, message: conflict.message };

        // Existing inventory rows remain for accounting and grant history;
        // clothing equipment links are removed and their account revisions
        // invalidated together with retirement.
        if (draft.shopItemId) {
          const inventoryRows = await tx.select({ id: userInventory.id })
            .from(userInventory).where(eq(userInventory.shopItemId, draft.shopItemId));
          if (inventoryRows.length) {
            const removed = await tx.delete(playerAvatarEquipment)
              .where(inArray(playerAvatarEquipment.inventoryId,
                inventoryRows.map(row => row.id)))
              .returning({ userId: playerAvatarEquipment.userId });
            const affectedUsers = [...new Set(removed.map(row => row.userId))];
            if (affectedUsers.length) await tx.update(playerAvatarProfiles)
              .set({ revision: sql`${playerAvatarProfiles.revision} + 1`,
                updatedAt: new Date() })
              .where(inArray(playerAvatarProfiles.userId, affectedUsers));
          }
          // Remove merchandise from both editor shop models as well as
          // revoking the catalog listing. Otherwise the deleted item could
          // still appear as a ghost tile with a broken purchase button.
          const parkShops = await tx.select({
            id: petParkBuildings.id,
            ids: petParkBuildings.shopItemIds,
            placements: petParkBuildings.shopItemPlacements,
          }).from(petParkBuildings);
          for (const shop of parkShops) if (shop.ids.includes(draft.shopItemId)) {
            await tx.update(petParkBuildings).set({
              shopItemIds: shop.ids.filter(id => id !== draft.shopItemId),
              shopItemPlacements: shop.placements.filter(item => item.itemId !== draft.shopItemId),
            }).where(eq(petParkBuildings.id, shop.id));
          }
          const worldShops = await tx.select({
            id: worldScenePlacements.id,
            ids: worldScenePlacements.shopItemIds,
            placements: worldScenePlacements.shopItemPlacements,
          }).from(worldScenePlacements);
          for (const shop of worldShops) if (shop.ids.includes(draft.shopItemId)) {
            await tx.update(worldScenePlacements).set({
              shopItemIds: shop.ids.filter(id => id !== draft.shopItemId),
              shopItemPlacements: shop.placements.filter(item => item.itemId !== draft.shopItemId),
            }).where(eq(worldScenePlacements.id, shop.id));
          }
          // Historical item row remains, but cannot be acquired in any shop.
          await tx.update(shopItems).set({
            worldId: "__retired_avatar_clothing__",
            description: "Retired avatar clothing",
          }).where(and(eq(shopItems.id, draft.shopItemId),
            eq(shopItems.type, "clothing"),
            eq(shopItems.worldId, AVATAR_CLOTHING_UNRELEASED_WORLD)));
        }
        await tx.update(playerClothingDrafts).set({
          deletedAt: new Date(), updatedAt: new Date(), revision: draft.revision + 1,
          publishedAt: null, publishedSegments: null, publishedCategory: null,
        }).where(eq(playerClothingDrafts.id, id));
        return { status: 200 as const };
      });
      if (result.status !== 200) return res.status(result.status).json({ message: result.message });
      return res.json({ id, deleted: true });
    } catch (error) {
      console.error("[player-clothing] delete failed", error);
      return res.status(500).json({ message: "Could not delete clothing item" });
    }
  });

  app.get("/api/admin/player-character/clothing", isAdmin, async (_req, res) => {
    try {
      const rows = await db.select({
        draft: playerClothingDrafts, price: shopItems.price,
      }).from(playerClothingDrafts)
        .leftJoin(shopItems, eq(playerClothingDrafts.shopItemId, shopItems.id))
        .where(isNull(playerClothingDrafts.deletedAt));
      res.set("Cache-Control", "private, no-store");
      return res.json(rows.map(row => ({ ...row.draft, price: row.price ?? 0 })));
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
        .where(and(eq(playerClothingDrafts.id, String(req.params.id)),
          isNull(playerClothingDrafts.deletedAt))).limit(1);
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
        .where(and(eq(playerClothingDrafts.id, String(req.params.id)),
          isNull(playerClothingDrafts.deletedAt))).limit(1);
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
        .where(and(eq(playerClothingDrafts.id, String(req.params.id)),
          isNull(playerClothingDrafts.deletedAt))).limit(1);
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
          .where(and(eq(playerClothingDrafts.id, String(req.params.id)),
            isNull(playerClothingDrafts.deletedAt))).for("update");
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
          // Preserve main catalog artwork on legacy Save Clothing as well.
          // Previously this path silently replaced it with a fitted part image.
          imageUrl: draft.shopImageUrl || thumbnail,
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
