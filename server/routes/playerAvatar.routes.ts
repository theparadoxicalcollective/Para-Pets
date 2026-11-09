import type { Express, RequestHandler } from "express";
import { and, eq, gt } from "drizzle-orm";
import type { db as database } from "../db";
import {
  playerAvatarProfiles, playerAvatarEquipment, playerCharacterBases,
  playerClothingDrafts, shopItems, userInventory,
} from "@shared/schema";
import {
  completePlayerCharacterParts, resolvePlayerCharacterParts,
} from "@shared/playerCharacter";
import {
  playerClothingDefinitionSchema, type PlayerClothingCategory,
} from "@shared/playerCharacterClothing";
import {
  changePlayerAvatarBaseSchema, createPlayerAvatarSchema,
  isEligiblePlayerClothingInventory, playerClothingCategorySchema,
  savePlayerAvatarEquipmentSchema,
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
  if (!base?.publishedAt || !base.publishedParts ||
      !completePlayerCharacterParts(base.publishedParts)) return null;
  return {
    id: base.id, name: base.name, parts: resolvePlayerCharacterParts(base.publishedParts),
    publishedAt: base.publishedAt,
  };
}

async function readPlayerAvatar(db: Db, userId: string) {
  const [profile] = await db.select().from(playerAvatarProfiles)
    .where(eq(playerAvatarProfiles.userId, userId)).limit(1);

  const [baseRow] = profile
    ? await db.select({ id: playerCharacterBases.id, name: playerCharacterBases.name })
        .from(playerCharacterBases).where(eq(playerCharacterBases.id, profile.baseId)).limit(1)
    : await db.select().from(playerCharacterBases)
        .where(eq(playerCharacterBases.isDefault, true)).limit(1);

  const previewBase = !profile && baseRow
    ? await loadPublishedBase(db, baseRow.id)
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
    name: shopItems.name,
    category: playerClothingDrafts.publishedCategory,
    baseId: playerClothingDrafts.baseId,
    basePublishedAt: playerClothingDrafts.basePublishedAt,
    segments: playerClothingDrafts.publishedSegments,
  }).from(userInventory)
    .innerJoin(shopItems, eq(userInventory.shopItemId, shopItems.id))
    .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
    .where(and(
      eq(userInventory.userId, userId), eq(shopItems.type, "clothing"),
      gt(userInventory.quantity, 0),
    ));

  const ownedClothing = ownedRows.flatMap(item => {
    const parsed = playerClothingDefinitionSchema.safeParse({
      name: item.name, category: item.category, segments: item.segments,
    });
    if (!parsed.success) return [];
    const compatible = !!activeBase && isEligiblePlayerClothingInventory({
      ownerId: item.ownerId, playerId: userId, itemType: item.itemType,
      quantity: item.quantity, isListed: item.isListed,
      itemCategory: parsed.data.category, requestedCategory: parsed.data.category,
      designBaseId: item.baseId, selectedBaseId: activeBase.id,
      designBasePublishedAt: item.basePublishedAt,
      selectedBasePublishedAt: activeBase.publishedAt,
      publishedSegmentsCount: parsed.data.segments.length,
    });
    return [{
      inventoryId: item.inventoryId, shopItemId: item.shopItemId,
      name: item.name, imageUrl: item.imageUrl, category: parsed.data.category,
      quantity: item.quantity, isListed: item.isListed,
      compatible, segments: parsed.data.segments,
    }];
  });

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
          segments: item.segments }]
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
        if (!base?.publishedAt || !base.publishedParts ||
            !completePlayerCharacterParts(base.publishedParts))
          return { status: 422 as const, message: "This avatar base is not published or complete" };

        const [created] = await tx.insert(playerAvatarProfiles).values({
          userId: user.id, baseId: base.id, basePublishedAt: base.publishedAt,
          baseParts: resolvePlayerCharacterParts(base.publishedParts),
        }).onConflictDoNothing().returning();

        if (created) return { status: 201 as const };
        const [already] = await tx.select({ baseId: playerAvatarProfiles.baseId })
          .from(playerAvatarProfiles).where(eq(playerAvatarProfiles.userId, user.id)).limit(1);
        if (already?.baseId !== base.id)
          return { status: 409 as const, message: "You already created a different avatar. Use Change Base." };
        // Retried POST for the same avatar should not duplicate/reset progress.
        return { status: 200 as const };
      });
      if (outcome.status === 422 || outcome.status === 409)
        return res.status(outcome.status).json({ message: outcome.message });
      return res.status(outcome.status).json(await readPlayerAvatar(db, user.id));
    } catch (error) {
      console.error("[player-avatar] create failed", error);
      return res.status(500).json({ message: "Could not create player avatar" });
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
        if (!base?.publishedAt || !base.publishedParts ||
            !completePlayerCharacterParts(base.publishedParts))
          return { status: 422 as const, message: "This avatar base is not published or complete" };

        if (profile.baseId === base.id &&
            profile.basePublishedAt.getTime() === base.publishedAt.getTime())
          return { status: 200 as const };
        // Different base anatomy invalidates old fitted clothing. Preserve
        // the inventory items; remove only equipment links atomically.
        await tx.delete(playerAvatarEquipment)
          .where(eq(playerAvatarEquipment.userId, user.id));
        await tx.update(playerAvatarProfiles).set({
          baseId: base.id, basePublishedAt: base.publishedAt,
          baseParts: resolvePlayerCharacterParts(base.publishedParts),
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
          const [inventory] = await tx.select().from(userInventory).where(and(
            eq(userInventory.id, input.data.inventoryId),
            eq(userInventory.userId, user.id),
          )).for("share");
          if (!inventory) return { status: 404 as const, message: "This clothing item is not in your inventory" };
          const [item] = await tx.select({
            id: shopItems.id, type: shopItems.type, name: shopItems.name,
            category: playerClothingDrafts.publishedCategory, baseId: playerClothingDrafts.baseId,
            basePublishedAt: playerClothingDrafts.basePublishedAt,
            segments: playerClothingDrafts.publishedSegments,
          }).from(shopItems)
            .innerJoin(playerClothingDrafts, eq(playerClothingDrafts.shopItemId, shopItems.id))
            .where(and(eq(shopItems.id, inventory.shopItemId), eq(shopItems.type, "clothing")))
            .limit(1);
          const published = item ? playerClothingDefinitionSchema.safeParse({
            name: item.name, category: item.category, segments: item.segments,
          }) : null;
          if (!item || !published?.success || !isEligiblePlayerClothingInventory({
            ownerId: inventory.userId, playerId: user.id, itemType: item.type,
            quantity: inventory.quantity, isListed: inventory.isListed,
            itemCategory: published.data.category, requestedCategory: slot,
            designBaseId: item.baseId, selectedBaseId: profile.baseId,
            designBasePublishedAt: item.basePublishedAt,
            selectedBasePublishedAt: profile.basePublishedAt,
            publishedSegmentsCount: published.data.segments.length,
          })) return { status: 422 as const, message: "This clothing cannot be equipped: check its slot, ownership and avatar base" };

          if (existing?.inventoryId === inventory.id) return { status: 200 as const };
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
            userId: user.id, category: slot, inventoryId: inventory.id,
          }).onConflictDoUpdate({
            target: [playerAvatarEquipment.userId, playerAvatarEquipment.category],
            set: { inventoryId: inventory.id, equippedAt: new Date() },
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
