import type { Express, RequestHandler } from "express";
import { and, eq, gt, isNull, notInArray } from "drizzle-orm";
import { AVATAR_CLOTHING_UNRELEASED_WORLD } from "@shared/playerClothingAdmin";
import type { db as database } from "../db";
import {
  playerAvatarProfiles, playerAvatarEquipment, playerCharacterBases,
  playerClothingDrafts, shopItems, userInventory,
} from "@shared/schema";
import {
  availablePlayerCharacterBody, resolvePlayerCharacterParts,
} from "@shared/playerCharacter";
import {
  playerClothingDefinitionSchema, clothingSegmentsForBody, playerClothingCanRecolor,
  type PlayerClothingCategory,
} from "@shared/playerCharacterClothing";
import {
  changePlayerAvatarBaseSchema, createPlayerAvatarSchema, savePlayerAvatarCharacterSchema,
  isEligiblePlayerClothingInventory, playerClothingCategorySchema,
  savePlayerAvatarEquipmentSchema, savePlayerAvatarTuckSchema,
} from "@shared/playerAvatarEquipment";

type Db = typeof database;

export interface PlayerAvatarRouteDependencies {
  db: Db;
  isAuthenticated: RequestHandler;
}

/** A player's avatar is only "created" after an explicit authenticated
 * first save, never automatically when the admin publishes a default base.
 * A snapshot keeps a later admin republish from silently changing existing
 * player characters and their fitted outfits.
 */
async function loadPublishedBase(
  db: Db, baseId: string,
) {
  const [base] = await db.select().from(playerCharacterBases)
    .where(eq(playerCharacterBases.id, baseId)).limit(1);
  const available = base ? availablePlayerCharacterBody(base) : null;
  if (!base || !available) return null;
  return { id: base.id, name: base.name, ...available };
}

