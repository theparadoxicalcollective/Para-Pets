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
  playerClothingDefinitionSchema, clothingSegmentsForBody,
  type PlayerClothingCategory,
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
    name: shopItems.name,
    category: playerClothingDrafts.publishedCategory,
    baseId: playerClothingDrafts.baseId,
    basePublishedAt: playerClothingDrafts.basePublishedAt,
    universal: playerClothingDrafts.universal,
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
      name: item.name, imageUrl: item.imageUrl, category: parsed.data.category,
      quantity: item.quantity, isListed: item.isListed,
      compatible, universal: item.universal, free: false, segments: parsed.data.segments,
      bodyVariants: item.bodyVariants,
    }];
  });

  // Free universal clothing is a live catalog entitlement for EVERY player,
  // including newly registered accounts. No bulk insertion into user_inventory
  // and no side effects on GET; the first Equip materializes ownership safely.
  const freeRows = await db.select({
    shopItemId: shopItems.id, name: shopItems.name, imageUrl: shopItems.imageUrl,
    category: playerClothingDrafts.publishedCategory,
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
      name: item.name, imageUrl: item.imageUrl, category: parsed.data.category,
      quantity: 1, isListed: false, compatible: true, universal: true,
      free: true, segments: parsed.data.segments,
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
          segments: item.segments, bodyVariants: item.bodyVariants }]
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

        const [created] = await tx.insert(playerAvatarProfiles).values({
          userId: user.id, baseId: base.id, basePublishedAt: available.publishedAt,
          baseParts: available.parts,
          skinTone: input.data.skinTone ?? null,
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
        const available = base ? availablePlayerCharacterBody(base) : null;
        if (!base || !available)
          return { status: 422 as const, message: "Save all eight body parts before selecting this character" };

        const sameBase = (input.data.keepSnapshot === true && profile.baseId === base.id) ||
          (profile.baseId === base.id &&
            profile.basePublishedAt.getTime() === available.publishedAt.getTime());
        const skinTone = input.data.skinTone === undefined ? profile.skinTone : input.data.skinTone;
        if (sameBase && profile.skinTone === skinTone && !input.data.clearClothing)
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
          skinTone,
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
