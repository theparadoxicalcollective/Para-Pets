import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { requireAuthenticated } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import { petTemplateParts, shopItems, userInventory, users } from "@shared/schema";
import {
  petCostumeDefinitions,
  petCostumeSlotUnlocks,
  petEquippedCostumes,
} from "@shared/costumeSchema";
import {
  COSTUME_SLOT_COUNT,
  getCostumeSlotUnlockCost,
  getUnlockedCostumeSlotCount,
  normalizeCostumePlacements,
} from "@shared/costumeFeature";

async function ownedPet(petInventoryId: string, userId: string) {
  const pet = await storage.getInventoryItemById(petInventoryId);
  if (!pet || pet.userId !== userId) return null;
  const item = await storage.getShopItem(pet.shopItemId);
  if (!item || item.type !== "pet") return null;
  return { pet, item };
}

export function registerCostumePlayerRoutes(app: Express) {
  app.get("/api/user/equipped-costume-counts", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string };
      const rows = await db.select({
        id: petEquippedCostumes.costumeInventoryId,
        count: sql<number>`count(*)::int`,
      })
        .from(petEquippedCostumes)
        .innerJoin(userInventory, eq(userInventory.id, petEquippedCostumes.petInventoryId))
        .where(eq(userInventory.userId, user.id))
        .groupBy(petEquippedCostumes.costumeInventoryId);
      return res.json(Object.fromEntries(rows.map((row) => [row.id, Number(row.count)])));
    } catch (error) {
      console.error("[costumes] equipped counts failed", error);
      return res.status(500).json({ message: "Failed to load equipped costumes" });
    }
  });

  app.get("/api/pet/:petInventoryId/costumes/public", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const petInventoryId = String(req.params.petInventoryId);
      const pet = await storage.getInventoryItemById(petInventoryId);
      if (!pet || !pet.isHatched) return res.status(404).json({ message: "Pet not found" });
      const item = await storage.getShopItem(pet.shopItemId);
      if (!item || item.type !== "pet" || !item.petTemplateId) {
        return res.status(404).json({ message: "Pet costume display not found" });
      }

      const equipped = await db.select({
        id: petEquippedCostumes.id,
        slot: petEquippedCostumes.slot,
        copyIndex: petEquippedCostumes.copyIndex,
        costumeInventoryId: petEquippedCostumes.costumeInventoryId,
        name: shopItems.name,
        imageUrl: shopItems.imageUrl,
        placements: petCostumeDefinitions.placements,
      }).from(petEquippedCostumes)
        .innerJoin(userInventory, eq(userInventory.id, petEquippedCostumes.costumeInventoryId))
        .innerJoin(shopItems, eq(shopItems.id, userInventory.shopItemId))
        .innerJoin(petCostumeDefinitions, and(
          eq(petCostumeDefinitions.shopItemId, shopItems.id),
          eq(petCostumeDefinitions.templateId, item.petTemplateId),
        ))
        .where(eq(petEquippedCostumes.petInventoryId, petInventoryId));

      const anchors = await db.select({
        partType: petTemplateParts.partType,
        posX: petTemplateParts.posX,
        posY: petTemplateParts.posY,
        width: petTemplateParts.width,
        height: petTemplateParts.height,
        pivotX: petTemplateParts.pivotX,
        pivotY: petTemplateParts.pivotY,
      }).from(petTemplateParts).where(and(
        eq(petTemplateParts.templateId, item.petTemplateId),
        eq(petTemplateParts.view, "front"),
      ));

      return res.json({
        equipped: equipped.map((costume) => ({ ...costume, placements: normalizeCostumePlacements(costume.placements) })),
        anchors,
        extraSlots: 0,
      });
    } catch (error) {
      console.error("[costumes] public display load failed", error);
      return res.status(500).json({ message: "Failed to load displayed pet costumes" });
    }
  });

  app.get("/api/pet/:petInventoryId/costumes", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string };
      const petInventoryId = String(req.params.petInventoryId);
      const target = await ownedPet(petInventoryId, user.id);
      if (!target) return res.status(404).json({ message: "Pet not found" });
      if (!target.item.petTemplateId) return res.status(400).json({ message: "This pet cannot wear costumes yet" });

      const [unlock] = await db.select().from(petCostumeSlotUnlocks)
        .where(eq(petCostumeSlotUnlocks.petInventoryId, petInventoryId))
        .limit(1);
      const equipped = await db.select({
        id: petEquippedCostumes.id,
        slot: petEquippedCostumes.slot,
        copyIndex: petEquippedCostumes.copyIndex,
        costumeInventoryId: petEquippedCostumes.costumeInventoryId,
        name: shopItems.name,
        imageUrl: shopItems.imageUrl,
        placements: petCostumeDefinitions.placements,
      }).from(petEquippedCostumes)
        .innerJoin(userInventory, eq(userInventory.id, petEquippedCostumes.costumeInventoryId))
        .innerJoin(shopItems, eq(shopItems.id, userInventory.shopItemId))
        .innerJoin(petCostumeDefinitions, and(
          eq(petCostumeDefinitions.shopItemId, shopItems.id),
          eq(petCostumeDefinitions.templateId, target.item.petTemplateId),
        ))
        .where(eq(petEquippedCostumes.petInventoryId, petInventoryId));

      const anchors = await db.select({
        partType: petTemplateParts.partType,
        posX: petTemplateParts.posX,
        posY: petTemplateParts.posY,
        width: petTemplateParts.width,
        height: petTemplateParts.height,
        pivotX: petTemplateParts.pivotX,
        pivotY: petTemplateParts.pivotY,
      }).from(petTemplateParts).where(and(
        eq(petTemplateParts.templateId, target.item.petTemplateId),
        eq(petTemplateParts.view, "front"),
      ));

      return res.json({
        equipped: equipped.map((costume) => ({ ...costume, placements: normalizeCostumePlacements(costume.placements) })),
        anchors,
        extraSlots: unlock?.extraSlots ?? 0,
      });
    } catch (error) {
      console.error("[costumes] player load failed", error);
      return res.status(500).json({ message: "Failed to load pet costumes" });
    }
  });

  app.post("/api/pet/:petInventoryId/costumes/equip", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string };
      const petInventoryId = String(req.params.petInventoryId);
      const costumeInventoryId = typeof req.body?.costumeInventoryId === "string" ? req.body.costumeInventoryId : "";
      const slot = Number(req.body?.slot);
      if (!costumeInventoryId || !Number.isInteger(slot) || slot < 1 || slot > COSTUME_SLOT_COUNT) {
        return res.status(400).json({ message: "A valid costume and slot are required" });
      }

      const target = await ownedPet(petInventoryId, user.id);
      if (!target) return res.status(404).json({ message: "Pet not found" });
      if (!target.pet.isHatched) return res.status(400).json({ message: "Pet has not hatched yet" });
      if (!target.item.petTemplateId) return res.status(400).json({ message: "This pet cannot wear costumes yet" });
      const templateId = target.item.petTemplateId;

      const equipped = await db.transaction(async (tx) => {
        const [lockedPet] = await tx.select({ id: userInventory.id }).from(userInventory)
          .where(and(eq(userInventory.id, petInventoryId), eq(userInventory.userId, user.id)))
          .for("update");
        if (!lockedPet) throw new Error("Pet not found");

        const [costumeInventory] = await tx.select().from(userInventory)
          .where(and(eq(userInventory.id, costumeInventoryId), eq(userInventory.userId, user.id)))
          .for("update");
        if (!costumeInventory) throw new Error("Costume not found");
        if (costumeInventory.isListed) throw new Error("Remove this costume from the marketplace before equipping it");
        const [costumeItem] = await tx.select().from(shopItems)
          .where(eq(shopItems.id, costumeInventory.shopItemId)).limit(1);
        if (!costumeItem || costumeItem.type !== "costume") throw new Error("Item is not a costume");

        const [unlock] = await tx.select().from(petCostumeSlotUnlocks)
          .where(eq(petCostumeSlotUnlocks.petInventoryId, petInventoryId)).limit(1);
        if (slot > getUnlockedCostumeSlotCount(unlock?.extraSlots ?? 0)) throw new Error("That costume slot is locked");

        const [definition] = await tx.select({
          id: petCostumeDefinitions.id,
          placements: petCostumeDefinitions.placements,
        })
          .from(petCostumeDefinitions).where(and(
            eq(petCostumeDefinitions.shopItemId, costumeItem.id),
            eq(petCostumeDefinitions.templateId, templateId),
          )).limit(1);
        if (!definition) throw new Error("This costume has not been fitted for this pet yet");

        const requestedPlacements = normalizeCostumePlacements(definition.placements);
        if (requestedPlacements.length === 0) throw new Error("This costume fitting is incomplete");
        const requestedLayers = new Set(requestedPlacements.filter(placement => placement.anchorPart !== "independent").map((placement) => placement.anchorPart));
        const equippedLayers = await tx.select({
          name: shopItems.name,
          placements: petCostumeDefinitions.placements,
        }).from(petEquippedCostumes)
          .innerJoin(userInventory, eq(userInventory.id, petEquippedCostumes.costumeInventoryId))
          .innerJoin(shopItems, eq(shopItems.id, userInventory.shopItemId))
          .innerJoin(petCostumeDefinitions, and(
            eq(petCostumeDefinitions.shopItemId, shopItems.id),
            eq(petCostumeDefinitions.templateId, templateId),
          ))
          .where(eq(petEquippedCostumes.petInventoryId, petInventoryId));
        const layerConflict = equippedLayers.find((equippedCostume) =>
          normalizeCostumePlacements(equippedCostume.placements)
            .some((placement) => requestedLayers.has(placement.anchorPart))
        );
        if (layerConflict) {
          throw new Error(`Unequip ${layerConflict.name} before equipping another costume on the same pet layer`);
        }

        const existingCopies = await tx.select({ copyIndex: petEquippedCostumes.copyIndex })
          .from(petEquippedCostumes)
          .where(eq(petEquippedCostumes.costumeInventoryId, costumeInventoryId));
        const usedCopies = new Set(existingCopies.map((row) => row.copyIndex));
        let copyIndex = 0;
        while (usedCopies.has(copyIndex)) copyIndex += 1;
        if (copyIndex >= costumeInventory.quantity) throw new Error("Every copy in this costume stack is already equipped");

        const [occupied] = await tx.select().from(petEquippedCostumes)
          .where(and(eq(petEquippedCostumes.petInventoryId, petInventoryId), eq(petEquippedCostumes.slot, slot)))
          .limit(1);
        if (occupied) throw new Error("That costume slot is already occupied");

        const [inserted] = await tx.insert(petEquippedCostumes).values({
          petInventoryId, costumeInventoryId, copyIndex, slot,
        }).returning();
        return inserted;
      });
      return res.json({ equipped });
    } catch (error: any) {
      console.error("[costumes] equip failed", error);
      return res.status(400).json({ message: error?.message || "Failed to equip costume" });
    }
  });

  app.post("/api/pet/:petInventoryId/costumes/unequip", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string };
      const petInventoryId = String(req.params.petInventoryId);
      const equippedCostumeId = typeof req.body?.equippedCostumeId === "string" ? req.body.equippedCostumeId : "";
      if (!equippedCostumeId) return res.status(400).json({ message: "Costume is required" });
      if (!await ownedPet(petInventoryId, user.id)) return res.status(404).json({ message: "Pet not found" });

      const [removed] = await db.delete(petEquippedCostumes).where(and(
        eq(petEquippedCostumes.petInventoryId, petInventoryId),
        eq(petEquippedCostumes.id, equippedCostumeId),
      )).returning();
      if (!removed) return res.status(404).json({ message: "Costume is not equipped on this pet" });
      return res.json({ success: true });
    } catch (error) {
      console.error("[costumes] unequip failed", error);
      return res.status(500).json({ message: "Failed to unequip costume" });
    }
  });

  app.post("/api/pet/:petInventoryId/costumes/unlock", requireAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as { id: string };
      const petInventoryId = String(req.params.petInventoryId);
      if (!await ownedPet(petInventoryId, user.id)) return res.status(404).json({ message: "Pet not found" });

      const result = await db.transaction(async (tx) => {
        const [account] = await tx.select({ coins: users.coins }).from(users)
          .where(eq(users.id, user.id)).for("update");
        if (!account) throw new Error("Player not found");

        const [unlock] = await tx.select().from(petCostumeSlotUnlocks)
          .where(eq(petCostumeSlotUnlocks.petInventoryId, petInventoryId))
          .limit(1);
        const extraSlots = unlock?.extraSlots ?? 0;
        const unlockedCount = getUnlockedCostumeSlotCount(extraSlots);
        if (unlockedCount >= COSTUME_SLOT_COUNT) throw new Error("All costume slots are already unlocked");
        const cost = getCostumeSlotUnlockCost(unlockedCount + 1);
        if (account.coins < cost) throw new Error("Not enough coins");

        const [updatedUser] = await tx.update(users)
          .set({ coins: sql`${users.coins} - ${cost}` })
          .where(eq(users.id, user.id))
          .returning({ coins: users.coins });
        if (!updatedUser) throw new Error("Could not update player coins");
        await tx.insert(petCostumeSlotUnlocks).values({
          petInventoryId,
          extraSlots: extraSlots + 1,
        }).onConflictDoUpdate({
          target: petCostumeSlotUnlocks.petInventoryId,
          set: { extraSlots: extraSlots + 1, updatedAt: new Date() },
        });
        return { extraSlots: extraSlots + 1, coins: updatedUser.coins, cost };
      });
      return res.json(result);
    } catch (error: any) {
      const message = error?.message || "Failed to unlock costume slot";
      const status = message === "Not enough coins" || message.includes("already unlocked") ? 400 : 500;
      return res.status(status).json({ message });
    }
  });
}