async function readPlayerAvatar(db: Db, userId: string) {
  const [profile] = await db.select().from(playerAvatarProfiles)
    .where(eq(playerAvatarProfiles.userId, userId)).limit(1);

  const [baseRow] = profile
    ? await db.select({ id: playerCharacterBases.id, name: playerCharacterBases.name })
        .from(playerCharacterBases).where(eq(playerCharacterBases.id, profile.baseId)).limit(1)
    : await db.select().from(playerCharacterBases)
        .where(eq(playerCharacterBases.isDefault, true)).limit(1);

  // Complete saved Masc/Fem bodies are the player-facing choices.
  const bodyRows = await db.select().from(playerCharacterBases);
  const availableBases = bodyRows.flatMap(row => {
    const kind = row.name.trim().toLowerCase();
    if (kind !== "masc" && kind !== "fem") return [];
    const snapshot = availablePlayerCharacterBody(row);
    return snapshot ? [{ id: row.id, name: row.name, ...snapshot }] : [];
  }).sort((a, b) =>
    (a.name.trim().toLowerCase() === "fem" ? 0 : 1) -
    (b.name.trim().toLowerCase() === "fem" ? 0 : 1));
  const previewBase = !profile
    ? availableBases.find(base => base.id === baseRow?.id)
      ?? availableBases[0]
      ?? (baseRow ? await loadPublishedBase(db, baseRow.id) : null)
    : null;
  const activeBase = profile
    ? { id: profile.baseId, name: baseRow?.name ?? "Player Avatar",
        parts: resolvePlayerCharacterParts(profile.baseParts),
        publishedAt: profile.basePublishedAt }
    : previewBase;

  const ownedRows = await db.select({
    inventoryId: userInventory.id,
    ownerId: userInventory.userId,
    shopItemId: shopItems.id,
    itemType: shopItems.type,
    quantity: userInventory.quantity,
    isListed: userInventory.isListed,
    imageUrl: shopItems.imageUrl,
    mainImageUrl: playerClothingDrafts.shopImageUrl,
    name: shopItems.name,
    category: playerClothingDrafts.publishedCategory,
    baseId: playerClothingDrafts.baseId,
    basePublishedAt: playerClothingDrafts.basePublishedAt,
    universal: playerClothingDrafts.universal,
    colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
    segments: playerClothingDrafts.publishedSegments,
    bodyVariants: playerClothingDrafts.publishedBodyVariants,
  }).from(userInventory)
    .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
    .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
    .where(and(
      eq(userInventory.userId, userId), eq(shopItems.type, "clothing"),
      isNull(playerClothingDrafts.deletedAt),
      gt(userInventory.quantity, 0),
    ));

  const ownedClothing = ownedRows.flatMap(item => {
    const bodySegments = clothingSegmentsForBody(
      item.segments, item.bodyVariants, activeBase?.name);
    const parsed = playerClothingDefinitionSchema.safeParse({
      name: item.name, category: item.category, segments: bodySegments,
    });
    if (!parsed.success) return [];
    const compatible = !!activeBase && isEligiblePlayerClothingInventory({
      ownerId: item.ownerId, playerId: userId, itemType: item.itemType,
      quantity: item.quantity, isListed: item.isListed,
      itemCategory: parsed.data.category, requestedCategory: parsed.data.category,
      designBaseId: item.baseId, selectedBaseId: activeBase.id,
      designBasePublishedAt: item.basePublishedAt,
      selectedBasePublishedAt: activeBase.publishedAt,
      universal: item.universal,
      publishedSegmentsCount: parsed.data.segments.length,
    });
    return [{
      inventoryId: item.inventoryId, shopItemId: item.shopItemId,
      name: item.name, imageUrl: item.mainImageUrl || item.imageUrl, category: parsed.data.category,
      quantity: item.quantity, isListed: item.isListed,
      compatible, universal: item.universal, free: false,
      designBaseId: item.baseId, designBasePublishedAt: item.basePublishedAt,
      colorPickerEnabled: playerClothingCanRecolor(parsed.data.category, item.colorPickerEnabled), segments: parsed.data.segments,
      bodyVariants: item.bodyVariants,
    }];
  });

  // Free universal clothing is a live catalog entitlement for EVERY player,
  // including newly registered accounts. No bulk insertion into user_inventory
  // and no side effects on GET; the first Equip materializes ownership safely.
  const freeRows = await db.select({
    shopItemId: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
    mainImageUrl: playerClothingDrafts.shopImageUrl,
    category: playerClothingDrafts.publishedCategory,
    baseId: playerClothingDrafts.baseId,
    basePublishedAt: playerClothingDrafts.basePublishedAt,
    colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
    segments: playerClothingDrafts.publishedSegments,
    bodyVariants: playerClothingDrafts.publishedBodyVariants,
  }).from(shopItems)
    .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
    .where(and(eq(shopItems.type, "clothing"), eq(shopItems.price, 0),
      eq(shopItems.worldId, AVATAR_CLOTHING_UNRELEASED_WORLD),
      eq(playerClothingDrafts.universal, true),
      isNull(playerClothingDrafts.deletedAt)));
  const alreadyOwned = new Set(ownedRows.filter(item => !item.isListed && item.quantity > 0)
    .map(item => item.shopItemId));
  for (const item of freeRows) {
    if (alreadyOwned.has(item.shopItemId)) continue;
    const bodySegments = clothingSegmentsForBody(
      item.segments, item.bodyVariants, activeBase?.name);
    const parsed = playerClothingDefinitionSchema.safeParse({
      name: item.name, category: item.category, segments: bodySegments,
    });
    if (!parsed.success) continue;
    ownedClothing.push({
      inventoryId: item.shopItemId, shopItemId: item.shopItemId,
      name: item.name, imageUrl: item.mainImageUrl || item.imageUrl, category: parsed.data.category,
      quantity: 1, isListed: false, compatible: true, universal: true,
      designBaseId: item.baseId, designBasePublishedAt: item.basePublishedAt,
      free: true, colorPickerEnabled: playerClothingCanRecolor(parsed.data.category, item.colorPickerEnabled),
      segments: parsed.data.segments,
      bodyVariants: item.bodyVariants,
    });
  }

  const savedEquipment = profile
    ? await db.select().from(playerAvatarEquipment)
        .where(eq(playerAvatarEquipment.userId, userId))
    : [];

  const eligibleById = new Map(ownedClothing.filter(item => item.compatible)
    .map(item => [item.inventoryId, item]));
  const equipped = savedEquipment.flatMap(entry => {
    const item = eligibleById.get(entry.inventoryId);
    return item && item.category === entry.category
      ? [{ category: entry.category, inventoryId: item.inventoryId,
          shopItemId: item.shopItemId, name: item.name, imageUrl: item.imageUrl,
          segments: item.segments, bodyVariants: item.bodyVariants,
          colorPickerEnabled: playerClothingCanRecolor(item.category, item.colorPickerEnabled),
          colorTint: playerClothingCanRecolor(item.category, item.colorPickerEnabled) ? entry.colorTint : null }]
      : [];
  });
  const validSlots = new Set(equipped.map(item => item.category));
  const unavailableEquipmentSlots = savedEquipment
    .filter(entry => !validSlots.has(entry.category)).map(entry => entry.category);

  return {
    created: !!profile,
    revision: profile?.revision ?? null,
    base: activeBase
      ? { id: activeBase.id, name: activeBase.name, parts: activeBase.parts,
          publishedAt: activeBase.publishedAt }
      : null,
    availableBases,
    skinTone: profile?.skinTone ?? null,
    topTucked: profile?.topTucked ?? false,
    ownedClothing,
    equipped,
    unavailableEquipmentSlots,
  };
}

export function registerPlayerAvatarRoutes(
  app: Express, { db, isAuthenticated }: PlayerAvatarRouteDependencies,
): void {
  app.get("/api/player-avatar", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as { id: string };
      res.set("Cache-Control", "private, no-store");
      return res.json(await readPlayerAvatar(db, user.id));
    } catch (error) {
      console.error("[player-avatar] read failed", error);
      return res.status(500).json({ message: "Could not load player avatar" });
    }
  });

  app.post("/api/player-avatar/create", isAuthenticated, async (req, res) => {
    const input = createPlayerAvatarSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Choose a valid avatar base" });
    const user = req.user as { id: string };
    try {
      const outcome = await db.transaction(async tx => {
        // Serialize saves and admin publishes on this particular base.
        const [base] = await tx.select().from(playerCharacterBases)
          .where(eq(playerCharacterBases.id, input.data.baseId)).for("share");
        const available = base ? availablePlayerCharacterBody(base) : null;
        if (!base || !available)
          return { status: 422 as const, message: "Save all eight body parts before selecting this character" };

        // Enforce body-specific first-save requirements on the server too:
        // Masc may be topless; Fem still needs Top, with Bottoms and Face on both.
        // The shared schema requires Bottoms and Face regardless of body.
        if (base.name.trim().toLowerCase() !== "masc" && !input.data.outfit.top)
          return { status: 422 as const, message: "Choose a Top before saving a Fem character" };
        // Validate every selected garment before creating a profile or stock.
        // Selected optional items are committed atomically with required ones.
        // An invalid/stale item leaves no partial avatar.
        const outfitToSave: Array<{
          category: PlayerClothingCategory;
          inventoryId: string | null; shopItemId: string; colorTint: string | null;
        }> = [];
        for (const [category, selection] of Object.entries(input.data.outfit) as Array<
          [PlayerClothingCategory, { inventoryId: string; colorTint?: string | null }]
        >) {
          const [owned] = await tx.select({
            inventoryId: userInventory.id, ownerId: userInventory.userId,
            quantity: userInventory.quantity, isListed: userInventory.isListed,
            shopItemId: shopItems.id, name: shopItems.name, itemType: shopItems.type,
            category: playerClothingDrafts.publishedCategory,
            baseId: playerClothingDrafts.baseId, basePublishedAt: playerClothingDrafts.basePublishedAt,
            universal: playerClothingDrafts.universal,
            colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
            segments: playerClothingDrafts.publishedSegments,
            bodyVariants: playerClothingDrafts.publishedBodyVariants,
          }).from(userInventory)
            .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
            .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
            .where(and(eq(userInventory.id, selection.inventoryId),
              eq(userInventory.userId, user.id),
              eq(shopItems.type, "clothing"), isNull(playerClothingDrafts.deletedAt)))
            .limit(1);
          // Free items are virtual entitlements until the first explicit Save.
          const [free] = owned ? [] : await tx.select({
            shopItemId: shopItems.id, name: shopItems.name, itemType: shopItems.type,
            category: playerClothingDrafts.publishedCategory,
            baseId: playerClothingDrafts.baseId, basePublishedAt: playerClothingDrafts.basePublishedAt,
            universal: playerClothingDrafts.universal,
            colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
            segments: playerClothingDrafts.publishedSegments,
            bodyVariants: playerClothingDrafts.publishedBodyVariants,
          }).from(shopItems)
            .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
            .where(and(eq(shopItems.id, selection.inventoryId),
              eq(shopItems.type, "clothing"), eq(shopItems.price, 0),
              eq(shopItems.worldId, AVATAR_CLOTHING_UNRELEASED_WORLD),
              eq(playerClothingDrafts.universal, true),
              isNull(playerClothingDrafts.deletedAt))).limit(1);
          const item = owned ?? free;
          const parsed = item ? playerClothingDefinitionSchema.safeParse({
            name: item.name, category: item.category,
            segments: clothingSegmentsForBody(item.segments, item.bodyVariants, base.name),
          }) : null;
          if (!item || !parsed?.success || parsed.data.category !== category ||
              !isEligiblePlayerClothingInventory({
                ownerId: owned?.ownerId ?? user.id, playerId: user.id,
                itemType: item.itemType, quantity: owned?.quantity ?? 1,
                isListed: owned?.isListed ?? false,
                itemCategory: parsed.data.category, requestedCategory: category,
                designBaseId: item.baseId, selectedBaseId: base.id,
                designBasePublishedAt: item.basePublishedAt,
                selectedBasePublishedAt: available.publishedAt,
                universal: item.universal, publishedSegmentsCount: parsed.data.segments.length,
              })) {
            return { status: 422 as const,
              message: "One selected clothing item is unavailable. Choose another item that fits this body." };
          }
          if (!playerClothingCanRecolor(category, item.colorPickerEnabled) && selection.colorTint != null)
            return { status: 422 as const, message: "This clothing does not offer a color picker" };
          outfitToSave.push({
            category, inventoryId: owned?.inventoryId ?? null,
            shopItemId: item.shopItemId,
            colorTint: playerClothingCanRecolor(category, item.colorPickerEnabled) ? selection.colorTint ?? null : null,
          });
        }

        const [created] = await tx.insert(playerAvatarProfiles).values({
          userId: user.id, baseId: base.id, basePublishedAt: available.publishedAt,
          baseParts: available.parts,
          skinTone: input.data.skinTone ?? null,
          topTucked: input.data.topTucked ?? false,
        }).onConflictDoNothing().returning();

        if (!created) {
          const [already] = await tx.select({ baseId: playerAvatarProfiles.baseId })
            .from(playerAvatarProfiles).where(eq(playerAvatarProfiles.userId, user.id)).limit(1);
          if (already?.baseId !== base.id)
            return { status: 409 as const, message: "You already created a different avatar. Use Change Base." };
          // Retried POST never rewrites a player's existing wardrobe.
          return { status: 200 as const };
        }

        for (const choice of outfitToSave) {
          let inventoryId = choice.inventoryId;
          if (!inventoryId) {
            // Reuse available free stock if it exists; never duplicate it.
            const [existingFree] = await tx.select({ id: userInventory.id })
              .from(userInventory)
              .where(and(eq(userInventory.userId, user.id),
                eq(userInventory.shopItemId, choice.shopItemId),
                eq(userInventory.isListed, false), gt(userInventory.quantity, 0)))
              .limit(1);
            if (existingFree) inventoryId = existingFree.id;
            else {
              const [granted] = await tx.insert(userInventory).values({
                userId: user.id, shopItemId: choice.shopItemId, quantity: 1,
              }).returning({ id: userInventory.id });
              inventoryId = granted.id;
            }
          }
          await tx.insert(playerAvatarEquipment).values({
            userId: user.id, category: choice.category, inventoryId,
            colorTint: choice.colorTint,
          });
        }
        return { status: 201 as const };
      });
      if (outcome.status === 422 || outcome.status === 409)
        return res.status(outcome.status).json({ message: outcome.message });
      return res.status(outcome.status).json(await readPlayerAvatar(db, user.id));
    } catch (error) {
      console.error("[player-avatar] create failed", error);
      return res.status(500).json({ message: "Could not create player avatar" });
    }
  });

  /** Commit the entire character design as one transaction. There must be no
   * partial body saves, equipment writes, or free-item grants on failure. */
  app.put("/api/player-avatar/character", isAuthenticated, async (req, res) => {
    const input = savePlayerAvatarCharacterSchema.safeParse(req.body);
    if (!input.success)
      return res.status(400).json({ message: "Invalid character or outfit selection" });
    const user = req.user as { id: string };
    try {
      const outcome = await db.transaction(async tx => {
        const [profile] = await tx.select().from(playerAvatarProfiles)
          .where(eq(playerAvatarProfiles.userId, user.id)).for("update");
        if (!profile) return { status: 404 as const, message: "Create a character first" };
        if (profile.revision !== input.data.expectedRevision)
          return { status: 409 as const, message: "Your character changed elsewhere. Reload and retry." };
        const [base] = await tx.select().from(playerCharacterBases)
          .where(eq(playerCharacterBases.id, input.data.baseId)).for("share");
        const available = base ? availablePlayerCharacterBody(base) : null;
        if (!base || !available)
          return { status: 422 as const, message: "This character body is not available" };

        // Retain the existing pinned body artwork when editing the same base,
        // even if Admin has published a newer revision since first creation.
        // An unchanged base keeps its pinned art. Selecting the same base in
        // a future revision should not silently republish the player's rig.
        const selectedPublishedAt = profile.baseId === base.id
          ? profile.basePublishedAt : available.publishedAt;
        const selectedParts = profile.baseId === base.id ? profile.baseParts : available.parts;
        const prepared: Array<{
          category: PlayerClothingCategory;
          inventoryId: string | null;
          shopItemId: string;
          colorTint: string | null;
        }> = [];
        const usedInventory = new Set<string>();

        // Validate every selected garment BEFORE changing profile, equipment,
        // or inventory. Live ownership and publication checks defeat stale
        // cached items, another account's wardrobe and listed stock.
        for (const [category, selection] of Object.entries(input.data.outfit) as Array<
          [PlayerClothingCategory, { inventoryId: string; colorTint?: string | null } | null]
        >) {
          if (!selection) continue;
          if (usedInventory.has(selection.inventoryId))
            return { status: 422 as const, message: "A clothing item cannot occupy two slots" };
          usedInventory.add(selection.inventoryId);
          const [owned] = await tx.select({
            inventoryId: userInventory.id, ownerId: userInventory.userId,
            quantity: userInventory.quantity, isListed: userInventory.isListed,
            shopItemId: shopItems.id, name: shopItems.name, itemType: shopItems.type,
            category: playerClothingDrafts.publishedCategory,
            baseId: playerClothingDrafts.baseId,
            basePublishedAt: playerClothingDrafts.basePublishedAt,
            universal: playerClothingDrafts.universal,
            colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
            segments: playerClothingDrafts.publishedSegments,
            bodyVariants: playerClothingDrafts.publishedBodyVariants,
          }).from(userInventory)
            .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
            .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
            .where(and(eq(userInventory.id, selection.inventoryId),
              eq(userInventory.userId, user.id),
              eq(shopItems.type, "clothing"), isNull(playerClothingDrafts.deletedAt)))
            .limit(1);
          const [free] = owned ? [] : await tx.select({
            shopItemId: shopItems.id, name: shopItems.name, itemType: shopItems.type,
            category: playerClothingDrafts.publishedCategory,
            baseId: playerClothingDrafts.baseId,
            basePublishedAt: playerClothingDrafts.basePublishedAt,
            universal: playerClothingDrafts.universal,
            colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
            segments: playerClothingDrafts.publishedSegments,
            bodyVariants: playerClothingDrafts.publishedBodyVariants,
          }).from(shopItems)
            .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
            .where(and(eq(shopItems.id, selection.inventoryId),
              eq(shopItems.type, "clothing"), eq(shopItems.price, 0),
              eq(shopItems.worldId, AVATAR_CLOTHING_UNRELEASED_WORLD),
              eq(playerClothingDrafts.universal, true),
              isNull(playerClothingDrafts.deletedAt))).limit(1);
          const item = owned ?? free;
          const parsed = item ? playerClothingDefinitionSchema.safeParse({
            name: item.name, category: item.category,
            segments: clothingSegmentsForBody(item.segments, item.bodyVariants, base.name),
          }) : null;
          if (!item || !parsed?.success || parsed.data.category !== category ||
              !isEligiblePlayerClothingInventory({
                ownerId: owned?.ownerId ?? user.id, playerId: user.id,
                itemType: item.itemType, quantity: owned?.quantity ?? 1,
                isListed: owned?.isListed ?? false,
                itemCategory: parsed.data.category, requestedCategory: category,
                designBaseId: item.baseId, selectedBaseId: base.id,
                designBasePublishedAt: item.basePublishedAt,
                selectedBasePublishedAt: selectedPublishedAt,
                universal: item.universal, publishedSegmentsCount: parsed.data.segments.length,
              })) {
            return { status: 422 as const,
              message: "An outfit item no longer fits this body or is unavailable. Please choose another." };
          }
          if (!playerClothingCanRecolor(category, item.colorPickerEnabled) && selection.colorTint != null)
            return { status: 422 as const, message: "Only hair may be recolored" };
          prepared.push({
            category, inventoryId: owned?.inventoryId ?? null,
            shopItemId: item.shopItemId,
            colorTint: playerClothingCanRecolor(category, item.colorPickerEnabled)
              ? selection.colorTint ?? null : null,
          });
        }

        // All selections have passed. Delete old equipped links only, never
        // owned clothing, and materialize free items at most once.
        await tx.delete(playerAvatarEquipment)
          .where(eq(playerAvatarEquipment.userId, user.id));
        for (const choice of prepared) {
          let inventoryId = choice.inventoryId;
          if (!inventoryId) {
            const [existing] = await tx.select({ id: userInventory.id })
              .from(userInventory).where(and(
                eq(userInventory.userId, user.id),
                eq(userInventory.shopItemId, choice.shopItemId),
                eq(userInventory.isListed, false), gt(userInventory.quantity, 0)))
              .limit(1);
            if (existing) inventoryId = existing.id;
            else {
              const [granted] = await tx.insert(userInventory).values({
                userId: user.id, shopItemId: choice.shopItemId, quantity: 1,
              }).returning({ id: userInventory.id });
              inventoryId = granted.id;
            }
          }
          await tx.insert(playerAvatarEquipment).values({
            userId: user.id, category: choice.category, inventoryId,
            colorTint: choice.colorTint,
          });
        }
        await tx.update(playerAvatarProfiles).set({
          baseId: base.id, basePublishedAt: selectedPublishedAt, baseParts: selectedParts,
          skinTone: input.data.skinTone ?? null, topTucked: input.data.topTucked,
          revision: profile.revision + 1, updatedAt: new Date(),
        }).where(eq(playerAvatarProfiles.userId, user.id));
        return { status: 200 as const };
      });
      if (outcome.status !== 200)
        return res.status(outcome.status).json({ message: outcome.message });
      return res.json(await readPlayerAvatar(db, user.id));
    } catch (error) {
      console.error("[player-avatar] full character save failed", error);
      return res.status(500).json({ message: "Could not save character" });
    }
  });

  app.patch("/api/player-avatar/base", isAuthenticated, async (req, res) => {
    const input = changePlayerAvatarBaseSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ message: "Invalid base or avatar revision" });
    const user = req.user as { id: string };
    try {
      const outcome = await db.transaction(async tx => {
        const [profile] = await tx.select().from(playerAvatarProfiles)
          .where(eq(playerAvatarProfiles.userId, user.id)).for("update");
        if (!profile) return { status: 404 as const, message: "Create a player avatar first" };
        if (profile.revision !== input.data.expectedRevision)
          return { status: 409 as const, message: "Avatar changed elsewhere. Refresh before saving." };

        const [base] = await tx.select().from(playerCharacterBases)
          .where(eq(playerCharacterBases.id, input.data.baseId)).for("share");
        const available = base ? availablePlayerCharacterBody(base) : null;
        if (!base || !available)
          return { status: 422 as const, message: "Save all eight body parts before selecting this character" };

        const sameBase = (input.data.keepSnapshot === true && profile.baseId === base.id) ||
          (profile.baseId === base.id &&
            profile.basePublishedAt.getTime() === available.publishedAt.getTime());
        const skinTone = input.data.skinTone === undefined ? profile.skinTone : input.data.skinTone;
        const topTucked = input.data.topTucked ?? profile.topTucked;
        if (sameBase && profile.skinTone === skinTone &&
            profile.topTucked === topTucked && !input.data.clearClothing)
          return { status: 200 as const };
        // Keep clothes when only changing skin color; no equipment mutation.
        // New universal clothing remains equipped across body changes.
        // Remove only older, anatomy-locked outfit links and any dangling
        // entries. Inventory ownership is never changed.
        if (input.data.clearClothing) {
          // Reset appearance keeps every owned garment in inventory.
          // Clear equipment atomically with the saved base/tone revision.
          await tx.delete(playerAvatarEquipment)
            .where(eq(playerAvatarEquipment.userId, user.id));
        } else if (!sameBase) {
        const worn = await tx.select({
          category: playerAvatarEquipment.category,
          universal: playerClothingDrafts.universal,
        }).from(playerAvatarEquipment)
          .innerJoin(userInventory, eq(userInventory.id, playerAvatarEquipment.inventoryId))
          .innerJoin(playerClothingDrafts,
            eq(playerClothingDrafts.shopItemId, userInventory.shopItemId))
          .where(eq(playerAvatarEquipment.userId, user.id));
        const keepCategories = worn.filter(entry => entry.universal).map(entry => entry.category);
        await tx.delete(playerAvatarEquipment).where(
          keepCategories.length
            ? and(eq(playerAvatarEquipment.userId, user.id),
                notInArray(playerAvatarEquipment.category, keepCategories))
            : eq(playerAvatarEquipment.userId, user.id),
        );
        }
        await tx.update(playerAvatarProfiles).set({
          baseId: base.id,
          basePublishedAt: sameBase ? profile.basePublishedAt : available.publishedAt,
          baseParts: sameBase ? profile.baseParts : available.parts,
          skinTone, topTucked,
          revision: profile.revision + 1, updatedAt: new Date(),
        }).where(eq(playerAvatarProfiles.userId, user.id));
        return { status: 200 as const };
      });
      if (outcome.status !== 200)
        return res.status(outcome.status).json({ message: outcome.message });
      return res.json(await readPlayerAvatar(db, user.id));
    } catch (error) {
      console.error("[player-avatar] base change failed", error);
      return res.status(500).json({ message: "Could not update avatar base" });
    }
  });

  // A player may tuck or untuck an equipped (or future) top at any time.
  // Update only their own profile; protect concurrent appearance/equipment
  // edits with the same revision contract as all other avatar mutations.
  app.patch("/api/player-avatar/tuck", isAuthenticated, async (req, res) => {
    const input = savePlayerAvatarTuckSchema.safeParse(req.body);
    if (!input.success)
      return res.status(400).json({ message: "Invalid tuck preference or avatar revision" });
    const user = req.user as { id: string };
    try {
      const outcome = await db.transaction(async tx => {
        const [profile] = await tx.select().from(playerAvatarProfiles)
          .where(eq(playerAvatarProfiles.userId, user.id)).for("update");
        if (!profile)
          return { status: 404 as const, message: "Create a player avatar first" };
        if (profile.revision !== input.data.expectedRevision)
          return { status: 409 as const, message: "Avatar changed elsewhere. Refresh before saving." };
        if (profile.topTucked !== input.data.topTucked)
          await tx.update(playerAvatarProfiles).set({
            topTucked: input.data.topTucked,
            revision: profile.revision + 1,
            updatedAt: new Date(),
          }).where(eq(playerAvatarProfiles.userId, user.id));
        return { status: 200 as const };
      });
      if (outcome.status !== 200)
        return res.status(outcome.status).json({ message: outcome.message });
      res.set("Cache-Control", "private, no-store");
      return res.json(await readPlayerAvatar(db, user.id));
    } catch (error) {
      console.error("[player-avatar] tuck failed", error);
      return res.status(500).json({ message: "Could not update tuck preference" });
    }
  });

  app.put("/api/player-avatar/equipment/:category", isAuthenticated, async (req, res) => {
    const category = playerClothingCategorySchema.safeParse(req.params.category);
    const input = savePlayerAvatarEquipmentSchema.safeParse(req.body);
    if (!category.success || !input.success)
      return res.status(400).json({ message: "Invalid clothing category, inventory item or avatar revision" });
    const user = req.user as { id: string };
    try {
      const outcome = await db.transaction(async tx => {
        const [profile] = await tx.select().from(playerAvatarProfiles)
          .where(eq(playerAvatarProfiles.userId, user.id)).for("update");
        if (!profile) return { status: 404 as const, message: "Design and save a character before equipping clothing" };
        if (profile.revision !== input.data.expectedRevision)
          return { status: 409 as const, message: "Your avatar changed on another device. Reload and retry." };
        const slot: PlayerClothingCategory = category.data;
        const [existing] = await tx.select().from(playerAvatarEquipment).where(and(
          eq(playerAvatarEquipment.userId, user.id), eq(playerAvatarEquipment.category, slot),
        )).limit(1);

        if (input.data.inventoryId) {
          let [inventory] = await tx.select().from(userInventory).where(and(
            eq(userInventory.id, input.data.inventoryId),
            eq(userInventory.userId, user.id),
          )).for("share");
          if (!inventory) {
            // The free catalog item ID doubles as a virtual inventory ID.
            // Validate its current zero price, published art and universal flag
            // before minting the real per-account inventory row on Equip.
            const [free] = await tx.select({
              shopItemId: shopItems.id, name: shopItems.name,
              category: playerClothingDrafts.publishedCategory,
              segments: playerClothingDrafts.publishedSegments,
              bodyVariants: playerClothingDrafts.publishedBodyVariants,
              colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
            }).from(shopItems)
              .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
              .where(and(eq(shopItems.id, input.data.inventoryId),
                eq(shopItems.type, "clothing"), eq(shopItems.price, 0),
                eq(shopItems.worldId, AVATAR_CLOTHING_UNRELEASED_WORLD),
                eq(playerClothingDrafts.universal, true),
                isNull(playerClothingDrafts.deletedAt))).limit(1);
            const [profileBase] = await tx.select({ name: playerCharacterBases.name })
              .from(playerCharacterBases).where(eq(playerCharacterBases.id, profile.baseId)).limit(1);
            const validated = free ? playerClothingDefinitionSchema.safeParse({
              name: free.name, category: free.category,
              segments: clothingSegmentsForBody(
                free.segments, free.bodyVariants, profileBase?.name),
            }) : null;
            if (!validated?.success || validated.data.category !== slot)
              return { status: 404 as const, message: "This free clothing item is no longer available" };
            const [existingFree] = await tx.select().from(userInventory).where(and(
              eq(userInventory.userId, user.id), eq(userInventory.shopItemId, free!.shopItemId),
              eq(userInventory.isListed, false), gt(userInventory.quantity, 0),
            )).limit(1);
            if (existingFree) inventory = existingFree;
            else [inventory] = await tx.insert(userInventory).values({
              userId: user.id, shopItemId: free!.shopItemId, quantity: 1,
            }).returning();
          }
          if (!inventory) return { status: 404 as const, message: "This clothing item is not in your inventory" };
          const [item] = await tx.select({
            id: shopItems.id, type: shopItems.type, name: shopItems.name,
            category: playerClothingDrafts.publishedCategory, baseId: playerClothingDrafts.baseId,
            basePublishedAt: playerClothingDrafts.basePublishedAt,
            universal: playerClothingDrafts.universal,
            segments: playerClothingDrafts.publishedSegments,
            bodyVariants: playerClothingDrafts.publishedBodyVariants,
            colorPickerEnabled: playerClothingDrafts.colorPickerEnabled,
          }).from(shopItems)
            .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
            .where(and(eq(shopItems.id, inventory.shopItemId), eq(shopItems.type, "clothing"),
              isNull(playerClothingDrafts.deletedAt)))
            .limit(1).for("share");
          const [selectedBase] = await tx.select({ name: playerCharacterBases.name })
            .from(playerCharacterBases).where(eq(playerCharacterBases.id, profile.baseId)).limit(1);
          const published = item ? playerClothingDefinitionSchema.safeParse({
            name: item.name, category: item.category,
            segments: clothingSegmentsForBody(
              item.segments, item.bodyVariants, selectedBase?.name),
          }) : null;
          if (!item || !published?.success || !isEligiblePlayerClothingInventory({
            ownerId: inventory.userId, playerId: user.id, itemType: item.type,
            quantity: inventory.quantity, isListed: inventory.isListed,
            itemCategory: published.data.category, requestedCategory: slot,
            designBaseId: item.baseId, selectedBaseId: profile.baseId,
            designBasePublishedAt: item.basePublishedAt,
            selectedBasePublishedAt: profile.basePublishedAt,
            universal: item.universal,
            publishedSegmentsCount: published.data.segments.length,
          })) return { status: 422 as const, message: "This clothing cannot be equipped: check its slot, ownership and avatar base" };

          if (!playerClothingCanRecolor(slot, item.colorPickerEnabled) && input.data.colorTint)
            return { status: 422 as const, message: "This clothing does not offer a color picker" };
          const colorTint = playerClothingCanRecolor(slot, item.colorPickerEnabled)
            ? (input.data.colorTint === undefined
              ? (existing?.inventoryId === inventory.id ? existing.colorTint : null)
              : input.data.colorTint)
            : null;
          if (existing?.inventoryId === inventory.id) {
            // Keep the original no-op equip behavior, but allow updating only
            // this player's selected tint on an already equipped garment.
            if (existing.colorTint === colorTint) return { status: 200 as const };
          }
          // A previously equipped garment may have been republished in a new
          // wardrobe category. Clear its obsolete slot before the category
          // upsert so the unique (user_id, inventory_id) constraint cannot
          // turn a valid move into a server error. The profile lock makes
          // removal and replacement one atomic revisioned change.
          await tx.delete(playerAvatarEquipment).where(and(
            eq(playerAvatarEquipment.userId, user.id),
            eq(playerAvatarEquipment.inventoryId, inventory.id),
          ));
          await tx.insert(playerAvatarEquipment).values({
            userId: user.id, category: slot, inventoryId: inventory.id, colorTint,
          }).onConflictDoUpdate({
            target: [playerAvatarEquipment.userId, playerAvatarEquipment.category],
            set: { inventoryId: inventory.id, colorTint, equippedAt: new Date() },
          });
        } else {
          if (!existing) return { status: 200 as const };
          await tx.delete(playerAvatarEquipment).where(and(
            eq(playerAvatarEquipment.userId, user.id), eq(playerAvatarEquipment.category, slot),
          ));
        }
        await tx.update(playerAvatarProfiles).set({
          revision: profile.revision + 1, updatedAt: new Date(),
        }).where(eq(playerAvatarProfiles.userId, user.id));
        return { status: 200 as const };
      });
      if (outcome.status !== 200)
        return res.status(outcome.status).json({ message: outcome.message });
      return res.json(await readPlayerAvatar(db, user.id));
    } catch (error) {
      console.error("[player-avatar] equipment update failed", error);
      return res.status(500).json({ message: "Could not update avatar clothing" });
    }
  });
}
